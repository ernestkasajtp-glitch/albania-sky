import assert from "node:assert/strict";
import { nextDailyRefresh, isRefreshTime } from "../src/lib/googleRefreshTime";

for (const value of ["24:00", "2:00", "12:60", "", null]) assert.equal(isRefreshTime(value), false);
assert.equal(isRefreshTime("23:59"), true);
const next = (time: string, now: string, day?: string) => nextDailyRefresh(time, new Date(now), day).toISOString();
assert.equal(next("02:00", "2026-10-30T00:30:00Z"), "2026-10-30T01:00:00.000Z");
assert.equal(next("02:00", "2026-10-30T01:10:00Z"), "2026-10-31T01:00:00.000Z");
assert.equal(next("02:30", "2026-03-28T23:00:00Z"), "2026-03-29T01:00:00.000Z");
assert.equal(next("02:30", "2026-10-25T00:40:00Z"), "2026-10-26T01:30:00.000Z");
assert.equal(next("23:00", "2026-10-30T12:00:00Z", "2026-10-30"), "2026-10-31T22:00:00.000Z");
assert.equal(next("00:00", "2026-10-30T22:59:00Z"), "2026-10-30T23:00:00.000Z");
console.log("Google daily refresh scheduling checks passed");
