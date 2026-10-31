import { db, priceRulesTable, bookingUsersTable, agentsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { PriceRule, PriceRuleTier } from "@workspace/db";
import { roundWholeEuro } from "./money.js";

// Minimal flight shape needed to match a rule against a flight.
export type FlightLike = {
  id: number;
  fromCity: string;
  toCity: string;
  airline: string;
  departureDate: string; // YYYY-MM-DD
};

// Pricing context resolved for the current request/agent.
export type AgentPricing = {
  agentId: number | null;
  rules: PriceRule[]; // active rules assigned to this agent (empty if none)
  discountType: string; // legacy flat discount
  discountPercent: number;
  discountFixed: number;
  markup: number; // flat € markup per ticket
  markupPercent: number; // percentage margin of base price per ticket
// Compatibility field; all newly created pricing is whole-euro by policy.
  roundWhole?: boolean;
  // Website markup applied ONLY to NOT-logged-in visitors (guests) on the
  // public booking-engine. Folded on top of the base price. It is set ONLY in
  // the guest branch of resolveAgentPricing (agentId stays null), so agent and
  // logged-in pricing are never affected. type: "percent" | "fixed".
  guestMarkupType?: "percent" | "fixed";
  guestMarkupValue?: number;
  // When true, this agent may see Booking-Engine flights marked "Fshehur"
  // (show_in_booking_engine = false). Default false (guests + normal agents).
  seesHiddenFlights?: boolean;
};

export const NO_AGENT_PRICING: AgentPricing = {
  agentId: null,
  rules: [],
  discountType: "percent",
  discountPercent: 0,
  discountFixed: 0,
  markup: 0,
  markupPercent: 0,
};

// ── Agent price rounding setting (whole euro vs exact 2 decimals) ──────────
const AGENT_ROUND_WHOLE_KEY = "agent_price_round_whole";

// Default ON (true) to preserve the historic whole-euro behavior.
export async function getAgentRoundWhole(): Promise<boolean> {
  return true;
}

export async function setAgentRoundWhole(value: boolean): Promise<void> {
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, AGENT_ROUND_WHOLE_KEY));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value: "true", updatedAt: new Date() }).where(eq(settingsTable.key, AGENT_ROUND_WHOLE_KEY));
  } else {
    await db.insert(settingsTable).values({ key: AGENT_ROUND_WHOLE_KEY, value: "true" });
  }
}

// ── Guest website markup (vetëm vizitorët e paregjistruar / pa login) ─────────
const GUEST_MARKUP_TYPE_KEY = "guest_markup_type";   // "percent" | "fixed"
const GUEST_MARKUP_VALUE_KEY = "guest_markup_value"; // numeric string; 0 = pa ndryshim

async function upsertSetting(key: string, value: string): Promise<void> {
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value, updatedAt: new Date() }).where(eq(settingsTable.key, key));
  } else {
    await db.insert(settingsTable).values({ key, value });
  }
}

// Default = percent / 0  → asnjë ndryshim (vizitori sheh çmimin bazë).
export async function getGuestMarkup(): Promise<{ type: "percent" | "fixed"; value: number }> {
  const t = await db.select().from(settingsTable).where(eq(settingsTable.key, GUEST_MARKUP_TYPE_KEY));
  const v = await db.select().from(settingsTable).where(eq(settingsTable.key, GUEST_MARKUP_VALUE_KEY));
  const type = t[0]?.value === "fixed" ? "fixed" : "percent";
  const value = Math.max(0, Number(v[0]?.value ?? 0) || 0);
  return { type, value };
}

export async function setGuestMarkup(type: "percent" | "fixed", value: number): Promise<void> {
  await upsertSetting(GUEST_MARKUP_TYPE_KEY, type === "fixed" ? "fixed" : "percent");
  await upsertSetting(GUEST_MARKUP_VALUE_KEY, String(Math.max(0, Number(value) || 0)));
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Rrumbullakos çmimin final të agjentit në euro të plotë (më i afërt).
// Përdoret vetëm për çmimin per-njësi të agjentit, që çmimi i shfaqur ==
// çmimi i paguar == ticketPrice i ruajtur të mbeten identikë (pa mospërputhje).
function rWhole(n: number): number {
  return Math.round(n);
}

// Fetch active price rules assigned to a given agent, ordered by id (first match wins).
export async function getActiveRulesForAgent(agentId: number): Promise<PriceRule[]> {
  const all = await db
    .select()
    .from(priceRulesTable)
    .where(eq(priceRulesTable.active, true))
    .orderBy(priceRulesTable.id);
  return all.filter((rule) => {
    const ids = Array.isArray(rule.agentIds) ? (rule.agentIds as number[]) : [];
    return ids.includes(agentId);
  });
}

// Resolve full agent pricing context from a booking-engine session.
export async function resolveAgentPricing(req: any): Promise<AgentPricing> {
  const userId = req?.session?.userId;
  if (!userId) {
    // VIZITOR i paregjistruar (pa login) → çmim bazë + markup-i opsional i faqes.
    const gm = await getGuestMarkup();
    if (gm.value > 0) return { ...NO_AGENT_PRICING, guestMarkupType: gm.type, guestMarkupValue: gm.value };
    return NO_AGENT_PRICING;
  }
  // I loguar por jo agjent (klient i regjistruar) → çmim bazë, PA markup-in e vizitorit.
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user?.agentId) return NO_AGENT_PRICING;
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, user.agentId));
  // Preserve the agent identity so Booking Engine visibility fails closed
  // rather than treating a dangling agency reference as a guest.
  if (!agent) return { ...NO_AGENT_PRICING, agentId: user.agentId };
  const rules = await getActiveRulesForAgent(agent.id);
  return {
    agentId: agent.id,
    rules,
    discountType: agent.discountType ?? "percent",
    discountPercent: Number(agent.discountPercent ?? 0),
    discountFixed: Number(agent.discountFixed ?? 0),
    markup: Number(agent.markup ?? 0),
    markupPercent: Number(agent.markupPercent ?? 0),
    roundWhole: await getAgentRoundWhole(),
    seesHiddenFlights: agent.seesHiddenFlights === true,
  };
}

// Lightweight resolver: does the current booking-engine session belong to an
// agent allowed to see "Fshehur" (hidden) flights? Used by the public list
// endpoints that don't otherwise need full pricing (routes/airports).
export async function agentCanSeeHiddenFlights(req: any): Promise<boolean> {
  const userId = req?.session?.userId;
  if (!userId) return false;
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user?.agentId) return false;
  const [agent] = await db
    .select({ seesHiddenFlights: agentsTable.seesHiddenFlights })
    .from(agentsTable)
    .where(eq(agentsTable.id, user.agentId));
  return agent?.seesHiddenFlights === true;
}

// Does a rule apply to a given flight?
export function ruleMatchesFlight(rule: PriceRule, f: FlightLike): boolean {
  if (!rule.applyAllFlights) {
    const ids = Array.isArray(rule.flightIds) ? (rule.flightIds as number[]) : [];
    if (!ids.includes(f.id)) return false;
  }
  if (rule.fromCity && rule.fromCity.trim() && rule.fromCity.trim().toUpperCase() !== (f.fromCity || "").toUpperCase()) return false;
  if (rule.toCity && rule.toCity.trim() && rule.toCity.trim().toUpperCase() !== (f.toCity || "").toUpperCase()) return false;
  if (rule.airline && rule.airline.trim() && !(f.airline || "").toUpperCase().includes(rule.airline.trim().toUpperCase())) return false;
  if (rule.departureFrom && rule.departureFrom.trim() && f.departureDate < rule.departureFrom.trim()) return false;
  if (rule.departureTo && rule.departureTo.trim() && f.departureDate > rule.departureTo.trim()) return false;
  return true;
}

// First active rule (by id) that matches the flight, or null.
export function findRuleForFlight(rules: PriceRule[], f: FlightLike): PriceRule | null {
  for (const rule of rules) {
    if (ruleMatchesFlight(rule, f)) return rule;
  }
  return null;
}

// Apply a rule's matching tier to a single price value. Returns the original
// price when no tier matches that value.
export function applyRuleToPrice(price: number, rule: PriceRule): number {
  const tiers = Array.isArray(rule.tiers) ? (rule.tiers as PriceRuleTier[]) : [];
  for (const t of tiers) {
    const min = Number(t.minPrice) || 0;
    const max = t.maxPrice == null || (t.maxPrice as any) === "" ? Infinity : Number(t.maxPrice);
    if (price >= min && price <= max) {
      const v = Number(t.value) || 0;
      if (rule.discountType === "fixed") return Math.max(0, r2(price - v));
      return r2(price * (1 - v / 100));
    }
  }
  return price;
}

// Compute the agent's per-unit ticket price for a flight.
//   - The agency markup (flat € PLUS a % margin of the base price) is a margin
//     that is ALWAYS folded on top, in EVERY mode (rule or legacy). It is the
//     agency's profit and must never be dropped.
//   - The NET below the markup is governed by precedence:
//       · agent has ≥1 active rule → rule pricing governs the net (legacy flat
//         discount ignored; no matching rule → base).
//       · else → legacy flat discount applies to the net.
//   - Everything folds into the price so price shown == price charged ==
//     stored ticketPrice (markup is never bolted onto the total separately).
export type UnitPriceResult = { price: number; mode: "rule" | "discount" | "none" };

export function agentUnitPrice(base: number, f: FlightLike, pricing: AgentPricing): UnitPriceResult {
  // VIZITOR i paregjistruar (agentId == null) me markup faqeje aktiv: çmimi =
  // bazë + markup. Ndalon këtu që logjika e agjentit të mbetet plotësisht e
  // paprekur (agjentët kanë agentId != null, s'hyjnë kurrë këtu).
  if (pricing.agentId == null && pricing.guestMarkupValue && pricing.guestMarkupValue > 0) {
    const v = pricing.guestMarkupValue;
    const withMarkup = pricing.guestMarkupType === "fixed" ? base + v : base * (1 + v / 100);
    // Çmimi i vizitorit rrumbullakohet në euro të plotë (si te agjentët) që të
    // mos dalin decimale të shëmtuara (p.sh. 149.4 → 149). Nuk prek API-në e
    // partnerëve: ajo s'kalon kurrë nga kjo degë (agentId != null).
    return { price: rWhole(Math.max(0, withMarkup)), mode: "none" };
  }

  // Agency markup = flat € + percentage margin of the ORIGINAL base price.
  const flatMarkup = pricing.markup > 0 ? pricing.markup : 0;
  const pctMarkup = pricing.markupPercent > 0 ? base * (pricing.markupPercent / 100) : 0;
  const markup = flatMarkup + pctMarkup;

  // Rrumbullakoso në euro të plotë VETËM kur ka agjent të vërtetë (faqja e
  // jashtme e agjentit). Pa agjent (NO_AGENT_PRICING) ruajmë 2 decimale.
  const round = roundWholeEuro;

  if (pricing.rules.length > 0) {
    const rule = findRuleForFlight(pricing.rules, f);
    // Rule governs the net; markup is still added on top. No matching rule → base.
    const net = rule ? applyRuleToPrice(base, rule) : base;
    return { price: round(Math.max(0, net + markup)), mode: "rule" };
  }
  // Legacy: per-unit flat discount first, then add the per-unit markup.
  let price = base;
  let discounted = false;
  if (pricing.discountType === "fixed" && pricing.discountFixed > 0) {
    price = Math.max(0, base - pricing.discountFixed);
    discounted = true;
  } else if (pricing.discountPercent > 0) {
    price = base * (1 - pricing.discountPercent / 100);
    discounted = true;
  }
  price = round(Math.max(0, price + markup));
  return { price, mode: discounted || markup > 0 ? "discount" : "none" };
}

// Does this agent's pricing run through the rule engine? (any active rule assigned)
export function pricingModeFor(pricing: AgentPricing): "rule" | "discount" | "none" {
  if (pricing.rules.length > 0) return "rule";
  const hasFlat =
    (pricing.discountType === "fixed" && pricing.discountFixed > 0) ||
    (pricing.discountType !== "fixed" && pricing.discountPercent > 0);
  return hasFlat ? "discount" : "none";
}
