import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import {
  db, pool, agentsTable, flightsTable, agencyGroupsTable, agencyGroupRulesTable,
  agentFlightDefaultRulesTable, agentFlightVisibilityTable,
} from "@workspace/db";
import { bookingEngineVisibilityConds, getFlightVisibilityForAgent } from "../src/lib/flightVisibility.js";
import { groupFlightCondition, resolveGroupFlightFilter } from "../src/lib/groupFlightFilter.js";
import settingsRouter from "../src/routes/bookingEngineSettings.js";

// This deliberately cannot be pointed at a VPS/live PostgreSQL instance.
// REPLIT_ENVIRONMENT can say "production" even in the Replit workspace;
// check the actual local development DB identity instead of that label.
const dbUrl = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
if (process.env.AGENCY_GROUP_TEST_DB !== "development" ||
    dbUrl.hostname !== "helium" || dbUrl.pathname !== "/heliumdb" ||
    process.env.NODE_ENV === "production") {
  throw new Error("Refusing integration fixture writes: requires explicit development opt-in and local helium/heliumdb");
}

const marker = `agency-group-test-${randomUUID()}`;
const groupIds: number[] = [];
const agentIds: number[] = [];
const flightIds: number[] = [];
const defaultIds: number[] = [];
const ownIds: number[] = [];
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  // Fake session exists ONLY in this isolated Express test server.
  const role = req.header("x-test-role");
  if (role === "admin" || role === "agent") (req as any).session = { userId: 1, role };
  next();
});
app.use(settingsRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  if (server.listening) { resolve(); return; }
  server.once("listening", resolve);
  server.once("error", reject);
});

async function request(method: string, path: string, role?: string, body?: object) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  const response = await fetch(`http://127.0.0.1:${address.port}/booking-engine${path}`, {
    method,
    headers: { ...(role ? { "x-test-role": role } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, payload };
}

async function visible(agentId: number, seesHiddenFlights: boolean) {
  const access = await getFlightVisibilityForAgent(agentId, seesHiddenFlights);
  const found = await db.select({ id: flightsTable.id }).from(flightsTable)
    .where(and(inArray(flightsTable.id, flightIds), ...bookingEngineVisibilityConds(access)));
  return { access, ids: found.map(row => row.id).sort((a, b) => a - b) };
}

let assertions = 0;
let cleanupCount = 0;
try {
  const forbidden = [
    ["GET", "/agency-groups"], ["POST", "/agency-groups"],
    ["PATCH", "/agency-groups/1"], ["DELETE", "/agency-groups/1"],
    ["POST", "/agency-groups/1/rules"], ["DELETE", "/agency-groups/1/rules/1"],
    ["GET", "/agents/1/visibility-context"], ["PATCH", "/agency-groups/1/rules/1"],
  ];
  for (const [method, path] of forbidden) {
    assert.equal((await request(method, path)).status, 403); assertions++;
    assert.equal((await request(method, path, "agent")).status, 403); assertions++;
  }

  const created = await request("POST", "/agency-groups", "admin", { name: marker });
  assert.equal(created.status, 201); assertions++;
  const groupId = created.payload.id as number;
  groupIds.push(groupId);
  const renamed = await request("PATCH", `/agency-groups/${groupId}`, "admin", { name: marker + "-renamed" });
  assert.equal(renamed.status, 200); assertions++;
  assert.equal(renamed.payload.name, marker + "-renamed"); assertions++;
  const added = await request("POST", `/agency-groups/${groupId}/rules`, "admin", {
    airport: "tia", direction: "either", dateFrom: "2031-08-10", dateTo: "2031-08-10",
  });
  assert.equal(added.status, 201); assertions++;
  const ruleId = added.payload.id as number;
  assert.deepEqual({ airport: added.payload.airport, direction: added.payload.direction }, {
    airport: "TIA", direction: "either",
  }); assertions++;
  assert.equal((await request("POST", `/agency-groups/${groupId}/rules`, "admin", {
    airport: "TIA", direction: "either",
  })).status, 400, "new rules require both dates"); assertions++;
  assert.equal((await request("POST", `/agency-groups/${groupId}/rules`, "admin", {
    airport: "TIA", direction: "either", dateFrom: "2031-08-11", dateTo: "2031-08-10",
  })).status, 400, "reversed date window denied"); assertions++;
  assert.equal((await request("POST", `/agency-groups/${groupId}/rules`, "admin", {
    airport: "TIA", direction: "either", dateFrom: "2031-08-10", dateTo: "2031-08-10",
  })).status, 409, "same range is duplicate"); assertions++;
  const secondWindow = await request("POST", `/agency-groups/${groupId}/rules`, "admin", {
    airport: "TIA", direction: "either", dateFrom: "2032-08-10", dateTo: "2032-08-11",
  });
  assert.equal(secondWindow.status, 201, "same airport may have another window"); assertions++;
  assert.equal((await request("PATCH", `/agency-groups/${groupId}/rules/${ruleId}`, "admin", {
    airport: "TIA", direction: "either", dateFrom: "2032-08-10", dateTo: "2032-08-11",
  })).status, 409, "edit cannot introduce duplicate range"); assertions++;
  assert.equal((await request("DELETE", `/agency-groups/${groupId}/rules/${secondWindow.payload.id}`, "admin")).status, 204); assertions++;

  // The local helium DB predates some unrelated ORM columns. Use minimal
  // parameterized fixture INSERTs rather than altering its schema for a test.
  const agency = (await pool.query<{ id: number }>(
    "INSERT INTO agents (name, email, group_id, sees_hidden_flights) VALUES ($1, $2, $3, true) RETURNING id",
    [marker, `${marker}@example.invalid`, groupId],
  )).rows[0];
  agentIds.push(agency.id);
  for (const [suffix, from, to, show] of [
    ["out", "TIA", "MXP", false], ["in", "MXP", "TIA", false], ["other", "MXP", "BER", true],
  ] as const) {
    const row = (await pool.query<{ id: number }>(
      `INSERT INTO flights (airline, flight_number, from_city, to_city, departure_date,
       departure_time, arrival_date, arrival_time, adult_price, child_price, infant_price,
       total_seats, status, show_in_booking_engine)
       VALUES ($1, $2, $3, $4, '2031-08-10', '12:00', '2031-08-10', '14:00',
       50, 50, 10, 10, 'open', $5) RETURNING id`,
      [marker, `${marker}-${suffix}`, from, to, show],
    )).rows[0];
    flightIds.push(row.id);
  }
  const [outbound, inbound, other] = flightIds;

  // Only one synthetic flight is temporarily added as a global default.
  // No existing rules/agencies are modified.
  const [globalDefault] = await db.insert(agentFlightDefaultRulesTable)
    .values({ flightId: other }).returning({ id: agentFlightDefaultRulesTable.id });
  defaultIds.push(globalDefault.id);

  const listing = await request("GET", "/agency-groups", "admin");
  const group = listing.payload.find((entry: any) => entry.id === groupId);
  assert.equal(group.agentCount, 1); assertions++;
  assert.equal(group.rules.length, 1); assertions++;
  const context = await request("GET", `/agents/${agency.id}/visibility-context`, "admin");
  assert.deepEqual(
    { groupId: context.payload.groupId, groupName: context.payload.groupName, directions: context.payload.groupRules.map((r: any) => r.direction) },
    { groupId, groupName: marker + "-renamed", directions: ["either"] },
  ); assertions++;

  const grouped = await visible(agency.id, true);
  assert.deepEqual(grouped.ids, [outbound, inbound].sort((a, b) => a - b)); assertions++;
  const groupFilter = await resolveGroupFlightFilter(String(groupId), "admin");
  assert.equal(groupFilter.groupId, groupId); assertions++;
  assert.deepEqual((await db.select({ id: flightsTable.id }).from(flightsTable)
    .where(and(inArray(flightsTable.id, flightIds), groupFilter.condition))
    .orderBy(asc(flightsTable.id))).map(row => row.id), [outbound, inbound].sort((a, b) => a - b),
    "filtered IDs use group airport, direction and inclusive dates"); assertions++;
  const [pageTotal] = await db.select({ total: count() }).from(flightsTable)
    .where(and(inArray(flightsTable.id, flightIds), groupFlightCondition(groupId)));
  assert.equal(Number(pageTotal.total), 2, "paginated list total matches all matching IDs"); assertions++;
  assert.equal((await db.select({ id: flightsTable.id }).from(flightsTable)
    .where(and(inArray(flightsTable.id, flightIds), groupFilter.condition))
    .orderBy(asc(flightsTable.id)).limit(1).offset(1))[0].id, [outbound, inbound].sort((a, b) => a - b)[1],
    "second page still matches group"); assertions++;
  assert.equal((await resolveGroupFlightFilter(String(groupId), "agent")).error?.status, 403); assertions++;
  assert.equal((await resolveGroupFlightFilter("x", "admin")).error?.status, 400); assertions++;
  assert.equal((await resolveGroupFlightFilter("0", "admin")).error?.status, 400); assertions++;
  assert.equal((await resolveGroupFlightFilter(String(groupId + 9000000), "admin")).error?.status, 400); assertions++;
  await pool.query("UPDATE flights SET departure_date = '2031-08-09' WHERE id = $1", [outbound]);
  await pool.query("UPDATE flights SET departure_date = '2031-08-11' WHERE id = $1", [inbound]);
  assert.deepEqual(await db.select({ id: flightsTable.id }).from(flightsTable)
    .where(and(inArray(flightsTable.id, flightIds), groupFilter.condition)), [],
    "group inventory filter excludes both outside date boundaries"); assertions++;
  assert.deepEqual((await visible(agency.id, true)).ids, [], "both dates outside range excluded"); assertions++;
  await pool.query("UPDATE flights SET departure_date = '2031-08-10' WHERE id = ANY($1::int[])", [[outbound, inbound]]);
  assert.deepEqual((await visible(agency.id, true)).ids, [outbound, inbound].sort((a, b) => a - b),
    "departure exactly on both inclusive boundaries is included"); assertions++;
  assert.equal((await request("PATCH", `/agency-groups/${groupId + 1}/rules/${ruleId}`, "admin", {
    airport: "TIA", direction: "either", dateFrom: "2031-08-10", dateTo: "2031-08-11",
  })).status, 404); assertions++;
  assert.equal((await request("PATCH", `/agency-groups/${groupId}/rules/${ruleId}`, "admin", {
    airport: "TIA", direction: "either", dateFrom: "2031-08-10", dateTo: "2031-08-11",
  })).status, 200); assertions++;
  assert.equal(grouped.access.rules.length, 0); assertions++; // global default not inherited
  const blockedDelete = await request("DELETE", `/agency-groups/${groupId}`, "admin");
  assert.equal(blockedDelete.status, 409); assertions++;
  let fkRestricted = false;
  try {
    await db.delete(agencyGroupsTable).where(eq(agencyGroupsTable.id, groupId));
  } catch (error) {
    fkRestricted = (error as any)?.code === "23503" || (error as any)?.cause?.code === "23503";
  }
  assert.equal(fkRestricted, true, "DB FK must RESTRICT assigned-group deletion"); assertions++;

  assert.equal((await request("DELETE", `/agency-groups/${groupId + 1}/rules/${ruleId}`, "admin")).status, 404); assertions++;
  assert.equal((await request("DELETE", `/agency-groups/${groupId}/rules/${ruleId}`, "admin")).status, 204); assertions++;
  assert.deepEqual((await visible(agency.id, true)).ids, [], "empty grouped rule set must deny even seesHidden and global default"); assertions++;
  const [ownRule] = await db.insert(agentFlightVisibilityTable).values({
    agentId: agency.id, fromAirport: "MXP", toAirport: "BER",
    dateFrom: "2031-01-01", dateTo: "2031-12-31",
  }).returning({ id: agentFlightVisibilityTable.id });
  ownIds.push(ownRule.id);
  assert.deepEqual((await visible(agency.id, true)).ids, [other], "own rule adds independently"); assertions++;
  const addedBack = await request("POST", `/agency-groups/${groupId}/rules`, "admin", {
    airport: "TIA", direction: "either", dateFrom: "2031-08-10", dateTo: "2031-08-11",
  });
  assert.equal(addedBack.status, 201); assertions++;
  assert.deepEqual((await visible(agency.id, true)).ids, [...flightIds].sort((a, b) => a - b)); assertions++;

  await db.update(agentsTable).set({ groupId: null }).where(eq(agentsTable.id, agency.id));
  const ungrouped = await visible(agency.id, true);
  assert.equal(ungrouped.access.denied, true); assertions++;
  assert.deepEqual(ungrouped.ids, [], "ungrouped agency must ignore own rules, global defaults and seesHidden"); assertions++;
  assert.deepEqual((await visible(agency.id, false)).ids, [], "ungrouped agency denied without hidden permission"); assertions++;
  const direct = await db.select({ id: flightsTable.id }).from(flightsTable)
    .where(and(eq(flightsTable.id, other), ...bookingEngineVisibilityConds(ungrouped.access)));
  assert.deepEqual(direct, [], "direct flight/booking lookup must fail closed for an ungrouped agency"); assertions++;
  assert.equal((await getFlightVisibilityForAgent(agency.id + 9000000)).denied, true,
    "dangling agency references must not become guests"); assertions++;
  const guest = await db.select({ id: flightsTable.id }).from(flightsTable)
    .where(and(inArray(flightsTable.id, flightIds),
      ...bookingEngineVisibilityConds(await getFlightVisibilityForAgent(null))));
  assert.deepEqual(guest.map(row => row.id), [other], "guest visibility stays unchanged"); assertions++;
  assert.equal((await request("DELETE", `/agency-groups/${groupId}`, "admin")).status, 204); assertions++;
  groupIds.length = 0;
  console.info(`Agency group DB integration passed: ${assertions} assertions.`);
} finally {
  // Fixture-owned IDs only; perform cleanup even when an assertion fails.
  try {
    if (ownIds.length) cleanupCount += (await db.delete(agentFlightVisibilityTable)
      .where(inArray(agentFlightVisibilityTable.id, ownIds)).returning({ id: agentFlightVisibilityTable.id })).length;
    if (defaultIds.length) cleanupCount += (await db.delete(agentFlightDefaultRulesTable)
      .where(inArray(agentFlightDefaultRulesTable.id, defaultIds)).returning({ id: agentFlightDefaultRulesTable.id })).length;
    if (agentIds.length) cleanupCount += (await db.delete(agentsTable)
      .where(inArray(agentsTable.id, agentIds)).returning({ id: agentsTable.id })).length;
    if (groupIds.length) cleanupCount += (await db.delete(agencyGroupsTable)
      .where(inArray(agencyGroupsTable.id, groupIds)).returning({ id: agencyGroupsTable.id })).length;
    if (flightIds.length) cleanupCount += (await db.delete(flightsTable)
      .where(inArray(flightsTable.id, flightIds)).returning({ id: flightsTable.id })).length;
    const [remainingAgents, remainingGroups, remainingFlights, remainingDefaults, remainingOwn] = await Promise.all([
      db.select({ id: agentsTable.id }).from(agentsTable).where(inArray(agentsTable.id, agentIds)),
      db.select().from(agencyGroupsTable).where(eq(agencyGroupsTable.name, marker + "-renamed")),
      db.select({ id: flightsTable.id }).from(flightsTable).where(inArray(flightsTable.id, flightIds)),
      db.select().from(agentFlightDefaultRulesTable).where(inArray(agentFlightDefaultRulesTable.flightId, flightIds)),
      db.select().from(agentFlightVisibilityTable).where(inArray(agentFlightVisibilityTable.agentId, agentIds)),
    ]);
    assert.deepEqual([remainingAgents.length, remainingGroups.length, remainingFlights.length,
      remainingDefaults.length, remainingOwn.length], [0, 0, 0, 0, 0], "fixture cleanup verification");
    console.info(`Fixture cleanup: ${cleanupCount} explicit row deletions; 0 remaining agency/group/flight/default/own rows.`);
  } finally {
    server.close();
    await pool.end();
  }
}