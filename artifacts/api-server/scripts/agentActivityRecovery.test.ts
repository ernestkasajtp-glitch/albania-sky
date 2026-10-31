import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTIVITY_REPORT_PREFIX, latestDueActivityDay, nextActivityDay, recoverActivityReports,
  type ActivityReportMarker, type ActivityRecoveryStore,
} from "../src/lib/agentActivityRecovery";

const now = new Date("2026-10-28T10:00:00Z");
function fixture(cursor?: string, markers: ActivityReportMarker[] = []) {
  const sent: string[] = [], alerts: string[] = [];
  const store: ActivityRecoveryStore = {
    async markers() { return markers; },
    async initializeCursor(day) { return cursor ??= day; },
    async advanceCursor(day) { cursor = cursor && cursor > day ? cursor : day; },
    async sendDay(day) {
      // Mirrors the production unique settings-key claim.
      if (markers.some(m => m.key === ACTIVITY_REPORT_PREFIX + day)) return;
      markers.push(marker(day, "sent"));
      sent.push(day);
    },
    async alert(day, state) { alerts.push(`${day}:${state}`); },
  };
  return { store, sent, alerts, cursor: () => cursor };
}
function marker(day: string, value: string, updatedAt = new Date("2026-10-20T10:00:00Z")) {
  return { key: ACTIVITY_REPORT_PREFIX + day, value, updatedAt };
}

test("startup catches every missed day and repeated startup sends nothing twice", async () => {
  const f = fixture("2026-10-24");
  await recoverActivityReports(f.store, now);
  assert.deepEqual(f.sent, ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
  await recoverActivityReports(f.store, now);
  assert.equal(f.sent.length, 4);
  assert.equal(f.cursor(), "2026-10-28");
});

test("legacy claims are never retried; stale preparing/sending are alerted", async () => {
  const f = fixture(undefined, [
    marker("2026-10-22", "sent"),
    marker("2026-10-23", "preparing"),
    marker("2026-10-24", "sending"),
    marker("2026-10-25", "failed_or_uncertain"),
    marker("2026-10-26", "sending", new Date(now.getTime() - 30 * 60_000)),
  ]);
  await recoverActivityReports(f.store, now);
  assert.deepEqual(f.sent, ["2026-10-27"]);
  assert.deepEqual(f.alerts, ["2026-10-23:preparing", "2026-10-24:sending"]);
  // Alerts remain discoverable even after the cursor passes the stuck days.
  await recoverActivityReports(f.store, now);
  assert.equal(f.alerts.length, 4);
});

test("fresh installation starts with the latest due day only", async () => {
  const f = fixture();
  await recoverActivityReports(f.store, now);
  assert.deepEqual(f.sent, ["2026-10-27"]);
});

test("large backlog is bounded and resumes in the next pass", async () => {
  const f = fixture("2026-10-01");
  await recoverActivityReports(f.store, now);
  assert.equal(f.sent.length, 7);
  assert.equal(f.cursor(), "2026-10-08");
  await recoverActivityReports(f.store, now);
  assert.equal(f.sent.length, 14);
  assert.equal(f.cursor(), "2026-10-15");
});

test("safe failure before a claim does not advance the cursor", async () => {
  const f = fixture("2026-10-26");
  const sendDay = f.store.sendDay;
  f.store.sendDay = async () => { throw new Error("DB unavailable"); };
  await assert.rejects(recoverActivityReports(f.store, now), /DB unavailable/);
  assert.equal(f.cursor(), "2026-10-26");
  f.store.sendDay = sendDay;
  await recoverActivityReports(f.store, now);
  assert.deepEqual(f.sent, ["2026-10-26", "2026-10-27"]);
});

test("crash after claiming or sending but before cursor advance does not resend", async () => {
  for (const state of ["preparing", "sending", "sent", "failed_or_uncertain"]) {
    const f = fixture("2026-10-27", [marker("2026-10-27", state)]);
    await recoverActivityReports(f.store, now);
    assert.deepEqual(f.sent, []);
    assert.equal(f.cursor(), "2026-10-28");
  }
});

test("days without activity advance without producing email", async () => {
  const f = fixture("2026-10-26");
  const sendDay = f.store.sendDay;
  f.store.sendDay = async day => { if (day !== "2026-10-26") await sendDay(day); };
  await recoverActivityReports(f.store, now);
  await recoverActivityReports(f.store, now);
  assert.deepEqual(f.sent, ["2026-10-27"]);
});

test("concurrent recovery uses shared unique claims and a monotonic cursor", async () => {
  const f = fixture("2026-10-25");
  await Promise.all([recoverActivityReports(f.store, now), recoverActivityReports(f.store, now)]);
  assert.deepEqual(f.sent, ["2026-10-25", "2026-10-26", "2026-10-27"]);
  assert.equal(f.cursor(), "2026-10-28");
});

test("Tirane midnight cutoff and calendar arithmetic survive DST and year rollover", () => {
  assert.equal(latestDueActivityDay(new Date("2026-03-29T22:00:00Z")), "2026-03-28");
  assert.equal(latestDueActivityDay(new Date("2026-03-29T22:01:00Z")), "2026-03-29");
  assert.equal(latestDueActivityDay(new Date("2026-10-25T23:01:00Z")), "2026-10-25");
  assert.equal(latestDueActivityDay(new Date("2026-12-31T23:01:00Z")), "2026-12-31");
  assert.equal(nextActivityDay("2028-02-28"), "2028-02-29");
  assert.throws(() => nextActivityDay("2026-02-30"));
});
