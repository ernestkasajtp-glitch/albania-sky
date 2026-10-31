import { and, eq, gte, lte, or, sql, type SQL } from "drizzle-orm";
import { getGuestFlightPolicy } from "./guestFlightAccess.js";
import { getPublicEnrollment } from "./publicEnrollment.js";
import { getAgentGroupPeriod, validGroupPeriod } from "./agentGroupPeriod.js";
import {
  db, agentsTable, agentFlightVisibilityTable, agencyGroupsTable, agencyGroupRulesTable, bookingUsersTable, flightsTable,
  type AgentFlightVisibilityRule,
} from "@workspace/db";

type VisibilityRule = Pick<AgentFlightVisibilityRule, "flightId" | "fromAirport" | "toAirport" | "dateFrom" | "dateTo">;

export type FlightVisibility = {
  seesHiddenFlights: boolean;
  rules: VisibilityRule[];
  grouped?: boolean;
  denied?: boolean;
  publicOnly?: boolean;
  groupRules?: { airport: string; direction: string; dateFrom?: string | null; dateTo?: string | null }[];
};

export async function getFlightVisibilityForAgent(
  agentId: number | null,
  seesHiddenFlights = false,
): Promise<FlightVisibility> {
  if (!agentId) return { seesHiddenFlights: false, rules: [] };
  const [agent] = await db.select({ groupId: agentsTable.groupId }).from(agentsTable)
    .where(eq(agentsTable.id, agentId));
  // A stale booking-user reference must not be treated as a guest.
  if (!agent) return { seesHiddenFlights: false, rules: [], denied: true };
  // An agency without a group is never allowed to discover/book flights,
  // regardless of legacy defaults, exclusions, own rules or hidden-flight access.
  if (agent.groupId === null) return { seesHiddenFlights: false, rules: [], denied: true };
  const [ownRules, groupRules, period] = await Promise.all([
    db.select().from(agentFlightVisibilityTable)
      .where(eq(agentFlightVisibilityTable.agentId, agentId)),
    db.select({
      airport: agencyGroupRulesTable.airport, direction: agencyGroupRulesTable.direction,
      dateFrom: agencyGroupRulesTable.dateFrom, dateTo: agencyGroupRulesTable.dateTo,
    }).from(agencyGroupRulesTable).where(eq(agencyGroupRulesTable.groupId, agent.groupId)),
    getAgentGroupPeriod(agentId, agent.groupId),
  ]);
  // Replace only the inherited dates, never the airports, directions or own exceptions.
  // Legacy undated group rules are unlimited and may receive a personal window.
  // Invalid or half-missing group windows cannot be repaired into a grant.
  return { seesHiddenFlights, rules: ownRules, grouped: true, groupRules: groupRules.map(rule =>
    period && ((rule.dateFrom == null && rule.dateTo == null) || validGroupPeriod(rule.dateFrom, rule.dateTo))
      ? { ...rule, dateFrom: period.dateFrom, dateTo: period.dateTo }
      : rule) };
}

// For search options that do not otherwise need the agent's pricing context.
export async function resolveFlightVisibility(req: { session?: { userId?: number } }): Promise<FlightVisibility> {
  const userId = req.session?.userId;
  if (!userId) {
    const policy = await getGuestFlightPolicy();
    if (policy.groupId === null) return { seesHiddenFlights: false, rules: [], denied: true };
    const [group] = await db.select({ id: agencyGroupsTable.id }).from(agencyGroupsTable)
      .where(eq(agencyGroupsTable.id, policy.groupId));
    if (!group) return { seesHiddenFlights: false, rules: [], denied: true };
    const groupRules = await db.select({
      airport: agencyGroupRulesTable.airport, direction: agencyGroupRulesTable.direction,
      dateFrom: agencyGroupRulesTable.dateFrom, dateTo: agencyGroupRulesTable.dateTo,
    }).from(agencyGroupRulesTable).where(eq(agencyGroupRulesTable.groupId, group.id));
    return { seesHiddenFlights: false, rules: [], grouped: true, publicOnly: true, groupRules };
  }
  const [user] = await db.select({ agentId: bookingUsersTable.agentId })
    .from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user) return { seesHiddenFlights: false, rules: [], denied: true };
  const enrollment = await getPublicEnrollment(userId);
  if (enrollment) {
    if (!enrollment.approvedAt || !enrollment.groupId) return { seesHiddenFlights: false, rules: [], denied: true };
    // Clients retain their role and pricing; enrollment is their group membership.
    // An admin PATCH cannot bypass approval by changing agent_id or is_approved.
    if (!user.agentId) {
      const groupRules = await db.select().from(agencyGroupRulesTable).where(eq(agencyGroupRulesTable.groupId, enrollment.groupId));
      return { seesHiddenFlights: false, grouped: true, rules: [], groupRules };
    }
  }
  if (!user.agentId) return { seesHiddenFlights: false, rules: [] };
  const [agent] = await db.select({ seesHiddenFlights: agentsTable.seesHiddenFlights })
    .from(agentsTable).where(eq(agentsTable.id, user.agentId));
  if (!agent) return { seesHiddenFlights: false, rules: [], denied: true };
  return getFlightVisibilityForAgent(user.agentId, agent.seesHiddenFlights === true);
}

// Guests require an existing selected group; logged-in non-agency customers
// retain public visibility. Guest group rules never unlock hidden rows.
// Agencies without a group (or with a dangling reference) fail closed.
// Group and agency-specific rules form a strict allowlist, even with the legacy flag.
// Route windows also unlock matching flights marked "Fshehur"; explicit flight
// exceptions can match outside every route/date window.
export function bookingEngineVisibilityConds(access: FlightVisibility): SQL[] {
  if (access.denied) return [sql`false`];
  if (!access.rules.length && !access.groupRules?.length) {
    if (access.grouped) return [sql`false`];
    return access.seesHiddenFlights ? [] : [eq(flightsTable.showInBookingEngine, true)];
  }
  const matches = access.rules.map((rule) => {
    if (rule.flightId !== null) return eq(flightsTable.id, rule.flightId);
    // Both airports missing would widen access to every route; fail closed
    // even if a malformed row ever bypasses the database constraint.
    if (!rule.fromAirport && !rule.toAirport) return sql`false`;
    return and(
      rule.fromAirport ? eq(sql<string>`upper(trim(${flightsTable.fromCity}))`, rule.fromAirport) : undefined,
      rule.toAirport ? eq(sql<string>`upper(trim(${flightsTable.toCity}))`, rule.toAirport) : undefined,
      gte(flightsTable.departureDate, rule.dateFrom!),
      lte(flightsTable.departureDate, rule.dateTo!),
    )!;
  });
  for (const rule of access.groupRules ?? []) {
    if (!/^[A-Z]{3}$/.test(rule.airport)) { matches.push(sql`false`); continue; }
    if (!(rule.dateFrom == null && rule.dateTo == null) && !validGroupPeriod(rule.dateFrom, rule.dateTo)) {
      matches.push(sql`false`); continue;
    }
    const from = eq(sql<string>`upper(trim(${flightsTable.fromCity}))`, rule.airport);
    const to = eq(sql<string>`upper(trim(${flightsTable.toCity}))`, rule.airport);
    const airportMatch = rule.direction === "either" ? or(from, to)! :
      rule.direction === "from" ? from : rule.direction === "to" ? to : sql`false`;
    matches.push(and(
      airportMatch,
      rule.dateFrom != null ? gte(flightsTable.departureDate, rule.dateFrom) : undefined,
      rule.dateTo != null ? lte(flightsTable.departureDate, rule.dateTo) : undefined,
    )!);
  }
  return access.publicOnly
    ? [eq(flightsTable.showInBookingEngine, true), or(...matches)!]
    : [or(...matches)!];
}