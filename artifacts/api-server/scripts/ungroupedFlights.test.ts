import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { groupFlightCondition, resolveGroupFlightFilter } from "../src/lib/groupFlightFilter.js";

const dialect = new PgDialect();
const named = dialect.sqlToQuery(groupFlightCondition(7));
assert.deepEqual(named.params, [7]);
const result = await resolveGroupFlightFilter("none", "admin");
assert.ok(result.condition);
const ungrouped = dialect.sqlToQuery(result.condition!);
assert.match(ungrouped.sql, /^NOT \(EXISTS/);
assert.match(ungrouped.sql, /WHERE TRUE/);
assert.deepEqual(ungrouped.params, []);
// The unassigned filter negates exactly the same airport/direction/date match.
assert.equal(ungrouped.sql, `NOT (${dialect.sqlToQuery(groupFlightCondition()).sql})`);
assert.equal((await resolveGroupFlightFilter("none", "agent")).error?.status, 403);
assert.equal((await resolveGroupFlightFilter(["none"], "admin")).error?.status, 400);
assert.deepEqual(await resolveGroupFlightFilter(undefined, "admin"), {});
console.log("Ungrouped and named group SQL/filter boundary checks passed");
