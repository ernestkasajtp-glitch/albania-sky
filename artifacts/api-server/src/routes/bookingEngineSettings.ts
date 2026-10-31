import { Router, type IRouter } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db, flightsTable, agentsTable, agentFlightVisibilityTable,
  agentFlightDefaultRulesTable, agentFlightDefaultExclusionsTable, agencyGroupsTable, agencyGroupRulesTable,
} from "@workspace/db";
import { clearAgentGroupPeriod, getAgentGroupPeriod, setAgentGroupPeriod, validGroupPeriod } from "../lib/agentGroupPeriod.js";

const router: IRouter = Router();

function adminOnly(req: any, res: any, next: any) {
  if (!req.session?.userId || req.session?.role !== "admin") {
    res.status(403).json({ error: "Admin only" }); return;
  }
  next();
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function groupName(body: any): string | null {
  const name = body?.name;
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= 120 ? name.trim() : null;
}

router.get("/booking-engine/agency-groups", adminOnly, async (_req, res): Promise<void> => {
  const [groups, rules, counts] = await Promise.all([
    db.select().from(agencyGroupsTable).orderBy(agencyGroupsTable.name),
    db.select().from(agencyGroupRulesTable).orderBy(agencyGroupRulesTable.id),
    db.select({ groupId: agentsTable.groupId, count: sql<number>`count(*)::int` })
      .from(agentsTable).groupBy(agentsTable.groupId),
  ]);
  const countByGroup = new Map(counts.map(row => [row.groupId, Number(row.count)]));
  res.json(groups.map(group => ({
    ...group, agentCount: countByGroup.get(group.id) ?? 0,
    rules: rules.filter(rule => rule.groupId === group.id),
  })));
});

router.post("/booking-engine/agency-groups", adminOnly, async (req, res): Promise<void> => {
  const name = groupName(req.body);
  if (!name) { res.status(400).json({ error: "Group name is required (max 120 characters)" }); return; }
  const [created] = await db.insert(agencyGroupsTable).values({ name }).onConflictDoNothing().returning();
  if (!created) { res.status(409).json({ error: "Group name already exists" }); return; }
  res.status(201).json({ ...created, agentCount: 0, rules: [] });
});

router.patch("/booking-engine/agency-groups/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const name = groupName(req.body);
  if (!validId(id) || !name) { res.status(400).json({ error: "Valid group id and name required" }); return; }
  const [existing] = await db.select().from(agencyGroupsTable).where(eq(agencyGroupsTable.name, name));
  if (existing && existing.id !== id) { res.status(409).json({ error: "Group name already exists" }); return; }
  const [updated] = await db.update(agencyGroupsTable).set({ name }).where(eq(agencyGroupsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Group not found" }); return; }
  const [rules, [{ count }]] = await Promise.all([
    db.select().from(agencyGroupRulesTable).where(eq(agencyGroupRulesTable.groupId, id))
      .orderBy(agencyGroupRulesTable.id),
    db.select({ count: sql<number>`count(*)::int` }).from(agentsTable).where(eq(agentsTable.groupId, id)),
  ]);
  res.json({ ...updated, agentCount: Number(count), rules });
});

router.delete("/booking-engine/agency-groups/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!validId(id)) { res.status(400).json({ error: "Invalid group id" }); return; }
  const [assigned] = await db.select({ id: agentsTable.id }).from(agentsTable)
    .where(eq(agentsTable.groupId, id)).limit(1);
  if (assigned) { res.status(409).json({ error: "Group has assigned agents" }); return; }
  try {
    const [deleted] = await db.delete(agencyGroupsTable).where(eq(agencyGroupsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Group not found" }); return; }
    res.sendStatus(204);
  } catch (error) {
    if ((error as any)?.code === "23503" || (error as any)?.cause?.code === "23503") {
      res.status(409).json({ error: "Group has assigned agents" }); return;
    }
    throw error;
  }
});

router.post("/booking-engine/agency-groups/:id/rules", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const airport = typeof req.body?.airport === "string" ? req.body.airport.trim().toUpperCase() : "";
  const direction = req.body?.direction;
  const dateFrom = req.body?.dateFrom;
  const dateTo = req.body?.dateTo;
  if (!validId(id) || !/^[A-Z]{3}$/.test(airport) || !["either", "from", "to"].includes(direction) ||
      !validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) {
    res.status(400).json({ error: "Valid group, airport, direction and departure date range required" }); return;
  }
  const [group] = await db.select({ id: agencyGroupsTable.id }).from(agencyGroupsTable).where(eq(agencyGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  const [created] = await db.insert(agencyGroupRulesTable).values({ groupId: id, airport, direction, dateFrom, dateTo })
    .onConflictDoNothing().returning();
  if (!created) { res.status(409).json({ error: "Rule already exists" }); return; }
  res.status(201).json(created);
});

router.patch("/booking-engine/agency-groups/:id/rules/:ruleId", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const ruleId = Number(req.params.ruleId);
  const airport = typeof req.body?.airport === "string" ? req.body.airport.trim().toUpperCase() : "";
  const direction = req.body?.direction;
  const dateFrom = req.body?.dateFrom;
  const dateTo = req.body?.dateTo;
  if (!validId(id) || !validId(ruleId) || !/^[A-Z]{3}$/.test(airport) ||
      !["either", "from", "to"].includes(direction) ||
      !validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) {
    res.status(400).json({ error: "Valid airport, direction and departure date range required" }); return;
  }
  try {
    const [updated] = await db.update(agencyGroupRulesTable).set({ airport, direction, dateFrom, dateTo })
      .where(and(eq(agencyGroupRulesTable.groupId, id), eq(agencyGroupRulesTable.id, ruleId))).returning();
    if (!updated) { res.status(404).json({ error: "Rule not found in this group" }); return; }
    res.json(updated);
  } catch (error) {
    if ((error as any)?.code === "23505" || (error as any)?.cause?.code === "23505") {
      res.status(409).json({ error: "Rule already exists for this date range" }); return;
    }
    throw error;
  }
});

router.delete("/booking-engine/agency-groups/:id/rules/:ruleId", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const ruleId = Number(req.params.ruleId);
  if (!validId(id) || !validId(ruleId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(agencyGroupRulesTable)
    .where(and(eq(agencyGroupRulesTable.groupId, id), eq(agencyGroupRulesTable.id, ruleId))).returning();
  if (!deleted) { res.status(404).json({ error: "Rule not found" }); return; }
  res.sendStatus(204);
});

router.get("/booking-engine/agents/:id/visibility-context", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!validId(id)) { res.status(400).json({ error: "Invalid agent id" }); return; }
  const [agent] = await db.select({ groupId: agentsTable.groupId }).from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  const [group, groupRules, excluded] = await Promise.all([
    agent.groupId === null ? Promise.resolve(undefined) : db.select().from(agencyGroupsTable)
      .where(eq(agencyGroupsTable.id, agent.groupId)).then(rows => rows[0]),
    agent.groupId === null ? Promise.resolve([]) : db.select().from(agencyGroupRulesTable)
      .where(eq(agencyGroupRulesTable.groupId, agent.groupId)).orderBy(agencyGroupRulesTable.id),
    db.select({ agentId: agentFlightDefaultExclusionsTable.agentId }).from(agentFlightDefaultExclusionsTable)
      .where(eq(agentFlightDefaultExclusionsTable.agentId, id)),
  ]);
  res.json({ groupId: agent.groupId, groupName: group?.name ?? null, groupRules, legacyExcluded: excluded.length > 0 });
});

function groupPeriodAdminOnly(req: any, res: any, next: any) {
  if (!req.session?.userId || req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm administratori ka akses" }); return;
  }
  next();
}

router.get("/booking-engine/agents/:id/group-period", groupPeriodAdminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!validId(id)) { res.status(400).json({ error: "ID e agjentit është e pavlefshme" }); return; }
  const [agent] = await db.select({ groupId: agentsTable.groupId }).from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) { res.status(404).json({ error: "Agjenti nuk u gjet" }); return; }
  const period = agent.groupId === null ? null : await getAgentGroupPeriod(id, agent.groupId);
  res.json({ groupId: agent.groupId, dateFrom: period?.dateFrom ?? null, dateTo: period?.dateTo ?? null });
});

router.put("/booking-engine/agents/:id/group-period", groupPeriodAdminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!validId(id)) { res.status(400).json({ error: "ID e agjentit është e pavlefshme" }); return; }
  const { dateFrom, dateTo } = req.body ?? {};
  const clear = dateFrom === null && dateTo === null;
  if (!clear && (typeof dateFrom !== "string" || typeof dateTo !== "string" || !validGroupPeriod(dateFrom, dateTo))) {
    res.status(400).json({ error: "Të dyja datat duhet të jenë data kalendarike ISO të vlefshme dhe të renditura, ose të dyja null" }); return;
  }
  const [agent] = await db.select({ groupId: agentsTable.groupId }).from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) { res.status(404).json({ error: "Agjenti nuk u gjet" }); return; }
  if (clear) {
    await clearAgentGroupPeriod(id);
    res.json({ groupId: agent.groupId, dateFrom: null, dateTo: null });
    return;
  }
  if (agent.groupId === null) { res.status(400).json({ error: "Agjenti duhet t'i përkasë një grupi" }); return; }
  const [group] = await db.select({ id: agencyGroupsTable.id }).from(agencyGroupsTable)
    .where(eq(agencyGroupsTable.id, agent.groupId));
  if (!group) { res.status(404).json({ error: "Grupi nuk u gjet" }); return; }
  await setAgentGroupPeriod(id, { groupId: group.id, dateFrom, dateTo });
  res.json({ groupId: group.id, dateFrom, dateTo });
});

// A scoped agent's rules are an allowlist for ALL Booking Engine flights.
// Only admins may see or change another agent's rules.
router.get("/booking-engine/agents/:id/visibility-rules", adminOnly, async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  if (!validId(agentId)) { res.status(400).json({ error: "Invalid agent id" }); return; }
  const [agent] = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  const rules = await db.select().from(agentFlightVisibilityTable)
    .where(eq(agentFlightVisibilityTable.agentId, agentId))
    .orderBy(agentFlightVisibilityTable.id);
  res.json(rules);
});

router.post("/booking-engine/agents/:id/visibility-rules", adminOnly, async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  if (!validId(agentId)) { res.status(400).json({ error: "Invalid agent id" }); return; }
  const [agent] = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

  const body = req.body ?? {};
  if (body.kind === "flight") {
    if (!validId(body.flightId) || body.fromAirport != null || body.toAirport != null || body.dateFrom != null || body.dateTo != null) {
      res.status(400).json({ error: "Select one valid flight" }); return;
    }
    const [flight] = await db.select({ id: flightsTable.id }).from(flightsTable).where(eq(flightsTable.id, body.flightId));
    if (!flight) { res.status(404).json({ error: "Flight not found" }); return; }
    const [duplicate] = await db.select({ id: agentFlightVisibilityTable.id }).from(agentFlightVisibilityTable)
      .where(and(eq(agentFlightVisibilityTable.agentId, agentId), eq(agentFlightVisibilityTable.flightId, body.flightId)));
    if (duplicate) { res.status(409).json({ error: "This exception already exists" }); return; }
    const [created] = await db.insert(agentFlightVisibilityTable).values({ agentId, flightId: body.flightId }).returning();
    res.status(201).json(created);
    return;
  }

  const fromAirport = typeof body.fromAirport === "string" ? body.fromAirport.trim().toUpperCase() : "";
  const toAirport = typeof body.toAirport === "string" ? body.toAirport.trim().toUpperCase() : "";
  if (body.kind !== "route" || body.flightId != null ||
      (!fromAirport && !toAirport) ||
      (fromAirport !== "" && !/^[A-Z]{3}$/.test(fromAirport)) ||
      (toAirport !== "" && !/^[A-Z]{3}$/.test(toAirport)) ||
      !validDate(body.dateFrom) || !validDate(body.dateTo) || body.dateFrom > body.dateTo) {
    res.status(400).json({ error: "Select at least one airport and a valid date range" }); return;
  }
  const [duplicate] = await db.select({ id: agentFlightVisibilityTable.id }).from(agentFlightVisibilityTable)
    .where(and(
      eq(agentFlightVisibilityTable.agentId, agentId),
      isNull(agentFlightVisibilityTable.flightId),
      fromAirport ? eq(agentFlightVisibilityTable.fromAirport, fromAirport) : isNull(agentFlightVisibilityTable.fromAirport),
      toAirport ? eq(agentFlightVisibilityTable.toAirport, toAirport) : isNull(agentFlightVisibilityTable.toAirport),
      eq(agentFlightVisibilityTable.dateFrom, body.dateFrom),
      eq(agentFlightVisibilityTable.dateTo, body.dateTo),
    ));
  if (duplicate) { res.status(409).json({ error: "This route rule already exists" }); return; }
  const [created] = await db.insert(agentFlightVisibilityTable).values({
    agentId, fromAirport: fromAirport || null, toAirport: toAirport || null,
    dateFrom: body.dateFrom, dateTo: body.dateTo,
  }).returning();
  res.status(201).json(created);
});

router.delete("/booking-engine/agents/:id/visibility-rules/:ruleId", adminOnly, async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  const ruleId = Number(req.params.ruleId);
  if (!validId(agentId) || !validId(ruleId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(agentFlightVisibilityTable)
    .where(and(eq(agentFlightVisibilityTable.id, ruleId), eq(agentFlightVisibilityTable.agentId, agentId)))
    .returning({ id: agentFlightVisibilityTable.id });
  if (!deleted) { res.status(404).json({ error: "Rule not found" }); return; }
  res.sendStatus(204);
});

// Global defaults are an additional allowlist for every non-excluded agency.
// An agency's own rules are never removed or overwritten by these endpoints.
router.get("/booking-engine/default-visibility-rules", adminOnly, async (_req, res): Promise<void> => {
  const rules = await db.select().from(agentFlightDefaultRulesTable)
    .orderBy(agentFlightDefaultRulesTable.id);
  res.json(rules);
});

router.post("/booking-engine/default-visibility-rules", adminOnly, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  if (body.kind === "flight") {
    if (!validId(body.flightId) || body.fromAirport != null || body.toAirport != null || body.dateFrom != null || body.dateTo != null) {
      res.status(400).json({ error: "Select one valid flight" }); return;
    }
    const [flight] = await db.select({ id: flightsTable.id }).from(flightsTable).where(eq(flightsTable.id, body.flightId));
    if (!flight) { res.status(404).json({ error: "Flight not found" }); return; }
    const [duplicate] = await db.select({ id: agentFlightDefaultRulesTable.id }).from(agentFlightDefaultRulesTable)
      .where(eq(agentFlightDefaultRulesTable.flightId, body.flightId));
    if (duplicate) { res.status(409).json({ error: "This default exception already exists" }); return; }
    const [created] = await db.insert(agentFlightDefaultRulesTable).values({ flightId: body.flightId }).returning();
    res.status(201).json(created);
    return;
  }

  const fromAirport = typeof body.fromAirport === "string" ? body.fromAirport.trim().toUpperCase() : "";
  const toAirport = typeof body.toAirport === "string" ? body.toAirport.trim().toUpperCase() : "";
  if (body.kind !== "route" || body.flightId != null ||
      (!fromAirport && !toAirport) ||
      (fromAirport !== "" && !/^[A-Z]{3}$/.test(fromAirport)) ||
      (toAirport !== "" && !/^[A-Z]{3}$/.test(toAirport)) ||
      !validDate(body.dateFrom) || !validDate(body.dateTo) || body.dateFrom > body.dateTo) {
    res.status(400).json({ error: "Select at least one airport and a valid date range" }); return;
  }
  const [duplicate] = await db.select({ id: agentFlightDefaultRulesTable.id }).from(agentFlightDefaultRulesTable)
    .where(and(
      isNull(agentFlightDefaultRulesTable.flightId),
      fromAirport ? eq(agentFlightDefaultRulesTable.fromAirport, fromAirport) : isNull(agentFlightDefaultRulesTable.fromAirport),
      toAirport ? eq(agentFlightDefaultRulesTable.toAirport, toAirport) : isNull(agentFlightDefaultRulesTable.toAirport),
      eq(agentFlightDefaultRulesTable.dateFrom, body.dateFrom),
      eq(agentFlightDefaultRulesTable.dateTo, body.dateTo),
    ));
  if (duplicate) { res.status(409).json({ error: "This default route rule already exists" }); return; }
  const [created] = await db.insert(agentFlightDefaultRulesTable).values({
    fromAirport: fromAirport || null, toAirport: toAirport || null,
    dateFrom: body.dateFrom, dateTo: body.dateTo,
  }).returning();
  res.status(201).json(created);
});

router.delete("/booking-engine/default-visibility-rules/:ruleId", adminOnly, async (req, res): Promise<void> => {
  const ruleId = Number(req.params.ruleId);
  if (!validId(ruleId)) { res.status(400).json({ error: "Invalid rule id" }); return; }
  const [deleted] = await db.delete(agentFlightDefaultRulesTable)
    .where(eq(agentFlightDefaultRulesTable.id, ruleId))
    .returning({ id: agentFlightDefaultRulesTable.id });
  if (!deleted) { res.status(404).json({ error: "Rule not found" }); return; }
  res.sendStatus(204);
});

router.get("/booking-engine/default-visibility-exclusions", adminOnly, async (_req, res): Promise<void> => {
  const [agents, exclusions] = await Promise.all([
    db.select({ id: agentsTable.id, name: agentsTable.name }).from(agentsTable).orderBy(agentsTable.name),
    db.select({ agentId: agentFlightDefaultExclusionsTable.agentId }).from(agentFlightDefaultExclusionsTable),
  ]);
  const excludedIds = new Set(exclusions.map(entry => entry.agentId));
  res.json(agents.map(agent => ({ ...agent, excluded: excludedIds.has(agent.id) })));
});

router.put("/booking-engine/default-visibility-exclusions/:agentId", adminOnly, async (req, res): Promise<void> => {
  const agentId = Number(req.params.agentId);
  if (!validId(agentId)) { res.status(400).json({ error: "Invalid agent id" }); return; }
  const [agent] = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  await db.insert(agentFlightDefaultExclusionsTable).values({ agentId }).onConflictDoNothing();
  res.json({ agentId, excluded: true });
});

router.delete("/booking-engine/default-visibility-exclusions/:agentId", adminOnly, async (req, res): Promise<void> => {
  const agentId = Number(req.params.agentId);
  if (!validId(agentId)) { res.status(400).json({ error: "Invalid agent id" }); return; }
  await db.delete(agentFlightDefaultExclusionsTable)
    .where(eq(agentFlightDefaultExclusionsTable.agentId, agentId));
  res.sendStatus(204);
});

// List all flights with booking engine visibility
router.get("/booking-engine/flights", adminOnly, async (req, res): Promise<void> => {
  const flights = await db
    .select({
      id: flightsTable.id,
      flightNumber: flightsTable.flightNumber,
      airline: flightsTable.airline,
      fromCity: flightsTable.fromCity,
      toCity: flightsTable.toCity,
      departureDate: flightsTable.departureDate,
      status: flightsTable.status,
      showInBookingEngine: flightsTable.showInBookingEngine,
    })
    .from(flightsTable)
    .orderBy(flightsTable.departureDate);

  res.json(flights);
});

// Toggle single flight visibility in booking engine
router.patch("/booking-engine/flights/:id/visibility", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { showInBookingEngine } = req.body;
  if (typeof showInBookingEngine !== "boolean") { res.status(400).json({ error: "showInBookingEngine must be boolean" }); return; }

  const [flight] = await db
    .update(flightsTable)
    .set({ showInBookingEngine })
    .where(eq(flightsTable.id, id))
    .returning({ id: flightsTable.id, showInBookingEngine: flightsTable.showInBookingEngine });

  if (!flight) { res.status(404).json({ error: "Flight not found" }); return; }
  res.json(flight);
});

// The legacy admin rules API was never enforced by the Booking Engine. Refuse
// writes instead of creating rules that appear to work but grant no access.
// Production has no legacy rows; this does not migrate or delete any data.
const legacyRuleNotice = (_req: any, res: any) => {
  res.status(410).json({ error: "Legacy flight rules are inactive; use /booking-engine/agents/:id/visibility-rules" });
};
router.get("/booking-engine/agent-rules", adminOnly, legacyRuleNotice);
router.post("/booking-engine/agent-rules", adminOnly, legacyRuleNotice);
router.delete("/booking-engine/agent-rules/:id", adminOnly, legacyRuleNotice);

export default router;
