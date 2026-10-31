import assert from "node:assert/strict";
import test from "node:test";
import {
  isWizzMonitorDue,
  runDueWizzMonitorCycle,
  WIZZ_MONITOR_INTERVAL_MS,
  wizzMonitorErrorForDates,
} from "../src/lib/wizzPriceMonitorPolicy.js";

test("monitor becomes due only after twelve hours", () => {
  const lastRunMs = Date.parse("2026-09-22T00:00:00.000Z");
  const monitor = {
    id: "one",
    enabled: true,
    endDate: "2026-09-30",
    lastRunAt: new Date(lastRunMs).toISOString(),
  };

  assert.equal(
    isWizzMonitorDue(monitor, lastRunMs + WIZZ_MONITOR_INTERVAL_MS - 1, "2026-09-22"),
    false,
  );
  assert.equal(
    isWizzMonitorDue(monitor, lastRunMs + WIZZ_MONITOR_INTERVAL_MS, "2026-09-22"),
    true,
  );
});

test("custom intervals control eligibility without changing inactive or expired monitors", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const monitor = { id: "custom", enabled: true, endDate: "2026-10-10", lastRunAt: "2026-09-28T06:00:00Z" };
  assert.equal(isWizzMonitorDue(monitor, now, "2026-09-28", 6), true);
  assert.equal(isWizzMonitorDue(monitor, now - 1, "2026-09-28", 6), false);
  assert.equal(isWizzMonitorDue(monitor, now, "2026-09-28", 24), false);
  assert.equal(isWizzMonitorDue({ ...monitor, enabled: false }, now, "2026-09-28", 1), false);
  assert.equal(isWizzMonitorDue({ ...monitor, endDate: "2026-09-27" }, now, "2026-09-28", 1), false);
});

test("all first passes finish before only failed dates are retried", async () => {
  const calls: Array<{ id: string; dates?: string[] }> = [];
  const attempts = new Map<string, number>();
  const errors = new Map<string, string | null>();
  const firstFailures: Record<string, string[]> = {
    one: ["2026-09-23", "2026-09-25"],
    two: ["2026-09-24"],
  };

  const unresolved = await runDueWizzMonitorCycle(
    [{ id: "one" }, { id: "two" }],
    async (id, options) => {
      calls.push({ id, dates: options.onlyDates });
      const attempt = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, attempt);
      const failed = attempt === 1
        ? firstFailures[id]
        : id === "one"
          ? ["2026-09-25"]
          : [];
      errors.set(id, wizzMonitorErrorForDates(failed));
      return failed;
    },
  );

  assert.deepEqual(calls, [
    { id: "one", dates: undefined },
    { id: "two", dates: undefined },
    { id: "one", dates: ["2026-09-23", "2026-09-25"] },
    { id: "two", dates: ["2026-09-24"] },
  ]);
  assert.deepEqual([...unresolved], [["one", ["2026-09-25"]]]);
  assert.match(errors.get("one") ?? "", /2026-09-25/);
  assert.equal(errors.get("one")?.includes("2026-09-23"), false);
  assert.equal(errors.get("two"), null);
});

test("global pause prevents queued routes and failed-date retries", async () => {
  let enabled = true;
  const calls: string[] = [];
  await runDueWizzMonitorCycle([{ id: "one" }, { id: "two" }], async id => {
    calls.push(id);
    enabled = false;
    return ["2026-10-08"];
  }, async () => enabled);
  assert.deepEqual(calls, ["one"]);
  calls.length = 0;
  await runDueWizzMonitorCycle([{ id: "one" }], async id => {
    calls.push(id); return [];
  }, async () => enabled);
  assert.deepEqual(calls, []);
});