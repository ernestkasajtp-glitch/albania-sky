import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import { fixture } from "./flightVisibility.fixture.js";
import { bookingEngineVisibilityConds, getFlightVisibilityForAgent } from "../src/lib/flightVisibility.js";
import publicRouter from "../src/routes/public.js";
import { externalApiRouter } from "../src/routes/externalApi.js";
import { buildCpExportCsv } from "../src/lib/cpExport.js";
import { guestFlightAccessRouter } from "../src/routes/guestFlightAccess.js";
import bookingEngineSettingsRouter from "../src/routes/bookingEngineSettings.js";
import { GUEST_ACCESS_KEY, parseGuestFlightPolicy } from "../src/lib/guestFlightAccess.js";
import { getModuleState, isModuleEnabled, moduleCatalogue, moduleEnvelope } from "../src/lib/moduleControls.js";

// Exercise real module-control reads against the in-memory settings table.
// The full route suite below must retain its behavior with modules enabled.
fixture.settings.push({
  key: "fms_module_controls_v1",
  value: JSON.stringify({
    revision: 1,
    enabled: Object.fromEntries(moduleCatalogue.map(module => [module.id, true])),
  }),
});

const future = "2098-06-15";
const flight = (id: number, fromCity: string, toCity: string, departureDate: string, visible = true) => ({
  id, fromCity, toCity, departureDate, showInBookingEngine: visible,
  status: "open", airline: "TEST", flightNumber: `T${id}`,
  departureTime: "12:00", arrivalDate: departureDate, arrivalTime: "14:00",
  totalSeats: 10, soldSeats: 0, externalSalesBlocked: false,
  isConfirmed: false, sellCutoffHours: null,
  adultPrice: "100", childPrice: "100", infantPrice: "10", tax: "0",
  checkedBaggagePrice: null, seatSelectionPrice: null, priorityBoardingPrice: null, insurancePrice: null,
  createdAt: new Date(), updatedAt: new Date(),
});
fixture.flights.push(
  flight(101, " TIA ", "mxp", "2098-06-10", false),
  flight(102, "TIA", "MXP", future),
  flight(103, "TIA", "MXP", "2098-06-20"),
  flight(104, "TIA", "MXP", "2098-06-21"),
  flight(105, "TIA", "BGY", future),
  flight(106, "FCO", "MXP", future),
  flight(107, "FCO", "FRA", future, false),
  flight(108, "FCO", "BER", future, false),
  flight(109, "MXP", "TIA", future),
);
fixture.booking_users.push({ id: 1, agentId: 7, email: "test@example.invalid" });
fixture.agents.push({ id: 7, groupId: 3, seesHiddenFlights: false });
fixture.agency_groups.push({ id: 3, name: "Test group" });
const routeRule = { id: 1, agentId: 7, flightId: null, fromAirport: "TIA", toAirport: "MXP", dateFrom: "2098-06-10", dateTo: "2098-06-20" };
const exception = { id: 2, agentId: 7, flightId: 107, fromAirport: null, toAirport: null, dateFrom: null, dateTo: null };

const app = express();
app.use(express.json());
let sessionUserId: number | undefined = 1;
let sessionRole = "agent";
app.use((req, _res, next) => {
  (req as any).session = { userId: sessionUserId, role: sessionRole };
  next();
});
app.use("/api", publicRouter);
app.use("/api", externalApiRouter);
app.use("/api", guestFlightAccessRouter);
app.use("/api", bookingEngineSettingsRouter);
app.use((err: unknown, _req: unknown, res: express.Response, _next: unknown) => {
  const status = (err as { status?: number })?.status;
  res.status(status && status >= 400 && status < 500 ? status : 500).json({ error: String(err) });
});
const server = createServer(app);
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw Error("Fixture server did not start");
const base = `http://127.0.0.1:${address.port}/api`;
async function request(path: string, options?: RequestInit) {
  const response = await fetch(base + path, options);
  const body = await response.json();
  assert.notEqual(response.status, 500, `${path}: ${JSON.stringify(body)}`);
  return { status: response.status, body };
}
async function ids(path: string) {
  const { status, body } = await request(path);
  assert.equal(status, 200, path);
  return body.map((item: { id: number }) => item.id).sort((a: number, b: number) => a - b);
}
const book = (flightId: number) => request("/public/bookings", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ flightId, customerName: "Test", passengers: [{ type: "adult", gender: "M" }] }),
});

try {
  assert.ok(moduleEnvelope({ revision: 0, enabled: {} }).modules.every(module => module.enabled),
    "unconfigured modules remain enabled by default");
  assert.equal((await getModuleState()).revision, 1, "module controls read the isolated settings");
  for (const module of moduleCatalogue) {
    assert.equal(await isModuleEnabled(module.id), true, `${module.id} remains enabled`);
  }
  // A grouped agency without either group or individual rules fails closed.
  assert.equal((await getFlightVisibilityForAgent(7)).rules.length, 0);
  assert.deepEqual(await ids("/public/flights"), []);
  fixture.agents[0].seesHiddenFlights = true;
  assert.deepEqual(await ids("/public/flights"), [], "legacy all-hidden flag cannot grant group access");
  fixture.agents[0].groupId = null;
  assert.deepEqual(await ids("/public/flights"), [], "an ungrouped agency is denied");
  fixture.agents[0].groupId = 3;
  sessionUserId = undefined;
  assert.equal(bookingEngineVisibilityConds({ seesHiddenFlights: false, rules: [] }).length, 1);
  assert.equal(bookingEngineVisibilityConds({ seesHiddenFlights: true, rules: [] }).length, 0);
  assert.deepEqual(await ids("/public/flights"), [], "unconfigured guests cannot search");
  assert.deepEqual((await request("/public/routes")).body, []);
  assert.deepEqual((await request("/public/airports")).body, []);
  assert.deepEqual((await request("/public/flight-dates?from=TIA&to=MXP")).body.dates, []);
  assert.equal((await request("/public/flights/102")).status, 404);
  assert.equal((await book(102)).status, 401, "anonymous booking requires authentication");
  sessionUserId = 1;

  fixture.agent_flight_visibility.push(routeRule);
  // Inclusive date bounds, normalized airport codes, and matching hidden rows.
  // The legacy all-hidden flag cannot add anything outside the route window.
  assert.deepEqual(await ids("/public/flights"), [101, 102, 103]);
  assert.deepEqual(await ids("/public/flights?from=FCO"), []);
  assert.deepEqual(await ids("/public/flights?from=TIA&to=BGY"), []);
  assert.deepEqual((await request("/public/routes")).body, [{ from: "TIA", to: "MXP" }]);
  assert.deepEqual((await request("/public/airports")).body.map((a: { code: string }) => a.code), ["MXP", "TIA"]);
  assert.deepEqual((await request("/public/flight-dates?from=TIA&to=MXP")).body.dates.map((d: { date: string }) => d.date),
    ["2098-06-10", "2098-06-15", "2098-06-20"]);
  assert.deepEqual((await request("/public/flight-dates?from=FCO&to=MXP")).body.dates, []);
  assert.equal((await request("/public/flights/105")).status, 404);
  assert.equal((await request("/public/flights/108")).status, 404);
  assert.equal((await request("/public/flights/101")).status, 200);
  assert.deepEqual(await book(105), { status: 400, body: { error: "Flight not available" } });
  assert.deepEqual(await book(108), { status: 400, body: { error: "Flight not available" } });
  assert.equal(fixture.writes, 0, "rejected booking must not write");

  fixture.agent_flight_visibility.push(exception);
  assert.deepEqual(await ids("/public/flights"), [101, 102, 103, 107]);
  assert.equal((await request("/public/flights/107")).status, 200);
  assert.equal((await request("/public/flights/108")).status, 404);
  assert.deepEqual(await book(108), { status: 400, body: { error: "Flight not available" } });
  fixture.agents[0].seesHiddenFlights = false;
  assert.deepEqual(await ids("/public/flights"), [101, 102, 103, 107],
    "matching hidden flights remain allowed even without the legacy hidden-flight flag");
  fixture.agents[0].seesHiddenFlights = true;

  // Existing history belongs to the booking owner, not the current allowlist.
  fixture.bookings.push({
    id: 201, bookingRef: "KTF9999", agentId: 7, bookingUserId: 1,
    customerEmail: "test@example.invalid", flightId: 108,
    totalAmount: "100", paidAmount: "0", markup: "0", commission: "0",
    status: "confirmed", createdAt: new Date(), updatedAt: new Date(),
  });
  const detail = await request("/public/my-bookings/KTF9999");
  assert.equal(detail.status, 200);
  assert.equal(detail.body.bookingRef, "KTF9999");
  const history = await request("/public/my-bookings");
  assert.equal(history.status, 200);
  assert.ok(history.body.some((b: { bookingRef: string }) => b.bookingRef === "KTF9999"));
  assert.equal(fixture.writes, 0);
  fixture.agent_flight_visibility.length = 0;
  assert.deepEqual(await ids("/public/flights"), [],
    "removing the last individual rule does not restore broad agency access");
  fixture.agency_group_rules.push({
    id: 1, groupId: 3, airport: "FCO", direction: "from",
    dateFrom: future, dateTo: future,
  });
  assert.deepEqual(await ids("/public/flights"), [106, 107, 108],
    "dated group rule grants matching flights, including hidden flights");
  assert.equal((await request("/public/flights/105")).status, 404);
  // Guests use the selected existing group's rules, never a separate allowlist.
  // Exercise every discovery surface against the router and SQL predicates.
  const policyRow = { key: GUEST_ACCESS_KEY, value: JSON.stringify({ enabled: true, rules: [{ airport: "TIA" }] }) };
  fixture.settings.push(policyRow);
  assert.deepEqual(await ids("/public/flights"), [106, 107, 108], "agency unaffected by guest restrictions");
  sessionUserId = undefined;
  assert.deepEqual(await ids("/public/flights"), [], "legacy enabled/rules data fails closed");
  assert.deepEqual((await request("/settings/guest-flight-access")).status, 403);
  policyRow.value = JSON.stringify({ groupId: 3 });
  assert.deepEqual(await ids("/public/flights"), [106], "guests see only public flights matching the group rule");
  assert.deepEqual((await request("/public/routes")).body, [{ from: "FCO", to: "MXP" }]);
  // Actual public router: final effective fares, not flight base or extras, are discounted.
  fixture.settings.push({ key: "flightDiscount.106", value: JSON.stringify({ type: "percent", value: 10 }) });
  const discounted = (await request("/public/flights/106")).body;
  assert.equal(discounted.preDiscountAdultPrice, 100);
  assert.equal(discounted.agentAdultPrice, 90);
  assert.equal(discounted.agentInfantPrice, 9);
  assert.equal(discounted.adultPrice, 100, "base price must not be rewritten");
  // Isolation matrix exercises actual portal, API list/detail, and Offline CSV writers.
  const discountSetting = fixture.settings.find(s => s.key === "flightDiscount.106")!;
  fixture.settings.push({ key: "external_api_key", value: "fixture-key" });
  Object.assign(fixture.agents[0], { status: "active", apiKey: "REPLACE_WITH_YOUR_VALUE", discountType: "percent", discountPercent: "10", markup: "0", markupPercent: "0" });
  const offlineFlight = fixture.flights.find(f => f.id === 106)!;
  offlineFlight.citizenPrice = "120";
  const apiGet = (path: string, agent = false) => request(path, { headers: { "x-api-key": agent ? "fixture-agent-key" : "fixture-key" } });
  for (const channel of ["api", "offline", "agents", "public"]) {
    discountSetting.value = JSON.stringify({ type: "percent", value: 10, channels: [channel] });
    sessionUserId = undefined;
    const guest = (await request("/public/flights/106")).body;
    assert.equal(guest.agentAdultPrice, channel === "public" ? 90 : 100);
    assert.equal(guest.flightDiscount !== null, channel === "public");
    assert.equal((await request("/public/flight-dates?from=FCO&to=MXP")).body.dates[0].minPrice, channel === "public" ? 90 : 100);
    sessionUserId = 1;
    assert.equal((await request("/public/flights/106")).body.agentAdultPrice, channel === "agents" ? 81 : 90);
    assert.equal((await apiGet("/v1/flights/106")).body.price_adult, channel === "api" ? 90 : 100);
    assert.equal((await apiGet("/v1/agent/flights/106", true)).body.price_adult, channel === "api" ? 81 : 90);
    assert.equal((await apiGet("/v1/flights")).body.flights.find((f: any) => f.id === 106).price_adult, channel === "api" ? 90 : 100);
    assert.equal((await apiGet("/v1/agent/flights", true)).body.flights.find((f: any) => f.id === 106).price_adult, channel === "api" ? 81 : 90);
    const csv = (await buildCpExportCsv()).csv;
    const row = csv.split("\n").find(line => line.startsWith("FCO,") && line.split(",")[4] === "MXP")!.split(",");
    assert.equal(Number(row[35]), channel === "offline" ? 108 : 120);
    assert.equal(Number(row[38]), channel === "offline" ? 9 : 10);
  }
  assert.equal((await request("/v1/flights/106")).status, 401);
  assert.equal((await request("/v1/agent/flights/106")).status, 401);
  sessionUserId = undefined;
  fixture.agents[0].discountPercent = "0";
  delete offlineFlight.citizenPrice;
  discountSetting.value = JSON.stringify({ type: "percent", value: 10 });
  fixture.settings.splice(fixture.settings.findIndex(s => s.key === "external_api_key"), 1);
  assert.equal((await request("/public/flight-dates?from=FCO&to=MXP")).body.dates[0].minPrice, 90);
  fixture.settings.splice(fixture.settings.findIndex(s => s.key === "flightDiscount.106"), 1);
  assert.equal((await request("/public/flights/106")).body.agentAdultPrice, 100);
  assert.deepEqual((await request("/public/flight-dates?from=FCO&to=MXP")).body.dates.map((d: { date: string }) => d.date), [future]);
  assert.deepEqual((await request("/public/airports")).body.map((a: { code: string }) => a.code), ["FCO", "MXP"]);
  assert.equal((await request("/public/flights/107")).status, 404, "hidden group matches stay hidden from guests");
  assert.equal((await request("/public/flights/105")).status, 404, "outside group denied by direct URL");
  assert.equal((await request("/public/flights/106")).status, 200);
  assert.equal((await book(106)).status, 401);
  fixture.agency_group_rules.push({ id: 2, groupId: 3, airport: "TIA", direction: "from", dateFrom: future, dateTo: future });
  assert.deepEqual(await ids("/public/flights"), [102, 105, 106], "group rule updates apply without a settings save");
  assert.equal((await request("/public/flights/103")).status, 404, "out-of-window flight denied");
  assert.deepEqual((await request("/public/flight-dates?from=TIA&to=MXP")).body.dates.map((d: { date: string }) => d.date), [future]);
  assert.equal((await request("/settings/guest-flight-access")).status, 403);
  fixture.agency_group_rules.length = 0;
  assert.deepEqual(await ids("/public/flights"), []);
  assert.deepEqual((await request("/public/routes")).body, []);
  assert.deepEqual((await request("/public/airports")).body, []);
  assert.deepEqual((await request("/public/flight-dates?from=TIA&to=MXP")).body.dates, []);
  assert.equal((await request("/public/flights/102")).status, 404);
  fixture.agency_group_rules.push({ id: 1, groupId: 3, airport: "FCO", direction: "from", dateFrom: future, dateTo: future });
  fixture.agency_groups.length = 0;
  assert.deepEqual(await ids("/public/flights"), [], "deleted group fails closed even with orphan rules");
  assert.equal((await request("/public/flights/106")).status, 404);
  fixture.agency_groups.push({ id: 3, name: "Test group" });
  fixture.booking_users.push({ id: 2, agentId: null });
  sessionUserId = 2;
  assert.ok((await ids("/public/flights")).includes(102), "authenticated client unaffected by guest group");
  const save = (body: unknown) => request("/settings/guest-flight-access", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await save({ groupId: null })).status, 403);
  sessionRole = "admin";
  assert.deepEqual((await request("/settings/guest-flight-access")).body, { groupId: 3 });
  for (const invalid of [null, {}, { enabled: true, rules: [] }, { groupId: 0 }, { groupId: -1 },
    { groupId: 1.5 }, { groupId: "3" }, { groupId: true }, { groupId: 3, rules: [] },
    { groupId: Number.MAX_SAFE_INTEGER }]) {
    assert.equal((await save(invalid)).status, 400, `invalid selection ${JSON.stringify(invalid)}`);
  }
  assert.equal(fixture.writes, 0, "invalid or unauthorized policy must never write");
  for (const invalid of [null, {}, { enabled: true, rules: [] }, { groupId: 0 }, { groupId: 1.5 }, { groupId: "3" }]) {
    assert.throws(() => parseGuestFlightPolicy(invalid));
  }
  assert.deepEqual(parseGuestFlightPolicy({ groupId: null }), { groupId: null });
  sessionUserId = undefined;
  policyRow.value = JSON.stringify({ enabled: false, rules: [] });
  assert.deepEqual(await ids("/public/flights"), [], "legacy disabled also fails closed");
  policyRow.value = "{invalid json";
  assert.deepEqual(await ids("/public/flights"), [], "malformed settings fail closed");
  sessionUserId = 2;
  assert.deepEqual((await request("/settings/guest-flight-access")).body, { groupId: null }, "GET normalizes legacy/corrupt data");
  const saved = await save({ groupId: 3 });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { groupId: 3 });
  assert.deepEqual((await request("/settings/guest-flight-access")).body, saved.body, "save is persisted for subsequent reads");
  sessionUserId = undefined;
  assert.deepEqual(await ids("/public/flights"), [106], "saved group immediately applies");
  sessionUserId = 2;
  assert.deepEqual((await save({ groupId: null })).body, { groupId: null });
  sessionUserId = undefined;
  assert.deepEqual(await ids("/public/flights"), [], "clearing group immediately denies guests");
  sessionUserId = 2;
  await save({ groupId: 3 });
  // New-enrollment marker, never the legacy isApproved flag, governs activation.
  for (const id of [1, 2]) {
    sessionUserId = id;
    fixture.public_enrollments.push({ userId: id, approvedAt: null, groupId: null });
    assert.deepEqual(await ids("/public/flights"), [], "pending client/agent search blocked");
    assert.deepEqual((await request("/public/routes")).body, []);
    assert.deepEqual((await request("/public/airports")).body, []);
    assert.deepEqual((await request("/public/flight-dates?from=TIA&to=MXP")).body.dates, []);
    assert.equal((await request("/public/flights/102")).status, 404);
    assert.equal((await book(102)).status, 400);
  }
  sessionUserId = 1;
  assert.equal((await request("/public/my-bookings/KTF9999")).status, 200, "pending does not hide historical bookings");
  const entry = fixture.public_enrollments.find(row => row.userId === 2)!;
  sessionUserId = 2;
  entry.approvedAt = new Date();
  assert.deepEqual(await ids("/public/flights"), [], "approval without membership still fails closed");
  entry.groupId = 3;
  assert.deepEqual(await ids("/public/flights"), [106, 107, 108], "approved client receives group rules, not guest rules");
  fixture.public_enrollments.length = 0;
  fixture.booking_users.find(row => row.id === 2)!.isApproved = false;
  assert.ok((await ids("/public/flights")).includes(102), "historical false approval flag does not deactivate existing clients");

  // An override REPLACES group dates for one agency, not an intersection and not an extra route.
  fixture.public_enrollments.length = 0;
  fixture.agency_group_rules.length = 0;
  fixture.agency_group_rules.push({ id: 3, groupId: 3, airport: "TIA", direction: "from",
    dateFrom: future, dateTo: future });
  fixture.agent_flight_visibility.push(exception);
  fixture.agents.push({ id: 8, groupId: 3, seesHiddenFlights: false });
  fixture.booking_users.push({ id: 3, agentId: 8 });
  const periodPath = "/booking-engine/agents/7/group-period";
  const period = (body: unknown, path = periodPath) => request(path, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  sessionUserId = 1;
  sessionRole = "agent";
  assert.equal((await request(periodPath)).status, 403);
  assert.equal((await period({ dateFrom: "2098-06-10", dateTo: "2098-06-20" })).status, 403);
  sessionRole = "admin";
  assert.deepEqual((await request(periodPath)).body, { groupId: 3, dateFrom: null, dateTo: null });
  for (const invalid of [{}, { dateFrom: null, dateTo: future }, { dateFrom: future, dateTo: null },
    { dateFrom: "2098-02-30", dateTo: future }, { dateFrom: "2098-06-20", dateTo: "2098-06-10" },
    { dateFrom: "2098-6-10", dateTo: future }, { dateFrom: 5, dateTo: future }]) {
    assert.equal((await period(invalid)).status, 400, JSON.stringify(invalid));
  }
  assert.equal((await request("/booking-engine/agents/999/group-period")).status, 404);
  assert.equal((await period({ dateFrom: future, dateTo: future }, "/booking-engine/agents/999/group-period")).status, 404);
  assert.equal((await period({ dateFrom: future, dateTo: future }, "/booking-engine/agents/no/group-period")).status, 400);
  assert.deepEqual(await ids("/public/flights"), [102, 105, 107]);
  assert.deepEqual((await period({ dateFrom: "2098-06-10", dateTo: "2098-06-20" })).body,
    { groupId: 3, dateFrom: "2098-06-10", dateTo: "2098-06-20" });
  assert.deepEqual(await ids("/public/flights"), [101, 102, 103, 105, 107], "widen includes dates outside original group period");
  assert.equal((await request("/public/flights/106")).status, 404, "airport/direction remain inherited");
  fixture.agency_group_rules.push({ id: 5, groupId: 3, airport: "FCO", direction: "from",
    dateFrom: "2098-02-30", dateTo: future });
  assert.equal((await request("/public/flights/106")).status, 404, "malformed group dates cannot be repaired by override");
  fixture.agency_group_rules.pop();
  fixture.agency_group_rules.push({ id: 5, groupId: 3, airport: "FCO", direction: "from",
    dateFrom: null, dateTo: future });
  assert.equal((await request("/public/flights/106")).status, 404, "half-missing group dates fail closed under override");
  fixture.agency_group_rules.pop();
  sessionUserId = 3;
  assert.deepEqual(await ids("/public/flights"), [102, 105], "second agent retains original dates and has no own exception");
  sessionUserId = undefined;
  assert.deepEqual(await ids("/public/flights"), [102, 105], "guest's group period unchanged");
  fixture.public_enrollments.push({ userId: 2, approvedAt: new Date(), groupId: 3 });
  sessionUserId = 2;
  assert.deepEqual(await ids("/public/flights"), [102, 105], "approved client retains group dates");
  fixture.public_enrollments.length = 0;
  sessionUserId = 1;
  assert.deepEqual((await period({ dateFrom: "2098-06-20", dateTo: "2098-06-20" })).body,
    { groupId: 3, dateFrom: "2098-06-20", dateTo: "2098-06-20" });
  assert.deepEqual(await ids("/public/flights"), [103, 107], "narrow removes original date but retains own exception");
  assert.deepEqual((await period({ dateFrom: null, dateTo: null })).body, { groupId: 3, dateFrom: null, dateTo: null });
  assert.deepEqual(await ids("/public/flights"), [102, 105, 107], "clearing restores group dates");
  // Legacy undated rules have unlimited dates, but inherit the personal replacement when set.
  fixture.agency_group_rules.push({ id: 6, groupId: 3, airport: "FCO", direction: "from",
    dateFrom: null, dateTo: null });
  assert.deepEqual(await ids("/public/flights"), [102, 105, 106, 107, 108],
    "undated group rule allows all matching dates before override");
  await period({ dateFrom: "2098-06-20", dateTo: "2098-06-20" });
  assert.deepEqual(await ids("/public/flights"), [103, 107],
    "personal dates narrow undated group route while own flight exception survives");
  await period({ dateFrom: null, dateTo: null });
  assert.deepEqual(await ids("/public/flights"), [102, 105, 106, 107, 108],
    "clearing restores unlimited dates on the legacy group rule");
  fixture.agency_group_rules.pop();
  await period({ dateFrom: "2098-06-20", dateTo: "2098-06-20" });
  fixture.agency_groups.push({ id: 4, name: "Second group" });
  fixture.agency_group_rules.push({ id: 4, groupId: 4, airport: "TIA", direction: "from",
    dateFrom: future, dateTo: future });
  fixture.agents[0].groupId = 4;
  assert.deepEqual((await request(periodPath)).body, { groupId: 4, dateFrom: null, dateTo: null });
  assert.deepEqual(await ids("/public/flights"), [102, 105, 107], "group switch ignores old override");
  fixture.agents[0].groupId = null;
  assert.deepEqual(await ids("/public/flights"), [], "no group denied even with stale override and own exception");
  assert.equal((await period({ dateFrom: future, dateTo: future })).status, 400);
  assert.deepEqual((await period({ dateFrom: null, dateTo: null })).body,
    { groupId: null, dateFrom: null, dateTo: null });
  assert.equal(fixture.poolConnections, 0, "enabled-module reads must not open database connections");
  console.log("flight visibility, guest policy and enrollment route tests with enabled modules: OK");
} finally {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}