import assert from "node:assert/strict";
import { NewPriceProgress } from "../src/lib/newPriceProgress.js";
import { matchesLiveTopics } from "../../flight-system/src/lib/liveQueryScope.js";

let events = 0;
const progress = new NewPriceProgress(() => events++);
assert.equal(progress.snapshot().phase, "idle");
progress.start();
const start = progress.snapshot().startedAt;
assert.equal(progress.snapshot().running, true);
assert.equal(progress.snapshot().phase, "waiting");
progress.state.total = 610;
progress.phase("checking");
progress.state.done = 10;
progress.state.refreshed = 9;
progress.publish();
progress.phase("waiting");
assert.equal(progress.snapshot().done, 10);
assert.equal(progress.snapshot().startedAt, start);
progress.finish(true);
assert.equal(progress.snapshot().phase, "failed");
assert.equal(progress.snapshot().running, false);
assert.ok(progress.snapshot().finishedAt);
progress.start();
assert.equal(progress.snapshot().done, 0);
assert.equal(progress.snapshot().finishedAt, null);
progress.finish();
assert.equal(progress.snapshot().phase, "completed");
const snapshot = progress.snapshot();
snapshot.done = 99;
assert.equal(progress.snapshot().done, 0);
assert.ok(events >= 7);
const topic = new Set(["newprice_progress"]);
assert.ok(matchesLiveTopics(["new-price-check-cfg"], topic));
for (const key of ["flights-paginated", "new-prices-bulk", "/api/bookings", "/api/payments"]) {
  assert.equal(matchesLiveTopics([key], topic), false, "Progress must not repeatedly reload large data lists");
}
console.log("Automatic new-price progress: lifecycle, failure, snapshots and isolated SSE scope OK");
