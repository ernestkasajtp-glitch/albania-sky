import { Router, type IRouter } from "express";
import { readFlightDiscount, readFlightDiscounts, applyFlightDiscount, discountForChannel, type FlightDiscount } from "../lib/flightDiscounts";
import { readManualFlightDiscounts } from "../lib/flightDiscounts";
import { readCampaignSnapshot } from "../lib/discountCampaigns";
import { readBannerConfigs } from "../lib/offerBanners";
import { bannerWallTimeMs, eligibleBannerCampaigns, guestBannerCampaigns } from "../lib/offerBannerMath";
import { campaignActive, tiraneMinute } from "../lib/discountCampaignMath";
import { eq, and, gte, lte, ilike, or, sql, inArray } from "drizzle-orm";
import { db, flightsTable, bookingsTable, passengersTable, bookingUsersTable, agentsTable, bookingChangeLogsTable, paymentsTable, paymentChangeLogsTable, agentCreditTransactionsTable, priceChangeRequestsTable, settingsTable, agentActivityTable, pokOrdersTable, pokAccountsTable } from "@workspace/db";
import { normalizeFirstName, normalizeLastName } from "../lib/nameFormat";
import { registerPortalPaymentReports } from "./portalPaymentReports.js";
import { registerPortalInvoices } from "./portalInvoices.js";
import { lookupAirport, normalizeAirportCode } from "../lib/airports";
import bcrypt from "bcryptjs";
import { sendEmail, bookingCreatedEmail, bookingSubject } from "../lib/gmail.js";
import { generateBookingConfirmationPdf } from "../lib/invoicePdf.js";
import { getFullBooking } from "../lib/getFullBooking.js";
import { checkDuplicatePassengerTask } from "../lib/dupPassengerCheck.js";
import { sendAgentStatusEmail } from "./bookings.js";
import { resolveAgentPricing, agentUnitPrice, type AgentPricing, NO_AGENT_PRICING } from "../lib/priceRules.js";
import { bookingEngineVisibilityConds, resolveFlightVisibility } from "../lib/flightVisibility.js";
import { getIp } from "../lib/rateLimit.js";
import { getSocialProofEnabled } from "./socialProofSettings.js";
import { agentActivityEvent } from "../lib/agentActivityEvent.js";
import { flipSoldOutIfFull } from "../lib/autoSoldOut.js";
import { recordSeatEvent } from "../lib/seatHistory.js";
import { triggerCpExportSoon } from "../lib/cpExport.js";
import { sendPaymentInvoice } from "../lib/invoice.js";
import { roundWholeEuro, formatWholeEuro, wholeEuroDue, wholeEuroOverpay } from "../lib/money.js";
import { statusEmailOutcomeNote } from "../lib/statusEmailOutcome.js";
import { notifyDataChanged } from "../lib/liveEvents.js";
import { insertWithUniqueBookingRef } from "../lib/bookingRef.js";
import { ensurePokAccount, getLegacyPokAccount, getPokAccountById, lockPokAccountConfig, type PokCredentials } from "../lib/pokAccounts.js";
import { decryptPokSecret } from "../lib/pokCrypto.js";
import { canReusePokOrder, isExplicitPokCreationRejection, isPokIntentUnresolved, isProviderExpiredUnpaid, pokPaymentEvidence, shouldSupersedePokOrder, terminalPokFailureStatus } from "../lib/pokOrderPolicy.js";


const router: IRouter = Router();

// Page-view tracker: the booking-engine SPA posts here on every client-side
// navigation so the admin can see exactly which pages each agent opened.
// Fire-and-forget; resolves agentId from the session (falling back to a
// userId → agent lookup for sessions created before agentId was stored).
router.post("/public/track-visit", async (req, res): Promise<void> => {
  const event = agentActivityEvent(req.body);
  if (!event) { res.status(400).json({ error: "Invalid activity event" }); return; }
  res.json({ ok: true });
  const userId = req.session?.userId;
  if (!userId) return;
  let agentId = req.session?.agentId;
  if (!agentId) {
    try {
      const [u] = await db.select({ agentId: bookingUsersTable.agentId })
        .from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
      agentId = u?.agentId ?? undefined;
      if (agentId) req.session.agentId = agentId;
    } catch { /* ignore */ }
  }
  if (!agentId) return;
  const ua = (req.headers["user-agent"] as string | undefined)?.slice(0, 400) ?? null;
  db.insert(agentActivityTable).values({
    agentId,
    userId,
    ...event,
    ip: getIp(req as any),
    userAgent: ua,
  }).catch(() => {});
});

// ── Sell-cutoff helpers ───────────────────────────────────────────────────────
export async function getSellCutoffHours(): Promise<number> {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "sell_cutoff_hours"));
    const val = rows[0]?.value;
    if (!val) return 3;
    const n = parseFloat(val);
    return isNaN(n) ? 3 : n;
  } catch { return 3; }
}

/** Interpret a naive Y-M-D H:M wall-clock as Europe/Tirane local time, return the true UTC epoch ms. */
function tiraneWallToUtcMs(year: number, month: number, day: number, hour: number, minute: number): number {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Tirane", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(guessMs));
  const gp = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const tzOffset = Date.UTC(gp("year"), gp("month") - 1, gp("day"), gp("hour"), gp("minute"), gp("second")) - guessMs;
  return guessMs - tzOffset;
}

/** Returns true if the flight is still within selling window (departure > now + cutoffHours), in Albania time */
function isSaleOpen(departureDate: string, departureTime: string, cutoffHours: number): boolean {
  const [year, month, day] = departureDate.split("-").map(Number);
  const [hour = 0, minute = 0] = (departureTime || "00:00").split(":").map(Number);
  const depMs = tiraneWallToUtcMs(year, month, day, hour, minute);
  return Date.now() + cutoffHours * 3_600_000 < depMs;
}

// ── Rregulli për fluturimet e KONFIRMUARA (⭐) ────────────────────────────────
// Fluturimet e konfirmuara mbyllin shitjen N orë para nisjes (settings key
// `confirmed_sell_cutoff_hours`, default 4) — pavarësisht kufirit për-fluturim.
// Orari i zyrës: 09:00–00:30 (Europe/Tirane). Nëse momenti i mbylljes bie kur
// zyra është MBYLLUR (00:30–09:00), shitja mbyllet më herët — në 00:30 të asaj
// nate (minutat e fundit kur zyra ishte hapur).
export async function getConfirmedSellCutoffHours(): Promise<number> {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "confirmed_sell_cutoff_hours"));
    const n = parseFloat(rows[0]?.value ?? "");
    return isNaN(n) || n < 0 ? 4 : n;
  } catch { return 4; }
}

/** Wall-clock (Europe/Tirane) i një momenti UTC. */
function tiraneWallOfUtcMs(ms: number): { y: number; m: number; d: number; hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Tirane", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(ms));
  const gp = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return { y: gp("year"), m: gp("month"), d: gp("day"), hh: gp("hour"), mm: gp("minute") };
}

/** Momenti UTC kur mbyllet shitja për një fluturim (me rregullin e zyrës për të konfirmuarat). */
function saleCloseUtcMs(departureDate: string, departureTime: string, cutoffHours: number, confirmed: boolean): number {
  const [year, month, day] = departureDate.split("-").map(Number);
  const [hour = 0, minute = 0] = (departureTime || "00:00").split(":").map(Number);
  const depMs = tiraneWallToUtcMs(year, month, day, hour, minute);
  let closeMs = depMs - cutoffHours * 3_600_000;
  if (confirmed) {
    const w = tiraneWallOfUtcMs(closeMs);
    const minOfDay = w.hh * 60 + w.mm;
    // Zyra mbyllur: pas 00:30 e para 09:00 → mbyll në 00:30 të së njëjtës ditë.
    if (minOfDay > 30 && minOfDay < 9 * 60) {
      closeMs = tiraneWallToUtcMs(w.y, w.m, w.d, 0, 30);
    }
  }
  return closeMs;
}

/** isSaleOpen për një fluturim — të konfirmuarat përdorin kufirin e vet + orarin e zyrës. */
export function isSaleOpenForFlight(
  f: { departureDate: string; departureTime: string; sellCutoffHours: number | null; isConfirmed: boolean },
  globalCutoff: number,
  confirmedCutoff: number,
): boolean {
  const confirmed = f.isConfirmed === true;
  // Kufiri MANUAL për-fluturim ka përparësi edhe te të konfirmuarat (⭐);
  // default-i i konfirmuar përdoret vetëm kur s'ka kufi manual.
  const hours = f.sellCutoffHours ?? (confirmed ? confirmedCutoff : globalCutoff);
  return Date.now() < saleCloseUtcMs(f.departureDate, f.departureTime, hours, confirmed);
}

function formatFlight(f: typeof flightsTable.$inferSelect, pricing: AgentPricing = NO_AGENT_PRICING, flightDiscount: FlightDiscount | null = null) {
  flightDiscount = discountForChannel(flightDiscount, pricing.agentId != null ? "agents" : "public");
  const adultBase = Number(f.adultPrice);
  const childBase = Number(f.childPrice);
  const infantBase = Number(f.infantPrice);
  // Agent-specific per-ticket prices (rule pricing, or legacy flat discount, or base).
  const adult = agentUnitPrice(adultBase, f, pricing);
  const child = agentUnitPrice(childBase, f, pricing);
  const infant = agentUnitPrice(infantBase, f, pricing);
  return {
    ...f,
    fromCity: normalizeAirportCode(f.fromCity),
    toCity: normalizeAirportCode(f.toCity),
    // Çmimi neto informativ i fluturimit është VETËM për admin në FMS —
    // hiqet gjithmonë nga booking-engine (undefined = s'del fare në JSON).
    netPrice: undefined,
    // Shënimi i brendshëm i fluturimit s'i takon kurrë faqes publike.
    notes: undefined,
    adultPrice: adultBase,
    childPrice: childBase,
    infantPrice: infantBase,
    // Final per-unit prices for the current agent (== base for guests / no discount).
    flightDiscount,
    preDiscountAdultPrice: adult.price,
    preDiscountChildPrice: child.price,
    preDiscountInfantPrice: infant.price,
    agentAdultPrice: applyFlightDiscount(adult.price, flightDiscount),
    agentChildPrice: applyFlightDiscount(child.price, flightDiscount),
    agentInfantPrice: applyFlightDiscount(infant.price, flightDiscount),
    // Pricing mode for this agent ("rule" | "discount" | "none"). The booking
    // engine uses agentXPrice directly (discount/rule + markup already folded in
    // server-side); this only drives the badge label shown on discounted fares.
    agentPricingMode: adult.mode,
    tax: Number(f.tax),
    checkedBaggagePrice: f.checkedBaggagePrice ? Number(f.checkedBaggagePrice) : null,
    seatSelectionPrice: f.seatSelectionPrice ? Number(f.seatSelectionPrice) : null,
    priorityBoardingPrice: f.priorityBoardingPrice ? Number(f.priorityBoardingPrice) : null,
    insurancePrice: f.insurancePrice ? Number(f.insurancePrice) : null,
    // Externally-blocked flights are shown as sold out (0 seats) on the
    // booking-engine; internal (flight-system) sales are unaffected.
    availableSeats: f.externalSalesBlocked ? 0 : f.totalSeats - f.soldSeats,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

// Only flights that still have seats for sale (and aren't blocked for external
// sale) should feed the public search options (airports, routes, dates).
const hasSellableSeatsConds = [
  sql`${flightsTable.soldSeats} < ${flightsTable.totalSeats}`,
  eq(flightsTable.externalSalesBlocked, false),
];

// Public: Get all available routes (from→to pairs) with open flights
router.get("/public/offer-banners", async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const now = new Date();
  const [{ campaigns, rules }, configs] = await Promise.all([readCampaignSnapshot(), readBannerConfigs()]);
  // No campaign or banner configured => no flight queries.
  if (!campaigns.some(c => configs.get(c.id)?.enabled && campaignActive(c, tiraneMinute(now)))) {
    res.json({ serverNow: Date.now(), banners: [] }); return;
  }
  // Public announcement only: no flight data or access is exposed to guests.
  if (!req.session?.userId) {
    res.json({ serverNow: Date.now(), banners: guestBannerCampaigns(campaigns, configs, now).map(c => ({
      id: c.id, type: c.type, value: c.value, periods: c.periods,
      startsAtMs: bannerWallTimeMs(c.startsAt), endsAtMs: bannerWallTimeMs(c.endsAt),
      endsAt: c.endsAt, colors: configs.get(c.id)!.colors,
    })) });
    return;
  }
  const [pricing, access, cutoff, confirmedCutoff] = await Promise.all([
    resolveAgentPricing(req), resolveFlightVisibility(req), getSellCutoffHours(), getConfirmedSellCutoffHours(),
  ]);
  const candidates = await db.select({
    id: flightsTable.id, fromCity: flightsTable.fromCity, toCity: flightsTable.toCity,
    departureDate: flightsTable.departureDate, departureTime: flightsTable.departureTime,
    sellCutoffHours: flightsTable.sellCutoffHours, isConfirmed: flightsTable.isConfirmed,
  }).from(flightsTable).where(and(
    eq(flightsTable.status, "open"), ...bookingEngineVisibilityConds(access),
    gte(flightsTable.departureDate, tiraneMinute(now).slice(0, 10)), ...hasSellableSeatsConds,
  ));
  const flights = candidates.filter(f => isSaleOpenForFlight(f, cutoff, confirmedCutoff));
  const manual = await readManualFlightDiscounts(flights.map(f => f.id));
  const eligible = eligibleBannerCampaigns(campaigns, flights, rules, new Set(manual.keys()), configs,
    pricing.agentId != null ? "agents" : "public", now);
  res.json({ serverNow: Date.now(), banners: eligible.map(c => ({
    id: c.id, type: c.type, value: c.value, periods: c.periods,
    startsAtMs: bannerWallTimeMs(c.startsAt), endsAtMs: bannerWallTimeMs(c.endsAt),
    endsAt: c.endsAt, colors: configs.get(c.id)!.colors,
  })) });
});

router.get("/public/routes", async (req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const access = await resolveFlightVisibility(req);
  const rows = await db
    .selectDistinct({ from: flightsTable.fromCity, to: flightsTable.toCity })
    .from(flightsTable)
    .where(and(eq(flightsTable.status, "open"), ...bookingEngineVisibilityConds(access), gte(flightsTable.departureDate, today), ...hasSellableSeatsConds));
  const routes = new Map<string, { from: string; to: string }>();
  for (const row of rows) {
    const from = normalizeAirportCode(row.from);
    const to = normalizeAirportCode(row.to);
    routes.set(`${from}|${to}`, { from, to });
  }
  res.json([...routes.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)));
});

// Public: Get distinct airports that have active flights
router.get("/public/airports", async (req, res): Promise<void> => {
  const access = await resolveFlightVisibility(req);
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .selectDistinct({ city: flightsTable.fromCity })
    .from(flightsTable)
    .where(and(eq(flightsTable.status, "open"), ...bookingEngineVisibilityConds(access), gte(flightsTable.departureDate, today), ...hasSellableSeatsConds))
    .union(
      db.selectDistinct({ city: flightsTable.toCity })
        .from(flightsTable)
        .where(and(eq(flightsTable.status, "open"), ...bookingEngineVisibilityConds(access), gte(flightsTable.departureDate, today), ...hasSellableSeatsConds))
    );

  const codes = [...new Set(rows.map(r => normalizeAirportCode(r.city)))];
  const airports = codes.map(code => {
    const info = lookupAirport(code);
    return {
      code,
      name: info ? info.name : code,
      city: info ? info.city : code,
      label: info ? `${code} – ${info.city}` : code,
    };
  }).sort((a, b) => a.code.localeCompare(b.code));

  res.json(airports);
});

// Public: Get available flight dates with min price for a route
router.get("/public/flight-dates", async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  const cutoffHours = await getSellCutoffHours();
  const confirmedCutoff = await getConfirmedSellCutoffHours();
  const pricing = await resolveAgentPricing(req);
  const access = await resolveFlightVisibility(req);
  const conditions = [eq(flightsTable.status, "open"), ...bookingEngineVisibilityConds(access), gte(flightsTable.departureDate, new Date().toISOString().slice(0, 10)), ...hasSellableSeatsConds];
  if (from) conditions.push(ilike(flightsTable.fromCity, `%${from}%`));
  if (to) conditions.push(ilike(flightsTable.toCity, `%${to}%`));
  const flights = await db
    .select({ id: flightsTable.id, date: flightsTable.departureDate, depTime: flightsTable.departureTime, adultPrice: flightsTable.adultPrice, sellCutoffHours: flightsTable.sellCutoffHours, isConfirmed: flightsTable.isConfirmed, fromCity: flightsTable.fromCity, toCity: flightsTable.toCity, airline: flightsTable.airline })
    .from(flightsTable)
    .where(and(...conditions));

  // Group by date, find min price per date (only flights still within sell window).
  // Min is computed on the agent's effective price so the calendar matches the list.
  const byDate: Record<string, number> = {};
  const discounts = await readFlightDiscounts(flights.map(f => f.id));
  for (const f of flights) {
    if (!isSaleOpenForFlight({ departureDate: f.date, departureTime: f.depTime, sellCutoffHours: f.sellCutoffHours, isConfirmed: f.isConfirmed }, cutoffHours, confirmedCutoff)) continue;
    const price = applyFlightDiscount(agentUnitPrice(Number(f.adultPrice), { id: f.id, fromCity: f.fromCity, toCity: f.toCity, airline: f.airline, departureDate: f.date }, pricing).price, discountForChannel(discounts.get(f.id) ?? null, pricing.agentId != null ? "agents" : "public"));
    if (byDate[f.date] === undefined || price < byDate[f.date]) {
      byDate[f.date] = price;
    }
  }
  const dates = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, minPrice]) => ({ date, minPrice }));
  res.json({ dates });
});

// Public: Search open flights
router.get("/public/flights", async (req, res): Promise<void> => {
  const { from, to, date, airline } = req.query as Record<string, string>;

  const cutoffHours = await getSellCutoffHours();
  const confirmedCutoff = await getConfirmedSellCutoffHours();
  const pricing = await resolveAgentPricing(req);
  const access = await resolveFlightVisibility(req);
  const conditions = [eq(flightsTable.status, "open"), ...bookingEngineVisibilityConds(access)];
  if (from) conditions.push(ilike(flightsTable.fromCity, `%${from}%`));
  if (to) conditions.push(ilike(flightsTable.toCity, `%${to}%`));
  if (date) conditions.push(eq(flightsTable.departureDate, date));
  if (airline) conditions.push(ilike(flightsTable.airline, `%${airline}%`));

  const flights = await db.select().from(flightsTable).where(and(...conditions)).orderBy(flightsTable.departureDate);
  const available = flights.filter(f => isSaleOpenForFlight(f, cutoffHours, confirmedCutoff));
  const discounts = await readFlightDiscounts(available.map(f => f.id));
  res.json(available.map(f => formatFlight(f, pricing, discounts.get(f.id) ?? null)));
});

// Public: Get single flight
router.get("/public/flights/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const pricing = await resolveAgentPricing(req);
  const access = await resolveFlightVisibility(req);
  const [flight] = await db.select().from(flightsTable).where(and(eq(flightsTable.id, id), eq(flightsTable.status, "open"), ...bookingEngineVisibilityConds(access)));
  if (!flight) { res.status(404).json({ error: "Flight not found" }); return; }
  res.json(formatFlight(flight, pricing, await readFlightDiscount(flight.id)));
});

// Auth middleware for protected public routes
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

registerPortalPaymentReports(router, requireAuth);
registerPortalInvoices(router, requireAuth);

// Create booking from booking engine (requires auth)
router.post("/public/bookings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const { flightId, customerName, customerEmail, customerPhone, notes, passengers } = req.body;
  if (!flightId || !customerName || !passengers?.length) {
    res.status(400).json({ error: "flightId, customerName, passengers required" });
    return;
  }

  // Resolve agent pricing context up front: needed both for the hidden-flight
  // visibility gate and the per-passenger pricing below.
  const pricing = await resolveAgentPricing(req);
  const access = await resolveFlightVisibility(req);

  const [flight] = await db.select().from(flightsTable).where(
    and(eq(flightsTable.id, flightId), ...bookingEngineVisibilityConds(access)),
  );
  if (!flight || flight.status !== "open") {
    res.status(400).json({ error: "Flight not available" });
    return;
  }

  // Externally-blocked flights cannot be booked from the public booking-engine
  // (internal flight-system bookings are unaffected — they don't go through here).
  if (flight.externalSalesBlocked) {
    res.status(400).json({ error: "Not enough seats available" });
    return;
  }

  // Sell-cutoff check
  const cutoffHours = await getSellCutoffHours();
  const confirmedCutoffH = await getConfirmedSellCutoffHours();
  if (!isSaleOpenForFlight(flight, cutoffHours, confirmedCutoffH)) {
    res.status(400).json({ error: `Shitja e biletave për këtë fluturim ka përfunduar.` });
    return;
  }

  // Infants do not take a seat (system convention — mirrors passengers cancel/
  // restore and the CP import). Only adults + children consume seats.
  const seatTakingPax = passengers.filter((p: any) => p.type !== "infant").length;
  const availableSeats = flight.totalSeats - flight.soldSeats;
  if (seatTakingPax > availableSeats) {
    res.status(400).json({ error: "Not enough seats available" });
    return;
  }

  // Gender (M/F) is mandatory for every passenger booked from the public engine.
  if (passengers.some((p: any) => p.gender !== "M" && p.gender !== "F")) {
    res.status(400).json({ error: "Gjinia (M/F) është e detyrueshme për të gjithë pasagjerët" });
    return;
  }

  // Per-passenger effective price: agent discount/rule AND markup folded in PER
  // PERSON. The markup (flat € + % of base) is ALWAYS folded — even in rule mode —
  // so the price each passenger pays is exactly what gets stored and summed, with
  // no separate markup/discount line on the total.
  let ticketTotal = 0;
  let extrasTotal = 0;
  let agentMarkupAccum = 0; // Σ folded markup (flat € + % of base) for reporting only
  const paxEffective: number[] = [];
  const flightDiscount = discountForChannel(await readFlightDiscount(flight.id), pricing.agentId != null ? "agents" : "public");
  for (const p of passengers) {
    const base = p.type === "child" ? Number(flight.childPrice)
      : p.type === "infant" ? Number(flight.infantPrice)
      : Number(flight.adultPrice);
    const eff = applyFlightDiscount(agentUnitPrice(base, flight, pricing).price, flightDiscount);
    paxEffective.push(eff);
    ticketTotal += eff;
    agentMarkupAccum += (pricing.markup > 0 ? pricing.markup : 0)
      + (pricing.markupPercent > 0 ? base * (pricing.markupPercent / 100) : 0);
    if (p.baggageOption === "checked" && flight.checkedBaggagePrice) extrasTotal += Number(flight.checkedBaggagePrice);
    if (p.hasSeatSelection && flight.seatSelectionPrice) extrasTotal += Number(flight.seatSelectionPrice);
    if (p.hasPriorityBoarding && flight.priorityBoardingPrice) extrasTotal += Number(flight.priorityBoardingPrice);
    if (p.hasInsurance && flight.insurancePrice) extrasTotal += Number(flight.insurancePrice);
  }
  const taxTotal = Number(flight.tax) * passengers.length;
  const totalAmount = roundWholeEuro(ticketTotal + taxTotal + extrasTotal);

  // booking.markup is kept ONLY for reporting (commission fallback when netPrice is null).
  // It equals the total markup already folded into the per-passenger prices (flat € + %),
  // applied in BOTH rule and legacy modes, so it must NEVER be re-added to the total.
  const agentMarkup = roundWholeEuro(agentMarkupAccum);

  // The database unique constraint is authoritative. A larger reference space
  // plus conflict-only retries means an existing code is never returned and a
  // rare concurrent collision remains invisible to the customer.
  const booking = await insertWithUniqueBookingRef(async bookingRef => {
    const [inserted] = await db.insert(bookingsTable).values({
      bookingRef,
      flightId,
      agentId: user.agentId || null,
      bookingUserId: userId,
      customerName,
      customerEmail: customerEmail || null,
      customerPhone: customerPhone || null,
      notes: notes || null,
      status: "draft",
      totalAmount: totalAmount.toString(),
      markup: agentMarkup.toString(),
      commission: "0",
    }).returning();
    return inserted;
  });
  if (!booking) {
    res.status(503).json({ error: "We couldn’t create your booking. Please try again." });
    return;
  }
  const bookingRef = booking.bookingRef;

  // Insert passengers — ticketPrice = the effective per-passenger price computed above
  // (agent discount + markup folded in). Snapshotted at sale time so later flight-price
  // changes never affect tickets that were already sold.
  for (let i = 0; i < passengers.length; i++) {
    const p = passengers[i];
    await db.insert(passengersTable).values({
      bookingId: booking.id,
      type: p.type || "adult",
      firstName: normalizeFirstName(p.firstName),
      lastName: normalizeLastName(p.lastName),
      gender: p.gender || null,
      dateOfBirth: p.dateOfBirth || null,
      nationality: p.nationality || null,
      passportNumber: p.passportNumber || null,
      passportExpiry: p.passportExpiry || null,
      baggageOption: p.baggageOption || null,
      hasSeatSelection: p.hasSeatSelection || false,
      hasPriorityBoarding: p.hasPriorityBoarding || false,
      hasInsurance: p.hasInsurance || false,
      ticketPrice: String(roundWholeEuro(paxEffective[i])),
      extraCost: String(roundWholeEuro(
        (p.baggageOption === "checked" ? Number(flight.checkedBaggagePrice || 0) : 0) +
        (p.hasSeatSelection ? Number(flight.seatSelectionPrice || 0) : 0) +
        (p.hasPriorityBoarding ? Number(flight.priorityBoardingPrice || 0) : 0) +
        (p.hasInsurance ? Number(flight.insurancePrice || 0) : 0)
      )),
    });
  }

  // Increment sold seats — infants do not occupy a seat. Atomic increment avoids
  // lost updates under concurrent public bookings.
  await db.update(flightsTable)
    .set({ soldSeats: sql`${flightsTable.soldSeats} + ${seatTakingPax}` })
    .where(eq(flightsTable.id, flightId));
  await flipSoldOutIfFull(flightId);
  // Public booking lowered available seats — refresh CitizenPlane now.
  triggerCpExportSoon();
  if (seatTakingPax > 0) {
    void recordSeatEvent({ flightId, type: "sold", seats: seatTakingPax, userName: "Booking Engine", note: `Rezervim ${bookingRef}` });
  }

  const bookingResponse = { ...booking, totalAmount: Number(booking.totalAmount), dueAmount: Number(booking.totalAmount), paidAmount: 0 };
  res.status(201).json(bookingResponse);

  // Kontroll automatik: pasagjer i dyfishtë në fluturim identik → task automatik.
  void checkDuplicatePassengerTask(booking.id);

  // Change log entry
  const statusLogPromise = db.insert(bookingChangeLogsTable).values({
    bookingId: booking.id,
    userId: userId,
    userName: user.name,
    userRole: user.role,
    action: "created",
    newValue: String(booking.status),
    note: `Rezervim nga booking engine${pricing.discountPercent > 0 ? ` (zbritje ${pricing.discountPercent}%)` : ""}`,
  }).returning({ id: bookingChangeLogsTable.id });

  // Email notification
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo) {
    const emailBooking = {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      paidAmount: 0,
      dueAmount: Number(booking.totalAmount),
      flight: { airline: flight.airline, flightNumber: flight.flightNumber, fromCity: flight.fromCity, toCity: flight.toCity, departureDate: flight.departureDate },
      passengers: passengers.map((p: any) => ({ firstName: p.firstName, lastName: p.lastName, type: p.type })),
      agentName: user.name,
    } as any;
    sendEmail(
      notifyTo,
      bookingSubject("New Booking", emailBooking, "en"),
      bookingCreatedEmail(emailBooking)
    ).catch(() => {});
  }
  // Email "Created" te agjenti (i kushtëzuar nga toggle-i notifyCreated i agjentit).
  void (async () => {
    const full = await getFullBooking(booking.id);
    const [statusEvent] = await statusLogPromise;
    if (full) await sendAgentStatusEmail(full, "draft", statusEvent.id);
  })().catch(() => {});
});

// Get single booking detail by ref (agent/user must own it)
router.get("/public/my-bookings/:ref", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const ref = req.params.ref;
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const rows = await db.select({
    booking: bookingsTable,
    flight: flightsTable,
  }).from(bookingsTable)
    .leftJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
    .where(eq(bookingsTable.bookingRef, ref));

  if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  const { booking: b, flight: f } = rows[0];

  // Authorise: must be agent of booking or the user who created it
  const allowed = (user.agentId && b.agentId === user.agentId) ||
    b.bookingUserId === userId ||
    (user.email && b.customerEmail === user.email);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const passengers = await db.select().from(passengersTable).where(eq(passengersTable.bookingId, b.id));
  const payments   = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, b.id));

  const _total = Number(b.totalAmount);
  const _rawPaid = Number(b.paidAmount);
  const _paid = Math.min(_rawPaid, _total);
  const _due = wholeEuroDue(_total, _rawPaid);

  // Fusha të brendshme operacionale — s'i takojnë portalit të agjencive
  const { ticketSearchNote: _tsn, ticketSearchNoteAt: _tsna, ...bPublic } = b;

  res.json({
    ...bPublic,
    totalAmount: _total,
    paidAmount: _paid,
    dueAmount: _due,
    markup: Number(b.markup),
    commission: Number(b.commission),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    flight: f ? {
      ...f,
      netPrice: undefined, // çmimi neto informativ — vetëm admin në FMS, kurrë në portal
      notes: undefined, // shënimi i brendshëm i fluturimit — kurrë në portal
      adultPrice: Number(f.adultPrice ?? 0),
      childPrice: Number(f.childPrice ?? 0),
      infantPrice: Number(f.infantPrice ?? 0),
      tax: Number(f.tax ?? 0),
    } : null,
    passengers: passengers.map(p => ({
      ...p,
      ticketPrice: p.ticketPrice != null ? Number(p.ticketPrice) : null,
      extraCost: Number(p.extraCost ?? 0),
      createdAt: p.createdAt.toISOString(),
    })),
    payments: payments
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(p => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        status: p.status,
        reference: p.reference,
        notes: p.notes,
        isRefund: p.isRefund,
        createdAt: p.createdAt.toISOString(),
      })),
  });
});

// Download booking confirmation PDF (requires auth)
router.get("/public/my-bookings/:ref/pdf", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const ref = req.params.ref;
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const rows = await db.select({
    booking: bookingsTable,
    flight: flightsTable,
  }).from(bookingsTable)
    .leftJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
    .where(eq(bookingsTable.bookingRef, ref));

  if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  const { booking: b, flight: f } = rows[0];

  const allowed = (user.agentId && b.agentId === user.agentId) ||
    b.bookingUserId === userId ||
    (user.email && b.customerEmail === user.email);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const passengers = await db.select().from(passengersTable).where(eq(passengersTable.bookingId, b.id));

  const full = { ...b, flight: f ? { ...f } : null, passengers };
  const status: "confirmed" | "ticketed" | "cancelled" =
    b.status === "ticketed" ? "ticketed" : b.status === "cancelled" ? "cancelled" : "confirmed";

  try {
    const pdf = await generateBookingConfirmationPdf(full as any, status);
    const label = status === "ticketed" ? "ticket" : status === "cancelled" ? "cancellation" : "confirmation";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${b.bookingRef}-${label}.pdf"`);
    res.send(pdf);
  } catch (err) {
    req.log?.error?.({ err }, "booking pdf generation failed");
    res.status(500).json({ error: "PDF generation failed" });
  }
});

// Get my bookings (requires auth)
router.get("/public/my-bookings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  let bookings;
  if (user.agentId) {
    bookings = await db.select({
      booking: bookingsTable,
      flight: { fromCity: flightsTable.fromCity, toCity: flightsTable.toCity, departureDate: flightsTable.departureDate, airline: flightsTable.airline, flightNumber: flightsTable.flightNumber },
    }).from(bookingsTable)
      .leftJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
      .where(eq(bookingsTable.agentId, user.agentId))
      .orderBy(sql`${bookingsTable.createdAt} DESC`);
  } else {
    bookings = await db.select({
      booking: bookingsTable,
      flight: { fromCity: flightsTable.fromCity, toCity: flightsTable.toCity, departureDate: flightsTable.departureDate, airline: flightsTable.airline, flightNumber: flightsTable.flightNumber },
    }).from(bookingsTable)
      .leftJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
      .where(or(
        eq(bookingsTable.bookingUserId, userId),
        user.email ? eq(bookingsTable.customerEmail, user.email) : sql`false`
      ))
      .orderBy(sql`${bookingsTable.createdAt} DESC`);
  }

  // Fetch all payments for these bookings in one query
  const bookingIds = bookings.map(({ booking: b }) => b.id);
  const allPayments = bookingIds.length > 0
    ? await db.select().from(paymentsTable).where(inArray(paymentsTable.bookingId, bookingIds))
    : [];

  const paymentsByBooking: Record<number, typeof allPayments> = {};
  for (const p of allPayments) {
    if (!paymentsByBooking[p.bookingId]) paymentsByBooking[p.bookingId] = [];
    paymentsByBooking[p.bookingId].push(p);
  }

  const result = bookings.map(({ booking: b, flight: f }) => {
    const payments = (paymentsByBooking[b.id] || [])
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(p => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        status: p.status,
        reference: p.reference,
        notes: p.notes,
        isRefund: p.isRefund,
        createdAt: p.createdAt.toISOString(),
      }));
    const _total = Number(b.totalAmount);
    const _rawPaid = Number(b.paidAmount);
    const _paid = Math.min(_rawPaid, _total);
    const _due = wholeEuroDue(_total, _rawPaid);
    const _credit = wholeEuroOverpay(_rawPaid, _total);
    return {
      ...b,
      totalAmount: _total,
      paidAmount: _paid,
      markup: Number(b.markup),
      commission: Number(b.commission),
      dueAmount: _due,
      creditAmount: _credit,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      fromCity: f?.fromCity ?? null,
      toCity: f?.toCity ?? null,
      departureDate: f?.departureDate ?? null,
      airline: f?.airline ?? null,
      flightNumber: f?.flightNumber ?? null,
      payments,
    };
  });

  res.json(result);
});

// Unified financial movements for agent (payments + credits + price changes)
router.get("/public/my-transactions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user || !user.agentId) { res.json([]); return; }

  const agentId = user.agentId;

  // Fetch agent bookings to map bookingId → meta
  const agentBookings = await db.select({
    id: bookingsTable.id,
    bookingRef: bookingsTable.bookingRef,
    customerName: bookingsTable.customerName,
    fromCity: flightsTable.fromCity,
    toCity: flightsTable.toCity,
  }).from(bookingsTable)
    .leftJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
    .where(eq(bookingsTable.agentId, agentId));

  const bookingIds = agentBookings.map(b => b.id);
  if (bookingIds.length === 0) { res.json([]); return; }
  const bookingMap = new Map(agentBookings.map(b => [b.id, b]));

  // Read actual changes from booking_change_logs:
  // 1) ticketPrice (Çmimi i Biletës) changes — show old→new diff
  // 2) Extra services added (Bagazhi, Zgjedhja e Vendit, Prioritet Boarding, Sigurim) when newValue = "Po"
  const logs = await db.select().from(bookingChangeLogsTable)
    .where(
      and(
        inArray(bookingChangeLogsTable.bookingId, bookingIds),
        eq(bookingChangeLogsTable.action, "passenger_updated")
      )
    )
    .orderBy(bookingChangeLogsTable.createdAt);

  const PRICE_FIELD = "Çmimi i Biletës";
  const EXTRAS_LABELS: Record<string, string> = {
    "Bagazhi":              "Bagazh i kontrolluar",
    "Zgjedhja e Vendit":    "Zgjedhja e vendit të uljes",
    "Prioritet Boarding":   "Prioritet boarding",
    "Sigurim":              "Sigurim udhëtimi",
  };

  const transactions: any[] = [];

  for (const log of logs) {
    const bk = bookingMap.get(log.bookingId);
    const fieldName = log.fieldName ?? "";
    const dashIdx = fieldName.indexOf(" — ");
    const baseField = dashIdx !== -1 ? fieldName.slice(0, dashIdx).trim() : fieldName.trim();
    const paxName = dashIdx !== -1 ? fieldName.slice(dashIdx + 3).trim() : null;

    if (baseField === PRICE_FIELD) {
      const oldPrice = log.oldValue != null && log.oldValue !== "" ? parseFloat(log.oldValue) : null;
      const newPrice = log.newValue != null && log.newValue !== "" ? parseFloat(log.newValue) : null;
      if (oldPrice == null || newPrice == null || Math.abs(newPrice - oldPrice) < 0.01) continue;
      const diff = newPrice - oldPrice;
      transactions.push({
        id: `cl-${log.id}`,
        type: "price_change",
        amount: Math.abs(diff),
        sign: diff >= 0 ? 1 : -1,
        date: log.createdAt.toISOString(),
        bookingRef: bk?.bookingRef ?? null,
        customerName: paxName ?? bk?.customerName ?? null,
        route: bk?.fromCity && bk?.toCity ? `${bk.fromCity}→${bk.toCity}` : null,
        method: "Ndryshim Çmimi Bilete",
        reference: null,
        notes: null,
        description: diff >= 0
          ? `Rritje çmimi €${formatWholeEuro(Math.abs(diff))}`
          : `Ulje çmimi €${formatWholeEuro(Math.abs(diff))}`,
        oldAmount: oldPrice,
        newAmount: newPrice,
      });
    } else if (EXTRAS_LABELS[baseField] && log.newValue === "Po") {
      transactions.push({
        id: `cl-${log.id}`,
        type: "price_change",
        amount: 0,
        sign: 1,
        date: log.createdAt.toISOString(),
        bookingRef: bk?.bookingRef ?? null,
        customerName: paxName ?? bk?.customerName ?? null,
        route: bk?.fromCity && bk?.toCity ? `${bk.fromCity}→${bk.toCity}` : null,
        method: "Shërbim Extra",
        reference: null,
        notes: null,
        description: `${EXTRAS_LABELS[baseField]} u shtua`,
        oldAmount: null,
        newAmount: null,
      });
    }
  }

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  res.json(transactions);
});

// ── POK Pay helpers ───────────────────────────────────────────────────────────
const POK_BASE = "https://api.pokpay.io";
// This map only coalesces requests within one process.  The authoritative
// deduplication is the durable pok_orders row and the PostgreSQL advisory lock
// below, so restarts and multiple API instances remain safe.
const pokInitiateInflight = new Map<string, Promise<{ status: number; body: any }>>();

async function pokGetToken(account: PokCredentials): Promise<string> {
  const res = await fetch(`${POK_BASE}/auth/sdk/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyId: account.keyId,
      keySecret: account.keySecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`POK auth failed: ${res.status}`);
  const data = await res.json() as any;
  return data.data.accessToken;
}

/** Fetch the authoritative order object from POK by its id.
 * A 404 is returned as null, but callers must not treat that as a payment
 * terminal state: this integration has no provider guarantee that 404 means
 * cancellation/expiry. Network errors and every other non-OK status throw. */
export async function pokGetOrder(orderId: string, account: PokCredentials, token?: string): Promise<any | null> {
  const t = token ?? await pokGetToken(account);
  const res = await fetch(`${POK_BASE}/merchants/${account.merchantId}/sdk-orders/${orderId}`, {
    headers: { Authorization: `Bearer ${t}` },
    signal: AbortSignal.timeout(15_000),
  });
  // 404 is an unresolved lookup for this integration; 401/403/429/5xx are
  // transient errors and also throw so callers can retry.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`POK order fetch failed: ${res.status}`);
  const data = await res.json() as any;
  const order = data?.data?.sdkOrder ?? data?.data ?? data ?? null;
  if (order?.id !== orderId) throw new Error("POK order ID does not match requested ID");
  return order;
}

/**
 * Record a POK card payment from an authoritative order object (fetched from POK).
 * Idempotent by (bookingId, reference=order.id): safe to call from both the webhook
 * AND the payment-return verify endpoint without double-recording. Recalculates
 * paidAmount and bumps a draft booking to pending.
 */
export async function recordPokPaymentFromOrder(order: any, expectedAccountId?: number, tx?: any): Promise<{ ok: boolean; reason?: string; bookingRef?: string; paid?: number; due?: number; invoicePaymentId?: number }> {
  const bookingRef: string | undefined = order?.merchantCustomReference;
  const orderId: string | undefined = order?.id;

  if (!bookingRef || !orderId) return { ok: false, reason: "missing_ref_or_id" };
  if (!tx) {
    const [boundOrder] = await db.select({ bookingId: pokOrdersTable.bookingId })
      .from(pokOrdersTable).where(eq(pokOrdersTable.providerOrderId, orderId)).limit(1);
    if (!boundOrder) return { ok: false, reason: "order_not_registered", bookingRef };
    const result = await db.transaction(async (lockedTx) => {
      await lockedTx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-booking-${boundOrder.bookingId}`}))`);
      return recordPokPaymentFromOrder(order, expectedAccountId, lockedTx);
    });
    if (result.invoicePaymentId) void sendPaymentInvoice(result.invoicePaymentId).catch(() => {});
    const { invoicePaymentId: _internal, ...publicResult } = result;
    return publicResult;
  }
  const database: any = tx;

  const [pokOrder] = await database.select().from(pokOrdersTable)
    .where(eq(pokOrdersTable.providerOrderId, orderId)).limit(1);
  if (!pokOrder) return { ok: false, reason: "order_not_registered", bookingRef };
  if (expectedAccountId !== undefined && pokOrder.accountId !== expectedAccountId) {
    return { ok: false, reason: "account_mismatch", bookingRef };
  }

  // The provider reference is only a claim. The durable binding is
  // pok_orders.booking_id; load that booking first, then require the provider
  // merchantCustomReference to agree with it.
  const [row] = await database.select().from(bookingsTable).where(eq(bookingsTable.id, pokOrder.bookingId));
  if (!row) return { ok: false, reason: "booking_not_found", bookingRef };
  if (row.bookingRef !== bookingRef) return { ok: false, reason: "booking_ref_mismatch", bookingRef };
  const evidence = pokPaymentEvidence(order, orderId, row.bookingRef, pokOrder.amount);
  if (evidence.kind !== "paid") return { ok: false, reason: evidence.reason, bookingRef };
  if (pokOrder.status === "review_required") return { ok: false, reason: "review_required", bookingRef };
  if (row.status === "cancelled") {
    await database.update(pokOrdersTable).set({ status: "review_required", updatedAt: new Date() })
      .where(eq(pokOrdersTable.id, pokOrder.id));
    return { ok: false, reason: "review_required", bookingRef };
  }
  const amount = Number(pokOrder.amount);

  // Idempotency: never record the same POK order twice (webhook + return both call
  // this). The SELECT is the fast path; onConflictDoNothing on the partial unique
  // index (booking_id, reference) WHERE method='card' is the race backstop for the
  // window where both fetch the order and INSERT before either commits.
  const existing = await database.select().from(paymentsTable)
    .where(and(eq(paymentsTable.bookingId, row.id), eq(paymentsTable.reference, orderId), eq(paymentsTable.method, "card")));
  let invoicePaymentId: number | undefined;
  if (existing.length === 0) {
    const priorPayments = await database.select().from(paymentsTable).where(eq(paymentsTable.bookingId, row.id));
    const priorPaid = priorPayments.reduce((sum: number, p: any) =>
      sum + (p.status === "completed" ? (p.isRefund ? -Number(p.amount) : Number(p.amount)) : 0), 0);
    if (amount > Number(row.totalAmount) - priorPaid + 0.009) {
      await database.update(pokOrdersTable).set({ status: "review_required", updatedAt: new Date() })
        .where(eq(pokOrdersTable.id, pokOrder.id));
      return { ok: false, reason: "review_required", bookingRef };
    }
    const inserted = await database.insert(paymentsTable).values({
      bookingId: row.id,
      amount: String(amount),
      method: "card",
      status: "completed",
      reference: orderId,
      notes: `POK Pay — ${order?.transactionId ?? orderId}`,
      isRefund: false,
      confirmed: true,
      payerType: "client",
    }).onConflictDoNothing().returning({ id: paymentsTable.id });
    // Email the invoice PDF (agent + admin) — only when WE actually inserted the
    // row (returning() is empty when onConflictDoNothing skipped it), so the
    // webhook/return race never produces two invoice emails for one POK order.
    if (inserted.length > 0) {
      invoicePaymentId = inserted[0].id;
      // Historiku i pagesës: krijim automatik nga POK Pay (System)
      await database.insert(paymentChangeLogsTable).values({
        paymentId: inserted[0].id,
        userName: "System",
        action: "created",
        newValue: `€${formatWholeEuro(amount)} · Kartë (POK Pay) · ${bookingRef}`,
        note: `POK Pay — ${order?.transactionId ?? orderId}`,
      });
    }
  }

  // Recalculate paidAmount from all completed payments.
  const payments = await database.select().from(paymentsTable).where(eq(paymentsTable.bookingId, row.id));
  let paidAmount = 0;
  for (const p of payments) {
    if (p.status === "completed" && !p.isRefund) paidAmount += Number(p.amount);
    else if (p.status === "completed" && p.isRefund) paidAmount -= Number(p.amount);
  }
  // Keep the durable order bound to the account used to create it.  A future
  // payment for any remaining balance may create a new order.
  await database.update(pokOrdersTable).set({ status: "paid", updatedAt: new Date() })
    .where(eq(pokOrdersTable.id, pokOrder.id));

  const safePaid = Math.max(0, paidAmount);
  const total = Number(row.totalAmount);
  await database.update(bookingsTable)
    .set({ paidAmount: String(safePaid) })
    .where(eq(bookingsTable.id, row.id));
  if (row.status === "draft") {
    const transitioned = await database.update(bookingsTable)
      .set({ status: "pending" })
      .where(and(eq(bookingsTable.id, row.id), eq(bookingsTable.status, "draft")))
      .returning({ id: bookingsTable.id });
    if (transitioned.length > 0) {
      const [statusEvent] = await database.insert(bookingChangeLogsTable).values({
        bookingId: row.id,
        userId: null,
        userName: "System",
        userRole: null,
        action: "status_changed",
        fieldName: "Statusi",
        oldValue: "Draft",
        newValue: "Në Pritje",
        note: "Pagesa POK e kaloi rezervimin automatikisht në pritje",
      }).returning({ id: bookingChangeLogsTable.id });
      await database.insert(bookingChangeLogsTable).values({
        bookingId: row.id,
        userId: null,
        userName: "System",
        userRole: null,
        action: "status_email",
        fieldName: "Emaili i agjentit",
        newValue: "skipped",
        note: statusEmailOutcomeNote({
          statusEventId: statusEvent.id,
          outcome: "skipped",
          reason: "Ndryshimi automatik draft→pending nga POK nuk dërgon email statusi",
          email: null,
          status: "pending",
        }),
      });
      notifyDataChanged("bookings");
    }
  }

  return { ok: true, bookingRef, paid: safePaid, due: wholeEuroDue(total, safePaid), invoicePaymentId };
}

// POST /public/bookings/:ref/pok-initiate
// Initiates a POK Pay card payment for a booking, returns { confirmUrl }
router.post("/public/bookings/:ref/pok-initiate", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const ref = req.params.ref;

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const [row] = await db.select({ booking: bookingsTable })
    .from(bookingsTable)
    .where(eq(bookingsTable.bookingRef, ref));

  if (!row) { res.status(404).json({ error: "Booking not found" }); return; }
  const booking = row.booking;

  // Verify ownership
  const allowed = booking.bookingUserId === userId ||
    (user.agentId !== null && booking.agentId === user.agentId);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  // Always enter the booking lock: a second captured order may require review
  // even when the booking currently shows no balance due.

  if (booking.status === "cancelled") { res.status(400).json({ error: "Booking is cancelled" }); return; }
  await ensurePokAccount();

  // Determine redirect base. The Origin header is only scheme+host (no path) and
  // Referer is a full page URL — both parse cleanly with URL(). The booking-engine
  // SPA is ALWAYS served under /booking-engine, which is where the /payment-return
  // route AND the customer's session cookie live. Returning to the bare-root
  // /payment-return lands on the admin app (flight-system) login page instead, so
  // we must always keep the /booking-engine prefix.
  const originHeader = req.headers.origin || req.headers.referer || "";
  let host = "https://kingsmanagment.com";
  try { if (originHeader) host = new URL(originHeader).origin; } catch { /* keep default host */ }
  const baseUrl = `${host}/booking-engine`;

  const redirectUrl = `${baseUrl}/payment-return?ref=${ref}&status=success`;
  const failRedirectUrl = `${baseUrl}/payment-return?ref=${ref}&status=fail`;
  const webhookUrl = `https://kingsmanagment.com/api/public/pok-webhook`;
  // Single-flight: concurrent initiates for the same booking share ONE creation.
  let flight = pokInitiateInflight.get(booking.bookingRef);
  if (!flight) {
    flight = (async (): Promise<{ status: number; body: any }> => {
      try {
        const transactionResult = await db.transaction(async (tx): Promise<{ status: number; body: any }> => {
          // Hold the booking lock through provider creation and durable insert.
          // This prevents duplicate provider orders across workers/restarts.
          await lockPokAccountConfig(tx);
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-booking-${booking.id}`}))`);
          const [lockedBooking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, booking.id)).limit(1);
          if (!lockedBooking) return { status: 404, body: { error: "Booking not found" } };
          const [linkPolicy] = await tx.select({ value: settingsTable.value }).from(settingsTable)
            .where(eq(settingsTable.key, "pok_create_new_link_each_attempt")).limit(1);
          const createNewLinkEachAttempt = linkPolicy?.value === "true";
          const lockedPayments = await tx.select().from(paymentsTable).where(eq(paymentsTable.bookingId, lockedBooking.id));
          const lockedPaid = lockedPayments.reduce((sum: number, payment: any) =>
            sum + (payment.status === "completed" ? (payment.isRefund ? -Number(payment.amount) : Number(payment.amount)) : 0), 0);
          const lockedDue = Math.round((Number(lockedBooking.totalAmount) - lockedPaid) * 100) / 100;
          if (lockedBooking.status === "cancelled") return { status: 400, body: { error: "Booking is cancelled" } };
          const [activeCandidate] = await tx.select().from(pokAccountsTable)
            .where(eq(pokAccountsTable.active, true)).limit(1);
          if (!activeCandidate) return { status: 503, body: { error: "POK Pay nuk është konfiguruar" } };
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-account-${activeCandidate.id}`}))`);
          let [activeRow] = await tx.select().from(pokAccountsTable)
            .where(eq(pokAccountsTable.active, true)).limit(1);
          // Activation can switch the active row while the first read is
          // waiting. Lock the newly observed account and read it again before
          // decrypting credentials.
          if (activeRow && activeRow.id !== activeCandidate.id) {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-account-${activeRow.id}`}))`);
            [activeRow] = await tx.select().from(pokAccountsTable)
              .where(eq(pokAccountsTable.active, true)).limit(1);
          }
          if (!activeRow) return { status: 503, body: { error: "POK Pay nuk është konfiguruar" } };
          const activeAccount: PokCredentials = { ...activeRow, keySecret: decryptPokSecret(activeRow.keySecretEncrypted) };
          const existingOrders = await tx.select().from(pokOrdersTable)
            .where(and(eq(pokOrdersTable.bookingId, lockedBooking.id),
              inArray(pokOrdersTable.status, ["created", "pending", "superseded", "expired", "creating", "unknown", "review_required"])));
          const now = new Date();
          if (existingOrders.some(o => isPokIntentUnresolved(o.status))) {
            return { status: 503, body: { error: "POK porosia ka rezultat të panjohur; verifikimi manual kërkohet para riprovimit." } };
          }
          if (existingOrders.some(o => o.status === "review_required")) {
            return { status: 503, body: { error: "Pagesë POK kërkon shqyrtim manual; nuk mund të hapet lidhje e re.", code: "POK_REVIEW_REQUIRED" } };
          }
          let reusable: typeof existingOrders[number] | undefined;
          // Every payable historic intent, including superseded/expired ones on a
          // different account, must be checked before issuing another payable URL.
          for (const existing of existingOrders) {
            if (!existing.providerOrderId) return { status: 503, body: { error: "POK porosia nuk ka ID; verifikimi manual kërkohet." } };
            const boundAccount = await getPokAccountById(existing.accountId);
            if (!boundAccount) return { status: 503, body: { error: "Llogaria e pagesës nuk është më e disponueshme" } };
            const prev = await pokGetOrder(existing.providerOrderId, boundAccount);
            if (!prev) return { status: 503, body: { error: "POK nuk konfirmoi statusin e porosisë; kontrolli i dashboard-it kërkohet para çdo veprimi." } };
            const evidence = pokPaymentEvidence(prev, existing.providerOrderId, lockedBooking.bookingRef, existing.amount);
            if (evidence.kind === "uncertain") {
              return { status: 503, body: { error: `POK statusi i porosisë nuk u verifikua (${evidence.reason}); kontroll manual kërkohet.` } };
            }
            if (evidence.kind === "paid") {
              const result = await recordPokPaymentFromOrder(prev, existing.accountId, tx);
              return {
                status: result.ok ? 400 : 503,
                body: { error: result.ok ? "Pagesa është kryer tashmë për këtë rezervim." : `Pagesa kërkon verifikim (${result.reason}); nuk mund të hapet lidhje e re.`,
                  ...(result.reason === "review_required" ? { code: "POK_REVIEW_REQUIRED" } : {}),
                  __invoicePaymentId: result.invoicePaymentId },
              };
            }
            if (isProviderExpiredUnpaid(prev, existing.providerOrderId, lockedBooking.bookingRef, existing.amount)) {
              // Preserve the order/account for late payment reconciliation. It remains
              // in existingOrders on every retry and is checked again before creation.
              if (existing.status !== "expired") {
                await tx.update(pokOrdersTable).set({ status: "expired", updatedAt: now })
                  .where(eq(pokOrdersTable.id, existing.id));
              }
              continue;
            }
            if (existing.status === "expired") {
              // A local timeout is not provider proof of expiry.
              return { status: 503, body: { error: "Porosia e vjetër POK mund të paguhet ende; kërkohet kontroll manual." } };
            }
            if (!createNewLinkEachAttempt) {
              const providerTerminal = terminalPokFailureStatus(prev.status) !== null ||
                prev.isExpired === true || prev.isCancelled === true;
              if (!providerTerminal && canReusePokOrder(existing, lockedBooking.id, existing.accountId, lockedDue, now, evidence.kind === "unpaid")) reusable = existing;
              else if (existing.status === "created" || existing.status === "pending")
                return { status: 503, body: { error: "Porosia ekzistuese POK kërkon kontroll manual para riprovimit." } };
              continue;
            }
            if (shouldSupersedePokOrder(existing.status, createNewLinkEachAttempt, evidence.kind === "unpaid")) {
              await tx.update(pokOrdersTable).set({ status: "superseded", updatedAt: now })
                .where(eq(pokOrdersTable.id, existing.id));
            }
          }
          if (lockedDue <= 0) return { status: 400, body: { error: "Booking is already paid" } };
          if (reusable) {
            if (!reusable.confirmUrl) return { status: 503, body: { error: "POK porosia nuk ka lidhje të plotë; verifikimi manual kërkohet." } };
            const reusedUrl = new URL(reusable.confirmUrl);
            reusedUrl.searchParams.delete("firstName");
            reusedUrl.searchParams.delete("lastName");
            const sanitizedConfirmUrl = reusedUrl.toString();
            if (sanitizedConfirmUrl !== reusable.confirmUrl) {
              await tx.update(pokOrdersTable).set({ confirmUrl: sanitizedConfirmUrl, updatedAt: new Date() })
                .where(eq(pokOrdersTable.id, reusable.id));
            }
            return { status: 200, body: { confirmUrl: sanitizedConfirmUrl, reused: true } };
          }

          const [intent] = await tx.insert(pokOrdersTable).values({
            bookingId: lockedBooking.id,
            accountId: activeAccount.id,
            providerOrderId: null,
            confirmUrl: null,
            amount: String(lockedDue),
            status: "creating",
            expiresAt: new Date(Date.now() + 55 * 60 * 1000),
          }).returning({ id: pokOrdersTable.id });
          if (!intent) return { status: 503, body: { error: "POK porosia nuk u ruajt; pagesa nuk u nis." } };
          const token = await pokGetToken(activeAccount);
          let orderRes: Response;
          try {
            orderRes = await fetch(`${POK_BASE}/merchants/${activeAccount.merchantId}/sdk-orders`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                // POK documentation/types in this repository do not
                // advertise idempotency support. Send a stable key if the
                // gateway honors it; unknown outcomes remain fail-closed.
                "Idempotency-Key": `pok-booking-${lockedBooking.id}-intent-${intent.id}`,
              },
              signal: AbortSignal.timeout(15_000),
              body: JSON.stringify({
                amount: lockedDue,
                currencyCode: "EUR",
                autoCapture: true,
                merchantCustomReference: lockedBooking.bookingRef,
                redirectUrl, failRedirectUrl, webhookUrl,
                expiresAfterMinutes: 60,
                description: `Rezervim ${lockedBooking.bookingRef} — ${lockedBooking.customerName}`,
              }),
            });
          } catch {
            await tx.update(pokOrdersTable).set({ status: "unknown", updatedAt: new Date() }).where(eq(pokOrdersTable.id, intent.id));
            return { status: 503, body: { error: "POK përgjigj në mënyrë të panjohur; verifikimi manual kërkohet para riprovimit." } };
          }
          if (!orderRes.ok) {
            const txt = await orderRes.text();
            const explicitRejection = isExplicitPokCreationRejection(orderRes.status);
            await tx.update(pokOrdersTable).set({ status: explicitRejection ? "failed" : "unknown", updatedAt: new Date() }).where(eq(pokOrdersTable.id, intent.id));
            req.log?.error({ status: orderRes.status, bodyLength: txt.length }, "POK order creation failed");
            return explicitRejection
              ? { status: 400, body: { error: "POK refuzoi validimin ose autentikimin; porosia nuk u krijua." } }
              : { status: 503, body: { error: "POK përgjigj në mënyrë të panjohur; verifikimi manual kërkohet para riprovimit." } };
          }
          let orderData: any;
          try {
            orderData = await orderRes.json() as any;
          } catch {
            await tx.update(pokOrdersTable).set({ status: "unknown", updatedAt: new Date() }).where(eq(pokOrdersTable.id, intent.id));
            return { status: 503, body: { error: "POK përgjigj në mënyrë të panjohur; verifikimi manual kërkohet para riprovimit." } };
          }
          const sdkOrder = orderData?.data?.sdkOrder ?? orderData?.data ?? orderData;
          const confirmUrl: string = sdkOrder?._self?.confirmUrl ?? sdkOrder?.__self?.confirmUrl ??
            orderData?.data?._self?.confirmUrl ?? orderData?._self?.confirmUrl;
          if (!confirmUrl || !sdkOrder?.id) {
            await tx.update(pokOrdersTable).set({ status: "unknown", updatedAt: new Date() }).where(eq(pokOrdersTable.id, intent.id));
            req.log?.error({ hasConfirmUrl: Boolean(confirmUrl), hasOrderId: Boolean(sdkOrder?.id) }, "POK response missing order fields");
            return { status: 503, body: { error: "POK porosia ka rezultat të panjohur; verifikimi manual kërkohet para riprovimit." } };
          }
          let url: URL;
          try {
            url = new URL(confirmUrl);
            if (url.protocol !== "https:") throw new Error("Invalid payment URL");
          } catch {
            // The provider may already have created a payable order. Preserve
            // the intent instead of rolling it back and allowing a blind retry.
            await tx.update(pokOrdersTable).set({
              status: "unknown", providerOrderId: String(sdkOrder.id), updatedAt: new Date(),
            }).where(eq(pokOrdersTable.id, intent.id));
            return { status: 503, body: { error: "Lidhja POK nuk u verifikua; kërkohet kontroll manual para riprovimit." } };
          }
          if (lockedBooking.customerEmail) url.searchParams.set("email", lockedBooking.customerEmail);
          url.searchParams.set("language", "AL");
          const [bound] = await tx.update(pokOrdersTable).set({
            providerOrderId: String(sdkOrder.id),
            confirmUrl: url.toString(),
            status: "created",
            updatedAt: new Date(),
          }).where(and(eq(pokOrdersTable.id, intent.id), eq(pokOrdersTable.bookingId, lockedBooking.id), eq(pokOrdersTable.accountId, activeAccount.id))).returning();
          if (!bound?.providerOrderId || !bound.confirmUrl) return { status: 503, body: { error: "POK porosia nuk u lidh me rezervimin; verifikimi manual kërkohet." } };
          return { status: 200, body: { confirmUrl: bound.confirmUrl } };
        });
        if (transactionResult.body?.__invoicePaymentId) {
          void sendPaymentInvoice(transactionResult.body.__invoicePaymentId).catch(() => {});
          delete transactionResult.body.__invoicePaymentId;
        }
        return transactionResult;
      } catch (err: any) {
        req.log?.error({ errorCode: err?.code ?? err?.name ?? "provider_error" }, "POK initiate error");
        return { status: 503, body: { error: "POK nuk u verifikua; provoni përsëri më vonë." } };
      }
    })();
    pokInitiateInflight.set(booking.bookingRef, flight);
    flight.finally(() => pokInitiateInflight.delete(booking.bookingRef)).catch(() => {});
  }

  const out = await flight;
  res.status(out.status).json(out.body);
});

// POST /public/bookings/:ref/pok-verify
// Called by the PaymentReturn page after POK redirects the customer back. Fetches
// the order from POK (source of truth) by orderId and records the payment if
// completed. Idempotent — safe alongside the webhook. Requires the booking session.
router.post("/public/bookings/:ref/pok-verify", requireAuth, async (req, res): Promise<void> => {
  await ensurePokAccount();
  const userId = req.session.userId!;
  const ref = req.params.ref;
  const orderId = String((req.body as any)?.orderId ?? "").trim();
  if (!orderId) { res.status(400).json({ error: "Missing orderId" }); return; }

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const [row] = await db.select().from(bookingsTable).where(eq(bookingsTable.bookingRef, ref));
  if (!row) { res.status(404).json({ error: "Booking not found" }); return; }
  const allowed = row.bookingUserId === userId ||
    (user.agentId !== null && row.agentId === user.agentId);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  try {
    const [registered] = await db.select().from(pokOrdersTable)
      .where(and(eq(pokOrdersTable.providerOrderId, orderId), eq(pokOrdersTable.bookingId, row.id))).limit(1);
    if (!registered) { res.status(400).json({ error: "Order does not match booking" }); return; }
    const account = await getPokAccountById(registered.accountId);
    if (!account) { res.status(503).json({ error: "Llogaria e pagesës nuk është më e disponueshme" }); return; }
    const order = await pokGetOrder(orderId, account);
    if (!order) { res.status(503).json({ error: "Could not verify payment with provider" }); return; }
    if (order?.merchantCustomReference !== ref) {
      res.status(400).json({ error: "Order does not match booking" }); return;
    }
    const result = await recordPokPaymentFromOrder(order, registered.accountId);
    req.log?.info({ ref, orderId, result }, "POK verify processed");
    res.status(result.ok || result.reason === "unpaid" ? 200 : 503)
      .json({ ...result, ...(result.reason === "review_required" ? { code: "POK_REVIEW_REQUIRED" } : {}) });
  } catch (err: any) {
    req.log?.error({ errorCode: err?.code ?? err?.name ?? "provider_error" }, "POK verify error");
    res.status(503).json({ error: "Verification failed" });
  }
});

// POST /public/pok-webhook
// Called by POK after payment. The webhook body may be a thin notification, so we
// extract an order id from any shape POK might send and then re-fetch the
// authoritative order from POK to decide whether to record the payment.
router.post("/public/pok-webhook", async (req, res): Promise<void> => {
  try {
    await ensurePokAccount();
    const body = req.body as any;
    req.log?.info("POK webhook received");

    const inline = body?.data?.sdkOrder ?? body?.sdkOrder ?? body?.data ?? body;
    const orderId: string | undefined =
      inline?.id ?? body?.orderId ?? body?.sdkOrderId ?? body?.data?.id ?? body?.id;

    if (!orderId) {
      req.log?.warn("POK webhook: no order id in payload");
      res.status(503).json({ ok: false, error: "order_id_unresolved_retry" });
      return;
    }

    // Resolve the durable binding only inside the global configuration lock;
    // an unlocked pre-read could race a legacy bind on another worker.
    let registered: any = null;
    if (!registered) {
      // Orders created before durable binding may still be in flight. Resolve
      // them only through the bootstrapped legacy account, validate the
      // provider reference against a real booking, then bind before recording.
      await ensurePokAccount();
      let legacyAccount: PokCredentials | null = null;
      let legacyOrder: any | null = null;
      try {
        // Keep the global configuration lock continuously held from the
        // account read/decrypt through provider lookup and binding. This
        // prevents credential rotation from splitting lookup and bind.
        registered = await db.transaction(async (tx) => {
          await lockPokAccountConfig(tx);
          const [alreadyBound] = await tx.select().from(pokOrdersTable)
            .where(eq(pokOrdersTable.providerOrderId, orderId)).limit(1);
          if (alreadyBound) return alreadyBound;
          legacyAccount = await getLegacyPokAccount(tx);
          if (!legacyAccount) return null;
          legacyOrder = await pokGetOrder(orderId, legacyAccount);
          if (!legacyOrder) return null;
          const legacyRef = typeof legacyOrder.merchantCustomReference === "string"
            ? legacyOrder.merchantCustomReference.trim() : "";
          if (!legacyRef) return null;
          const [legacyBooking] = await tx.select().from(bookingsTable)
            .where(eq(bookingsTable.bookingRef, legacyRef)).limit(1);
          if (!legacyBooking) return null;
          // Lock ordering is always global config -> booking -> account.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-booking-${legacyBooking.id}`}))`);
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-account-${legacyAccount.id}`}))`);
          const [currentLegacyAccount] = await tx.select({
            merchantId: pokAccountsTable.merchantId, keyId: pokAccountsTable.keyId,
          }).from(pokAccountsTable).where(eq(pokAccountsTable.id, legacyAccount.id)).limit(1);
          if (!currentLegacyAccount || currentLegacyAccount.merchantId !== legacyAccount.merchantId ||
            currentLegacyAccount.keyId !== legacyAccount.keyId) return null;
          const [bound] = await tx.select().from(pokOrdersTable)
            .where(eq(pokOrdersTable.providerOrderId, orderId)).limit(1);
          if (bound) return bound;
          const activeRows = await tx.select().from(pokOrdersTable).where(and(
            eq(pokOrdersTable.bookingId, legacyBooking.id),
            or(eq(pokOrdersTable.status, "creating"), eq(pokOrdersTable.status, "unknown"),
              eq(pokOrdersTable.status, "created"), eq(pokOrdersTable.status, "pending")),
          ));
          const now = new Date();
          for (const active of activeRows) {
            if ((active.status === "created" || active.status === "pending") && active.expiresAt < now) {
              await tx.update(pokOrdersTable).set({ status: "expired", updatedAt: now }).where(eq(pokOrdersTable.id, active.id));
            } else if (active.status === "creating" || active.status === "unknown" ||
              (active.providerOrderId && active.providerOrderId !== orderId)) return null;
          }
          const legacyAmount = Number(legacyOrder?.finalAmount ?? legacyOrder?.amount ?? 0);
          if (legacyAmount <= 0) return null;
          const legacyPayments = await tx.select().from(paymentsTable)
            .where(eq(paymentsTable.bookingId, legacyBooking.id));
          const legacyPaid = legacyPayments.reduce((sum: number, p: any) =>
            sum + (p.status === "completed" ? (p.isRefund ? -Number(p.amount) : Number(p.amount)) : 0), 0);
          if (legacyBooking.status === "cancelled" ||
            Math.abs(legacyAmount - (Number(legacyBooking.totalAmount) - legacyPaid)) > 0.009) return null;
          const legacyEvidence = pokPaymentEvidence(legacyOrder, orderId, legacyRef, legacyAmount);
          if (legacyEvidence.kind === "uncertain") return null;
          const legacyConfirmUrl = legacyOrder?._self?.confirmUrl ?? legacyOrder?.__self?.confirmUrl ?? null;
          await tx.insert(pokOrdersTable).values({
            bookingId: legacyBooking.id, accountId: legacyAccount.id, providerOrderId: orderId,
            confirmUrl: legacyConfirmUrl, amount: String(legacyAmount), status: "created",
            expiresAt: new Date(Date.now() + 55 * 60 * 1000),
          }).onConflictDoNothing();
          const [created] = await tx.select().from(pokOrdersTable)
            .where(eq(pokOrdersTable.providerOrderId, orderId)).limit(1);
          if (!created) return null;
          // The bound callback below records after commit. No invoice is sent
          // for a provider order whose binding can still roll back.
          return created;
        });
      } catch (err: any) {
        req.log?.error({ orderId, errorCode: err?.code ?? "provider_error" }, "POK webhook: legacy order lookup retry");
        res.status(503).json({ ok: false, error: "legacy_order_lookup_retry" });
        return;
      }
      if (!registered) {
       res.status(503).json({ ok: false, error: "order_not_found_requires_dashboard_reconciliation" });
        return;
      }
    }
    if (!registered) {
      res.status(503).json({ ok: false, error: "legacy_order_unresolved" });
      return;
    }
    const account = await getPokAccountById(registered.accountId);
    if (!account) {
      req.log?.error({ orderId }, "POK webhook: bound account unavailable");
      res.status(503).json({ ok: false, error: "account_unavailable" });
      return;
    }
    let order: any | null;
    try {
      order = await pokGetOrder(orderId, account);
    } catch (err: any) {
      // Transient failure (network/timeout/auth/5xx): the customer may have PAID
      // this order. Answer 503 so POK RETRIES the webhook later — a 200 here made
      // POK stop retrying and silently lose paid orders (17.07 KTF7615 incident).
      req.log?.error({ orderId, errorCode: err?.code ?? err?.name ?? "provider_error" }, "POK webhook: order fetch failed transiently — asking POK to retry");
      notifyPokWebhookFailure(orderId, "provider lookup temporarily unavailable");
      res.status(503).json({ ok: false, error: "order_fetch_failed_retry" });
      return;
    }
    if (!order) {
      // A 404 alone does not establish cancellation/expiry in this adapter.
      // Keep the bound intent unresolved until an operator confirms the
      // provider dashboard's terminal state.
      req.log?.warn({ orderId }, "POK webhook: order not found at POK");
      res.status(503).json({ ok: false, error: "order_not_found_requires_dashboard_reconciliation" });
      return;
    }

    const [boundBooking] = await db.select({ bookingRef: bookingsTable.bookingRef })
      .from(bookingsTable).where(eq(bookingsTable.id, registered.bookingId)).limit(1);
    if (!boundBooking || order?.merchantCustomReference !== boundBooking.bookingRef) {
      req.log?.warn({ orderId }, "POK webhook: provider reference does not match bound booking");
      res.status(503).json({ ok: false, error: "booking_binding_unresolved" });
      return;
    }
    const result = await recordPokPaymentFromOrder(order, registered.accountId);
    if (!result.ok && result.reason !== "unpaid") {
      res.status(503).json({ ok: false, error: "payment_record_retry",
        ...(result.reason === "review_required" ? { code: "POK_REVIEW_REQUIRED" } : {}) });
      return;
    }
    req.log?.info({ orderId, result }, "POK webhook processed");
    res.status(200).json({ ...result });
  } catch (err: any) {
    // DB or other internal error while recording — recording is idempotent by
    // (bookingId, reference=orderId), so let POK retry instead of losing it.
    req.log?.error({ errorCode: err?.code ?? err?.name ?? "internal_error" }, "POK webhook error — asking POK to retry");
    res.status(503).json({ ok: false, error: "processing_retry" });
  }
});

// Njoftim email (i throttled 1h/order) kur webhook-u s'e verifikon dot porosinë te POK.
const pokWebhookFailEmailAt = new Map<string, number>();
function notifyPokWebhookFailure(orderId: string, reason: string): void {
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (!notifyTo) return;
  const last = pokWebhookFailEmailAt.get(orderId) ?? 0;
  if (Date.now() - last < 60 * 60 * 1000) return;
  pokWebhookFailEmailAt.set(orderId, Date.now());
  // Prune old entries so the map doesn't grow forever.
  for (const [k, t] of pokWebhookFailEmailAt) {
    if (Date.now() - t > 24 * 60 * 60 * 1000) pokWebhookFailEmailAt.delete(k);
  }
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  sendEmail(
    notifyTo,
    `⚠️ POK webhook: pagesa nuk u verifikua dot (order ${orderId})`,
    `<p>Webhook-u i POK erdhi për order <b>${esc(orderId)}</b>, por rikthimi i porosisë nga POK dështoi:</p>` +
    `<p><code>${esc(reason)}</code></p>` +
    `<p>Serveri iu përgjigj POK me 503, kështu që POK do ta riprovojë webhook-un vetë. ` +
    `Nëse ky email përsëritet për të njëjtin order, verifikojeni pagesën manualisht në panelin e POK.</p>`
  ).catch(() => {});
}

// Public read of the social-proof badge toggle. The booking-engine reads this to
// decide whether to show the "X persona rezervuan ... min më parë" badges on
// flight cards. Admin controls it from flight-system Settings.
router.get("/public/social-proof", async (_req, res): Promise<void> => {
  res.json({ enabled: await getSocialProofEnabled() });
});

export default router;
