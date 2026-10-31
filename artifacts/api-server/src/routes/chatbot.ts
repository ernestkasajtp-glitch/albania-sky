import { Router, type RequestHandler } from "express";
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, agentsTable, flightsTable, settingsTable } from "@workspace/db";
import { getFlightVisibilityForAgent, bookingEngineVisibilityConds } from "../lib/flightVisibility";
import { getActiveRulesForAgent, getAgentRoundWhole, agentUnitPrice, type AgentPricing } from "../lib/priceRules";
import { readFlightDiscounts, discountForChannel, applyFlightDiscount } from "../lib/flightDiscounts";
import { getSellCutoffHours, getConfirmedSellCutoffHours, isSaleOpenForFlight } from "./public";
import { roundWholeEuro } from "../lib/money";
import { CHATBOT_AGENT_ID, CHATBOT_SETTING, hashChatbotKey, matchesChatbotKey, parseChatbotSearch, createChatbotBudget } from "../lib/chatbotPolicy";
import { chatbotAdminHtml } from "../lib/chatbotAdminHtml";
import { chatbotOpenApi } from "../lib/chatbotOpenApi";

export const chatbotRouter = Router();
const router = chatbotRouter;
const authBudget = createChatbotBudget(300);
const searchBudget = createChatbotBudget(30);
let activeSearches = 0;
async function config() {
  const [row] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, CHATBOT_SETTING));
  if (!row?.value) return null;
  try {
    const c = JSON.parse(row.value);
    return c.agentId === CHATBOT_AGENT_ID && typeof c.hash === "string" ? c : null;
  } catch { return null; }
}
const admin: RequestHandler = (req, res, next) => {
  res.set({ "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
  if (req.session?.role !== "admin") { res.status(403).json({error:"Vetëm administratori. Hyni në panelin e brendshëm fillimisht."}); return; }
  if (!["GET", "HEAD"].includes(req.method)) {
    let sameOrigin = false;
    try { sameOrigin = new URL(req.get("origin") || "").host === req.get("host"); } catch {}
    if (!sameOrigin || req.get("X-Chatbot-Admin") !== "1") { res.status(403).json({error:"Invalid origin"}); return; }
  }
  next();
};
router.get("/chatbot/admin", admin, (_req, res) => { res.type("html").send(chatbotAdminHtml); });
router.get("/chatbot/openapi.json", (_req, res) => { res.json(chatbotOpenApi); });
router.get("/chatbot/credential", admin, async (_req, res) => { res.json({ enabled: !!await config(), agency: "KINGS NESTI" }); });
router.post("/chatbot/credential", admin, async (_req, res) => {
  const [agent] = await db.select({status:agentsTable.status}).from(agentsTable).where(eq(agentsTable.id, CHATBOT_AGENT_ID));
  if (agent?.status !== "active") { res.status(409).json({error:"Agjencia nuk është aktive"}); return; }
  const key = "nsk_" + randomBytes(32).toString("hex");
  const value = JSON.stringify({agentId:CHATBOT_AGENT_ID, hash:hashChatbotKey(key)});
  await db.insert(settingsTable).values({key:CHATBOT_SETTING,value})
    .onConflictDoUpdate({target:settingsTable.key,set:{value,updatedAt:new Date()}});
  res.json({api_key:key});
});
router.delete("/chatbot/credential", admin, async (_req, res) => {
  await db.delete(settingsTable).where(eq(settingsTable.key, CHATBOT_SETTING));
  res.json({enabled:false});
});
router.post("/chatbot/v1/flights/search", async (req, res) => {
  res.set("Cache-Control","no-store");
  const error = (status:number, code:string, message:string) => { res.status(status).json({error:{code,message}}); };
  const retry = authBudget();
  if (retry) { res.set("Retry-After",String(retry)); error(429,"RATE_LIMITED","Retry after the indicated seconds"); return; }
  try {
    const c = await config();
    const key = req.get("authorization")?.match(/^Bearer (nsk_[a-f0-9]{64})$/)?.[1] ?? "";
    if (!c || !matchesChatbotKey(key,c.hash)) { error(401,"UNAUTHORIZED","Invalid or missing Bearer credential"); return; }
    const wait = searchBudget();
    if (wait) { res.set("Retry-After",String(wait)); error(429,"RATE_LIMITED","Maximum 30 requests per minute"); return; }
    const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id,c.agentId));
    if (!agent || agent.status !== "active" || !agent.groupId) { error(403,"AGENCY_UNAVAILABLE","Agency is inactive or has no access group"); return; }
    const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Tirane",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    let input;
    try { input = parseChatbotSearch(req.body,today); }
    catch(e) { error(400,"INVALID_REQUEST",(e as Error).message); return; }
    if (activeSearches >= 2) { res.set("Retry-After","2"); error(429,"BUSY","Two searches are already in progress"); return; }
    activeSearches++;
    try {
      const [access,rules,roundWhole,cutoff,confirmedCutoff] = await Promise.all([
        getFlightVisibilityForAgent(agent.id,agent.seesHiddenFlights === true),
        getActiveRulesForAgent(agent.id),getAgentRoundWhole(),getSellCutoffHours(),getConfirmedSellCutoffHours(),
      ]);
      const pricing:AgentPricing = {
        agentId:agent.id,rules,roundWhole,discountType:agent.discountType ?? "percent",
        discountPercent:Number(agent.discountPercent ?? 0),discountFixed:Number(agent.discountFixed ?? 0),
        markup:Number(agent.markup ?? 0),markupPercent:Number(agent.markupPercent ?? 0),
      };
      const segment = async (from:string,to:string,date:string) => {
        const candidates = await db.select().from(flightsTable).where(and(
          eq(flightsTable.status,"open"),...bookingEngineVisibilityConds(access),
          eq(flightsTable.fromCity,from),eq(flightsTable.toCity,to),eq(flightsTable.departureDate,date),
          eq(flightsTable.externalSalesBlocked,false),
          sql`${flightsTable.totalSeats} - ${flightsTable.soldSeats} >= ${input.adults + input.children}`,
        )).orderBy(flightsTable.departureTime).limit(501);
        if (candidates.length > 500) throw new Error("CHATBOT_RESULT_LIMIT");
        const available = candidates.filter(f=>isSaleOpenForFlight(f,cutoff,confirmedCutoff));
        const discounts = await readFlightDiscounts(available.map(f=>f.id));
        return available.map(f=>{
          const discount = discountForChannel(discounts.get(f.id) ?? null,"agents");
          const unit = (base:string) => roundWholeEuro(applyFlightDiscount(agentUnitPrice(Number(base),f,pricing).price,discount));
          const adult = unit(f.adultPrice), child = unit(f.childPrice), infant = unit(f.infantPrice);
          const tax = roundWholeEuro(Number(f.tax));
          const tickets = adult*input.adults + child*input.children + infant*input.infants;
          const taxes = tax*(input.adults+input.children+input.infants);
          // Explicit allowlist: no passenger, account, base fare, net or internal fields.
          return {
            id:f.id,airline:f.airline,flight_number:f.flightNumber,from:f.fromCity,to:f.toCity,
            departure_date:f.departureDate,departure_time:f.departureTime,arrival_date:f.arrivalDate,arrival_time:f.arrivalTime,
            time_zone:"Europe/Tirane",available_seats:f.totalSeats-f.soldSeats,
            pricing:{currency:"EUR",basis:"agency_portal",adult_ticket:adult,child_ticket:child,infant_ticket:infant,
              tax_per_passenger:tax,tickets_total:tickets,taxes_total:taxes,total: tickets+taxes,extras_included:false},
            baggage:{cabin_kg:f.cabinBaggageKg == null ? null : Number(f.cabinBaggageKg),
              checked_count:f.checkedBaggageCount,checked_kg:f.checkedBaggageKg == null ? null : Number(f.checkedBaggageKg),
              checked_price:f.checkedBaggagePrice == null ? null : Number(f.checkedBaggagePrice)},
          };
        });
      };
      const outbound = await segment(input.from,input.to,input.departure_date);
      const inbound = input.return_date ? await segment(input.to,input.from,input.return_date) : [];
      res.json({agency:"KINGS NESTI",currency:"EUR",generated_at:new Date().toISOString(),request:input,
        outbound,inbound,notice:"Live availability, not a reservation or guaranteed fare. Extras are not included. Round trips are independent segments."});
    } finally { activeSearches--; }
  } catch(e) {
    req.log?.error({err:e},"Chatbot search failed");
    error(503,"SEARCH_UNAVAILABLE","Search temporarily unavailable; retry later");
  }
});
