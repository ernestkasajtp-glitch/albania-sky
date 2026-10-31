import assert from "node:assert/strict";
import { GooglePriceWarmerQueue } from "../src/lib/googlePriceWarmerQueue.js";

export async function testGooglePriceWarmerQueue(): Promise<void> {
  const queue = new GooglePriceWarmerQueue();
  const candidate = await queue.acquire();
  assert.equal(await queue.yield(candidate), candidate, "no waiting work: same lease, no delay");
  const staleWaiting = queue.acquire();
  const noPriceWaiting = queue.acquire();
  let resumed = false;
  const resume = queue.yield(candidate).then(token => { resumed = true; return token; });
  const stale = await staleWaiting;
  assert.equal(queue.owns(stale), true);
  assert.equal(queue.owns(candidate), false);
  assert.equal(resumed, false, "candidate cannot write while stale checks own the queue");
  queue.release(candidate);
  assert.equal(queue.owns(stale), true, "old/non-owner release cannot unlock another writer");
  queue.release(stale);
  const noPrice = await noPriceWaiting;
  assert.equal(queue.owns(noPrice), true, "FIFO preserves other already waiting checks");
  assert.equal(resumed, false);
  queue.release(noPrice);
  assert.equal(await resume, candidate, "yield preserves the caller's finally lease");
  assert.equal(queue.owns(candidate), true);

  // A new contender arriving during the pause cannot jump ahead of the lease
  // already queued for resumption. Failure/finally must still hand off safely.
  const nextStaleWaiting = queue.acquire();
  const nextResume = queue.yield(candidate);
  const nextStale = await nextStaleWaiting;
  const newcomerWaiting = queue.acquire();
  queue.release(nextStale);
  await nextResume;
  assert.equal(queue.owns(candidate), true);
  try {
    throw new Error("simulated upstream failure after resumption");
  } catch {
    // Production callers release in finally even after failed groups.
  } finally {
    queue.release(candidate);
  }
  const newcomer = await newcomerWaiting;
  assert.equal(queue.owns(newcomer), true);
  assert.throws(() => queue.yield(candidate), /without ownership/);
  queue.release(newcomer);

  // With a waiter for every group, a long candidate job yields repeatedly, not
  // only on its first group. The maximum number of simultaneous owners is one.
  const longJob = await queue.acquire();
  for (let group = 0; group < 20; group++) {
    const checkWaiting = queue.acquire();
    const continueJob = queue.yield(longJob);
    const check = await checkWaiting;
    assert.equal(queue.owns(check), true);
    assert.equal(queue.owns(longJob), false);
    queue.release(check);
    assert.equal(await continueJob, longJob);
    assert.equal(queue.owns(longJob), true);
  }
  queue.release(longJob);
  console.log("Google warmer FIFO and cooperative handoff tests: OK");
}
