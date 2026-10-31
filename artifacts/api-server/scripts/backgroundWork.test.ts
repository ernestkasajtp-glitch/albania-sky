import assert from "node:assert/strict";
import { fetchWhileEnabled } from "../src/lib/backgroundWork.js";
import { runDueWizzMonitorCycle } from "../src/lib/wizzPriceMonitorPolicy.js";

async function main() {
  let enabled = false;
  let externalFetches = 0;
  const fetchNext = async () => {
    externalFetches++;
    return externalFetches;
  };
  const checkEnabled = async () => enabled;

  await assert.rejects(
    fetchWhileEnabled(checkEnabled, fetchNext, "Wizz monitor"),
    /Wizz monitor stopped: module disabled/,
  );
  assert.equal(externalFetches, 0, "a disabled worker must not start an external fetch");

  enabled = true;
  assert.equal(await fetchWhileEnabled(checkEnabled, fetchNext, "Wizz monitor"), 1);
  enabled = false;
  await assert.rejects(fetchWhileEnabled(checkEnabled, fetchNext, "Wizz monitor"), /module disabled/);
  assert.equal(externalFetches, 1, "an in-flight job must not fetch its next date after disable");

  await assert.rejects(
    fetchWhileEnabled(checkEnabled, fetchNext, "Seat-check optional price refresh"),
    /Seat-check optional price refresh stopped: module disabled/,
  );
  assert.equal(externalFetches, 1, "a disabled price add-on must not fetch; seat safety is separate");

  const monitors = [{ id: "route-1" }, { id: "route-2" }];
  let monitorFetches = 0;
  const runMonitor = async (_id: string, _options: { onlyDates?: string[]; retryFailedAtEnd: false }) => {
    monitorFetches++;
    enabled = false;
    return ["2027-01-01"];
  };
  await runDueWizzMonitorCycle(monitors, runMonitor, checkEnabled);
  assert.equal(monitorFetches, 0, "disabled Wizz scheduler must not start a route");
  enabled = true;
  await runDueWizzMonitorCycle(monitors, runMonitor, checkEnabled);
  assert.equal(monitorFetches, 1, "disabled Wizz scheduler must not fetch another route or retry");

  console.log("background worker disable gates passed");
}

void main().catch(error => { console.error(error); process.exitCode = 1; });