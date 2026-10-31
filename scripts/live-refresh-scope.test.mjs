import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync("artifacts/flight-system/src/lib/liveQueryScope.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
Function("exports", compiled)(exports);
const { matchesLiveTopics } = exports;
for (const key of ["tasks", "tasksStats", "tasks-entity-counts", "booking-linked-tasks", "task"]) {
  assert.equal(matchesLiveTopics([key], new Set(["tasks"])), true, `Auto-task events refresh ${key}`);
}
assert.equal(matchesLiveTopics(["flights-paginated"], new Set(["tasks"])), false, "Task creation does not refetch flight list");
const keys = ["/api/bookings", "/api/bookings/12", "/api/bookings/premium-list", "/bookings",
  "/api/payments", "/api/passengers", "/api/dashboard/unpaid-bookings", "/api/dashboard/passengers-today",
  "group-tickets", "flights-paginated", "google-prices-bulk", "new-prices-bulk", "/api/flights",
  "/api/flights/5", "/api/agents", "/agents", "booking-columns", "enrollments", "modules",
  "/api/bookings-other", "/api/settings", "unrelated"];
function legacy(key, topics) {
  const path = p => key === p || key.startsWith(p + "/");
  const hits = [];
  if (topics.has("bookings")) hits.push(
    ["/api/bookings","/bookings","/api/payments","/api/passengers","/api/dashboard/unpaid-bookings","/api/dashboard/passengers-today"].some(path)
      || ["group-tickets","flights-paginated"].includes(key));
  if (topics.has("flights")) hits.push(key === "/api/bookings/premium-list",
    ["flights-paginated","google-prices-bulk","new-prices-bulk"].includes(key) || path("/api/flights"));
  if (topics.has("agents")) hits.push(key === "/api/bookings/premium-list", path("/api/agents") || path("/agents"));
  for (const [topic, name] of [["booking_columns","booking-columns"],["enrollments","enrollments"],["modules","modules"]]) {
    if (topics.has(topic)) hits.push(key === name);
  }
  return hits.filter(Boolean).length;
}
const names = ["bookings","flights","agents","booking_columns","enrollments","modules","booking_new"];
for (let mask=0; mask<128; mask++) {
  const topics = new Set(names.filter((_,i)=>mask & (1<<i)));
  for (const key of keys) assert.equal(matchesLiveTopics([key, {page:2}], topics), legacy(key,topics)>0, `${mask}:${key}`);
  assert.equal(matchesLiveTopics([null], topics), false);
}
const combined = new Set(["bookings","flights","agents"]);
assert.equal(legacy("/api/bookings/premium-list",combined),3);
assert.equal(matchesLiveTopics(["/api/bookings/premium-list"],combined),true);
const hook = fs.readFileSync("artifacts/flight-system/src/hooks/useLiveUpdates.ts","utf8");
assert.equal((hook.match(/queryClient\.invalidateQueries\(/g)||[]).length,1);
const reconnect = hook.match(/invalidateTopics\(\[([^\]]*"bookings"[^\]]*)\]\)/)?.[1] ?? "";
for (const topic of ["enrollments", "booking_columns", "bookings", "flights", "agents", "modules", "tasks"]) {
  assert.ok(reconnect.includes(`"${topic}"`), `Reconnect refresh includes ${topic}`);
}
assert.ok(hook.includes("playBookingChime()"));
console.log("PASS: all 128 topic combinations preserve legacy scopes; one invalidation call; reconnect and chime retained.");