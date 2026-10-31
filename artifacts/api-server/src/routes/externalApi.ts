import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, gte, ilike } from "drizzle-orm";
import { db, flightsTable, settingsTable, agentsTable } from "@workspace/db";
import { lookupAirport } from "../lib/airports";
import { getActiveRulesForAgent, agentUnitPrice, getAgentRoundWhole, type AgentPricing } from "../lib/priceRules.js";
import crypto from "crypto";
import { readFlightDiscount, readFlightDiscounts, discountForChannel, applyFlightDiscount, type FlightDiscount } from "../lib/flightDiscounts.js";

const router: IRouter = Router();

// ── Global (non-agent) API key stored in settings ─────────────────────────────

const API_KEY_SETTING = "external_api_key";

async function getGlobalApiKey(): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, API_KEY_SETTING));
  return rows[0]?.value ?? null;
}

async function requireGlobalApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const configured = await getGlobalApiKey();
  if (!configured) {
    res.status(503).json({ error: "External API is not enabled" });
    return;
  }
  const provided =
    (req.headers["x-api-key"] as string | undefined) ||
    req.headers["authorization"]?.toString().replace(/^Bearer\s+/i, "") ||
    (req.query.api_key as string | undefined);

  if (!provided || provided !== configured) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }
  next();
}

// ── Per-agent API key ─────────────────────────────────────────────────────────

type AgentRow = typeof agentsTable.$inferSelect;

async function resolveAgentByKey(req: Request, res: Response): Promise<AgentRow | null> {
  const provided =
    (req.headers["x-api-key"] as string | undefined) ||
    req.headers["authorization"]?.toString().replace(/^Bearer\s+/i, "") ||
    (req.query.api_key as string | undefined);

  if (!provided) {
    res.status(401).json({ error: "Missing API key — include X-API-Key header" });
    return null;
  }

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.apiKey, provided));

  if (!agent) {
    res.status(401).json({ error: "Invalid API key" });
    return null;
  }
  if (agent.status !== "active") {
    res.status(403).json({ error: "Agency account is not active" });
    return null;
  }
  return agent;
}

// ── Serialisers ────────────────────────────────────────────────────────────────

function serializeFlight(f: typeof flightsTable.$inferSelect, discount: FlightDiscount | null = null) {
  discount = discountForChannel(discount, "api");
  const fromInfo = lookupAirport(f.fromCity);
  const toInfo = lookupAirport(f.toCity);
  return {
    id: f.id,
    airline: f.airline,
    flight_number: f.flightNumber,
    from: f.fromCity,
    from_city: fromInfo ? fromInfo.city : f.fromCity,
    to: f.toCity,
    to_city: toInfo ? toInfo.city : f.toCity,
    departure_date: f.departureDate,
    departure_time: f.departureTime,
    arrival_date: f.arrivalDate,
    arrival_time: f.arrivalTime,
    currency: "EUR",
    price_adult: applyFlightDiscount(Number(f.adultPrice), discount),
    price_child: applyFlightDiscount(Number(f.childPrice), discount),
    price_infant: applyFlightDiscount(Number(f.infantPrice), discount),
    tax: Number(f.tax),
    total_seats: f.totalSeats,
    // Externally-blocked flights are reported as closed with 0 seats so
    // partners cannot sell them; field shape is unchanged.
    available_seats: f.externalSalesBlocked ? 0 : f.totalSeats - f.soldSeats,
    baggage: {
      cabin_kg: f.cabinBaggageKg !== null ? Number(f.cabinBaggageKg) : null,
      checked_count: f.checkedBaggageCount ?? null,
      checked_kg: f.checkedBaggageKg !== null ? Number(f.checkedBaggageKg) : null,
      checked_price: f.checkedBaggagePrice !== null ? Number(f.checkedBaggagePrice) : null,
    },
    status: f.externalSalesBlocked ? "closed" : f.status,
    updated_at: f.updatedAt.toISOString(),
  };
}

function agentPricingFor(agent: AgentRow, rules: AgentPricing["rules"], roundWhole: boolean): AgentPricing {
  return {
    agentId: agent.id,
    rules,
    discountType: agent.discountType ?? "percent",
    discountPercent: Number(agent.discountPercent ?? 0),
    discountFixed: Number(agent.discountFixed ?? 0),
    markup: Number(agent.markup ?? 0),
    markupPercent: Number(agent.markupPercent ?? 0),
    roundWhole,
  };
}

function serializeFlightForAgent(f: typeof flightsTable.$inferSelect, agent: AgentRow, rules: AgentPricing["rules"] = [], roundWhole = true, discount: FlightDiscount | null = null) {
  discount = discountForChannel(discount, "api");
  const fromInfo = lookupAirport(f.fromCity);
  const toInfo = lookupAirport(f.toCity);
  const pct = Number(agent.discountPercent);
  const fixed = Number(agent.discountFixed);
  const type = agent.discountType;
  const pricing = agentPricingFor(agent, rules, roundWhole);
  const adult = agentUnitPrice(Number(f.adultPrice), f, pricing);
  const child = agentUnitPrice(Number(f.childPrice), f, pricing);
  const infant = agentUnitPrice(Number(f.infantPrice), f, pricing);
  const ruleMode = pricing.rules.length > 0;
  const hasDiscount = ruleMode ? adult.price < Number(f.adultPrice) : (type === "fixed" ? fixed > 0 : pct > 0);

  return {
    id: f.id,
    airline: f.airline,
    flight_number: f.flightNumber,
    from: f.fromCity,
    from_city: fromInfo ? fromInfo.city : f.fromCity,
    to: f.toCity,
    to_city: toInfo ? toInfo.city : f.toCity,
    departure_date: f.departureDate,
    departure_time: f.departureTime,
    arrival_date: f.arrivalDate,
    arrival_time: f.arrivalTime,
    currency: "EUR",
    // Agency-specific prices (rule pricing or legacy discount already applied)
    price_adult:  applyFlightDiscount(adult.price, discount),
    price_child:  applyFlightDiscount(child.price, discount),
    price_infant: applyFlightDiscount(infant.price, discount),
    tax: Number(f.tax),
    total_seats: f.totalSeats,
    // Externally-blocked flights are reported as closed with 0 seats.
    available_seats: f.externalSalesBlocked ? 0 : f.totalSeats - f.soldSeats,
    baggage: {
      cabin_kg: f.cabinBaggageKg !== null ? Number(f.cabinBaggageKg) : null,
      checked_count: f.checkedBaggageCount ?? null,
      checked_kg: f.checkedBaggageKg !== null ? Number(f.checkedBaggageKg) : null,
      checked_price: f.checkedBaggagePrice !== null ? Number(f.checkedBaggagePrice) : null,
    },
    discount_applied: hasDiscount
      ? (ruleMode
          ? { type: "rule", percent: null, fixed: null }
          : { type, percent: type === "percent" ? pct : null, fixed: type === "fixed" ? fixed : null })
      : null,
    status: f.externalSalesBlocked ? "closed" : f.status,
    updated_at: f.updatedAt.toISOString(),
  };
}

// ── /v1/flights — global key, standard prices ─────────────────────────────────

router.get("/v1/flights", requireGlobalApiKey, async (req, res): Promise<void> => {
  const { from, to, date } = req.query as Record<string, string>;
  const today = new Date().toISOString().slice(0, 10);

  const conditions = [eq(flightsTable.status, "open"), gte(flightsTable.departureDate, today)];
  if (from) conditions.push(ilike(flightsTable.fromCity, from));
  if (to) conditions.push(ilike(flightsTable.toCity, to));
  if (date) conditions.push(eq(flightsTable.departureDate, date));

  const flights = await db
    .select()
    .from(flightsTable)
    .where(and(...conditions))
    .orderBy(flightsTable.departureDate, flightsTable.departureTime);

  const available = flights.filter(f => f.totalSeats - f.soldSeats > 0);

  res.json({
    count: available.length,
    currency: "EUR",
    generated_at: new Date().toISOString(),
    flights: await (async () => {
      const discounts = await readFlightDiscounts(available.map(f => f.id));
      return available.map(f => serializeFlight(f, discounts.get(f.id) ?? null));
    })(),
  });
});

router.get("/v1/flights/:id", requireGlobalApiKey, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid flight id" }); return; }
  const today = new Date().toISOString().slice(0, 10);
  const [flight] = await db
    .select()
    .from(flightsTable)
    .where(and(eq(flightsTable.id, id), eq(flightsTable.status, "open"), gte(flightsTable.departureDate, today)));
  if (!flight || flight.totalSeats - flight.soldSeats <= 0) {
    res.status(404).json({ error: "Flight not found" }); return;
  }
  res.json(serializeFlight(flight, await readFlightDiscount(flight.id)));
});

// ── /v1/agent/flights — per-agent key, agency-specific prices ─────────────────

// GET /v1/agent/flights?from=TIA&to=LGW&date=2026-07-20
router.get("/v1/agent/flights", async (req, res): Promise<void> => {
  const agent = await resolveAgentByKey(req, res);
  if (!agent) return;

  const { from, to, date } = req.query as Record<string, string>;
  const today = new Date().toISOString().slice(0, 10);

  const conditions = [eq(flightsTable.status, "open"), gte(flightsTable.departureDate, today)];
  if (from) conditions.push(ilike(flightsTable.fromCity, from));
  if (to) conditions.push(ilike(flightsTable.toCity, to));
  if (date) conditions.push(eq(flightsTable.departureDate, date));

  const flights = await db
    .select()
    .from(flightsTable)
    .where(and(...conditions))
    .orderBy(flightsTable.departureDate, flightsTable.departureTime);

  const available = flights.filter(f => f.totalSeats - f.soldSeats > 0);
  const rules = await getActiveRulesForAgent(agent.id);
  const roundWhole = await getAgentRoundWhole();

  res.json({
    count: available.length,
    currency: "EUR",
    agency: agent.name,
    generated_at: new Date().toISOString(),
    flights: await (async () => {
      const discounts = await readFlightDiscounts(available.map(f => f.id));
      return available.map(f => serializeFlightForAgent(f, agent, rules, roundWhole, discounts.get(f.id) ?? null));
    })(),
  });
});

// GET /v1/agent/flights/:id
router.get("/v1/agent/flights/:id", async (req, res): Promise<void> => {
  const agent = await resolveAgentByKey(req, res);
  if (!agent) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid flight id" }); return; }
  const today = new Date().toISOString().slice(0, 10);

  const [flight] = await db
    .select()
    .from(flightsTable)
    .where(and(eq(flightsTable.id, id), eq(flightsTable.status, "open"), gte(flightsTable.departureDate, today)));

  if (!flight || flight.totalSeats - flight.soldSeats <= 0) {
    res.status(404).json({ error: "Flight not found" }); return;
  }
  const rules = await getActiveRulesForAgent(agent.id);
  const roundWhole = await getAgentRoundWhole();
  res.json(serializeFlightForAgent(flight, agent, rules, roundWhole, await readFlightDiscount(flight.id)));
});

export { router as externalApiRouter };
