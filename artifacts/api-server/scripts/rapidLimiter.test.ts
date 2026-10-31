import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  GoogleRequestCoordinator, GoogleResponseJsonError, googleRetryAfterMs,
  manualGooglePriority, withGooglePriority,
} from "../src/lib/rapidLimiter.js";

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class FakeClock {
  time = 0;
  timers = new Map<object, { at: number; callback: () => void }>();
  now = () => this.time;
  setTimeout = (callback: () => void, ms: number) => {
    const id = {};
    this.timers.set(id, { at: this.time + ms, callback });
    return id;
  };
  clearTimeout = (id: unknown) => { this.timers.delete(id as object); };
  async advance(ms: number) {
    const target = this.time + ms;
    await flush();
    for (;;) {
      const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
      await flush();
    }
    this.time = target;
    await flush();
  }
}
const url = (adults = 1, extra = "") => new URL(
  `https://google-flights2.p.rapidapi.com/api/v1/searchFlights?departure_id=PRN&arrival_id=MXP&outbound_date=2030-01-01&currency=EUR&type=2&adults=${adults}${extra}`,
);
function response(data: unknown = { data: { itineraries: { topFlights: [] } } }, status = 200, retryAfter?: string): Response {
  return {
    ok: status >= 200 && status < 300, status,
    headers: new Headers(retryAfter == null ? {} : { "retry-after": retryAfter }),
    json: async () => data,
    body: { cancel: async () => undefined },
  } as unknown as Response;
}
function harness(fetcher: (url: string, init?: RequestInit) => Promise<Response>, concurrency = 3) {
  const clock = new FakeClock();
  const logs: Record<string, unknown>[] = [];
  const timeouts: number[] = [];
  const coordinator = new GoogleRequestCoordinator({
    clock, concurrency, fetch: fetcher as typeof fetch,
    signal: ms => { timeouts.push(ms); return new AbortController().signal; },
    log: fields => logs.push(fields),
  });
  return { clock, coordinator, logs, timeouts };
}

test("three active requests maximum; 1200ms launch spacing; slot held through JSON", async () => {
  const bodies = Array.from({ length: 5 }, () => deferred<unknown>());
  const launches: number[] = [];
  let active = 0, maxActive = 0;
  const h = harness(async () => {
    launches.push(h.clock.now());
    const body = bodies[launches.length - 1];
    active++;
    maxActive = Math.max(maxActive, active);
    return { ...response(), json: () => body.promise.finally(() => { active--; }) } as Response;
  });
  const jobs = bodies.map((_, i) => h.coordinator.json(url(1, `&day=${i}`), "secret", 25_000));
  await h.clock.advance(10_000);
  assert.deepEqual(launches, [0, 1200, 2400]);
  assert.equal(maxActive, 3);
  bodies[0].resolve({ ok: true });
  await flush();
  assert.deepEqual(launches, [0, 1200, 2400, 10_000]);
  bodies[1].resolve({ ok: true });
  await h.clock.advance(1199);
  assert.equal(launches.length, 4);
  await h.clock.advance(1);
  assert.equal(launches[4], 11_200);
  for (const body of bodies) body.resolve({ ok: true });
  await Promise.all(jobs);
  assert.equal(h.clock.timers.size, 0);
});

test("in-flight sharing canonicalizes all params; adults, timeout, other params and credentials stay distinct", async () => {
  const body = deferred<unknown>();
  let calls = 0;
  const h = harness(async () => { calls++; return { ...response(), json: () => body.promise } as Response; });
  const first = h.coordinator.json(url(), "key", 25_000);
  const reordered = new URL(url());
  const params = [...reordered.searchParams.entries()].reverse();
  reordered.search = new URLSearchParams(params).toString();
  const same = h.coordinator.json(reordered, "key", 25_000);
  const seat = h.coordinator.json(url(5), "key", 55_000);
  const differentTimeout = h.coordinator.json(url(), "key", 55_000);
  const differentQuery = h.coordinator.json(url(1, "&stops=0"), "key", 25_000);
  const differentKey = h.coordinator.json(url(), "other-key", 25_000);
  await h.clock.advance(2400);
  assert.equal(calls, 3);
  body.resolve({ nested: { count: 1 } });
  await h.clock.advance(2400);
  const [a, b] = await Promise.all([first, same, seat, differentTimeout, differentQuery, differentKey]);
  assert.equal(calls, 5);
  a.data.nested.count = 9;
  assert.equal(b.data.nested.count, 1, "callers must not share mutable JSON");
  const later = h.coordinator.json(url(), "key", 25_000);
  await h.clock.advance(1200);
  await later;
  assert.equal(calls, 6, "completed results are not cached");
  assert.deepEqual(h.timeouts, [25_000, 55_000, 55_000, 25_000, 25_000, 25_000]);
});

test("manual requests jump background FIFO; background runs after at most three manuals", async () => {
  const launches: string[] = [];
  const h = harness(async address => {
    launches.push(new URL(address).searchParams.get("job")!);
    return response();
  }, 1);
  const job = (name: string) => h.coordinator.json(url(1, `&job=${name}`), "key", 25_000);
  const jobs = [job("initial"), job("bg1"), job("bg2")];
  // Verify async context flows across an await and the route middleware.
  await new Promise<void>(resolve => manualGooglePriority({}, {}, () => {
    void (async () => {
      await Promise.resolve();
      for (let i = 1; i <= 5; i++) jobs.push(job(`manual${i}`));
      resolve();
    })();
  }));
  await h.clock.advance(8400);
  await Promise.all(jobs);
  assert.deepEqual(launches, ["initial", "manual1", "manual2", "manual3", "bg1", "manual4", "manual5", "bg2"]);
});

test("a manual subscriber promotes a coalesced queued background request", async () => {
  const launches: string[] = [];
  const h = harness(async address => {
    launches.push(new URL(address).searchParams.get("job")!);
    return response();
  });
  const jobs = [
    h.coordinator.json(url(1, "&job=initial"), "key", 25_000),
    h.coordinator.json(url(1, "&job=background"), "key", 25_000),
    h.coordinator.json(url(1, "&job=promoted"), "key", 25_000),
    withGooglePriority("manual", () => h.coordinator.json(url(1, "&job=promoted"), "key", 25_000)),
  ];
  await h.clock.advance(2400);
  await Promise.all(jobs);
  assert.deepEqual(launches, ["initial", "promoted", "background"]);
});

test("429 creates shared Retry-After cooldown; all queued work and retries stay spaced", async () => {
  const launches: { at: number; job: string }[] = [];
  let cancels = 0;
  const h = harness(async address => {
    const job = new URL(address).searchParams.get("job")!;
    launches.push({ at: h.clock.now(), job });
    if (launches.length === 1) return {
      ...response(undefined, 429, "5"),
      body: { cancel: async () => { cancels++; } },
    } as Response;
    return response();
  });
  const jobs = [
    h.coordinator.json(url(1, "&job=limited"), "SECRET", 25_000),
    h.coordinator.json(url(1, "&job=queued"), "SECRET", 25_000),
  ];
  await h.clock.advance(4999);
  assert.equal(launches.length, 1);
  await h.clock.advance(1);
  assert.equal(launches[1].at, 5000);
  await h.clock.advance(1200);
  await Promise.all(jobs);
  assert.deepEqual(launches.map(x => x.at), [0, 5000, 6200]);
  assert.equal(cancels, 1);
  assert.equal(h.logs[0].kind, "cooldown");
  assert.equal(h.logs[0].cooldownMs, 5000);
  assert.ok(!JSON.stringify(h.logs).includes("SECRET"));
  assert.ok(!JSON.stringify(h.logs).includes("departure_id"));
});

test("persistent 429 has one retry only; missing Retry-After defaults to 30s and applies after final failure", async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return response(undefined, 429); });
  const first = h.coordinator.json(url(), "key", 25_000);
  await h.clock.advance(29_999);
  assert.equal(calls, 1);
  await h.clock.advance(1);
  assert.deepEqual(await first, { ok: false, status: 429, data: undefined });
  assert.equal(calls, 2);
  const later = h.coordinator.json(url(), "key", 25_000);
  await h.clock.advance(29_999);
  assert.equal(calls, 2);
  await h.clock.advance(30_001);
  await later;
  assert.equal(calls, 4, "failed requests are not cached; each request is bounded");
  assert.equal(h.clock.timers.size, 0);
});

test("an already-active request can extend cooldown, never shorten it", async () => {
  const firstHeaders = deferred<Response>();
  const secondHeaders = deferred<Response>();
  const launches: number[] = [];
  const h = harness(async () => {
    launches.push(h.clock.now());
    if (launches.length === 1) return firstHeaders.promise;
    if (launches.length === 2) return secondHeaders.promise;
    return response();
  });
  const jobs = [
    h.coordinator.json(url(1), "key", 25_000),
    h.coordinator.json(url(2), "key", 25_000),
    h.coordinator.json(url(3), "key", 25_000),
  ];
  await h.clock.advance(1200);
  firstHeaders.resolve(response(undefined, 429, "10"));
  await flush();
  await h.clock.advance(500);
  secondHeaders.resolve(response(undefined, 429, "15"));
  await h.clock.advance(14_999);
  assert.deepEqual(launches, [0, 1200]);
  await h.clock.advance(1);
  assert.equal(launches[2], 16_700);
  await h.clock.advance(2400);
  await Promise.all(jobs);
  assert.deepEqual(launches, [0, 1200, 16_700, 17_900, 19_100]);
});

test("Retry-After supports seconds and HTTP dates; malformed values use safe fallback", () => {
  const now = Date.parse("2030-01-01T00:00:00Z");
  assert.equal(googleRetryAfterMs("10", now), 10_000);
  assert.equal(googleRetryAfterMs("0", now), 1200);
  assert.equal(googleRetryAfterMs("Tue, 01 Jan 2030 00:01:00 GMT", now), 60_000);
  assert.equal(googleRetryAfterMs("7200", now), 7_200_000, "do not shorten a valid provider cooldown");
  for (const invalid of [null, "", "garbage", "-3", "Infinity", "99999999999999999999999999"]) {
    assert.equal(googleRetryAfterMs(invalid, now), 30_000);
  }
});

test("network, timeout and JSON errors release slots, clear coalescing, and do not auto-retry", async () => {
  for (const mode of ["network", "timeout", "json"]) {
    const body = deferred<unknown>();
    let calls = 0;
    const h = harness(async () => {
      calls++;
      if (calls > 1) return response({ recovered: true });
      if (mode === "json") return { ...response(), json: () => body.promise } as Response;
      throw new DOMException("sensitive upstream detail", mode === "timeout" ? "TimeoutError" : "NetworkError");
    }, 1);
    const first = h.coordinator.json(url(), "key", 25_000);
    const same = h.coordinator.json(url(), "key", 25_000);
    const settled = Promise.allSettled([first, same]);
    if (mode === "json") {
      await flush();
      body.reject(new SyntaxError("sensitive invalid JSON"));
    }
    const outcomes = await settled;
    assert.ok(outcomes.every(x => x.status === "rejected"));
    if (mode === "json") {
      const error = (outcomes[0] as PromiseRejectedResult).reason;
      assert.ok(error instanceof GoogleResponseJsonError);
      assert.equal(error.status, 200);
    }
    assert.equal(calls, 1);
    const second = h.coordinator.json(url(), "key", 25_000);
    await h.clock.advance(1200);
    assert.equal((await second).data.recovered, true);
    assert.equal(calls, 2);
    assert.equal(h.clock.timers.size, 0);
    assert.ok(!JSON.stringify(h.logs).includes("sensitive"));
  }
});

test("HTTP failure consumes/cancels error body before releasing its slot; valid empty stays success", async () => {
  const cancelled = deferred<void>();
  let calls = 0;
  const h = harness(async () => {
    calls++;
    return calls === 1 ? {
      ...response(undefined, 503), body: { cancel: () => cancelled.promise },
    } as Response : response({ data: { itineraries: { topFlights: [], otherFlights: [] } } });
  }, 1);
  const first = h.coordinator.json(url(), "key", 25_000);
  const second = h.coordinator.json(url(2), "key", 55_000);
  await h.clock.advance(5000);
  assert.equal(calls, 1);
  cancelled.resolve();
  await flush();
  assert.equal((await first).status, 503);
  assert.equal((await second).ok, true);
  assert.equal(calls, 2);
});

test("all upstream call sites use the JSON gate, preserve timeouts and install manual priority", () => {
  // Run from the API artifact, matching the existing script-test convention.
  const source = (name: string) => readFileSync(path.resolve("src", name), "utf8");
  const flights = source("routes/flights.ts");
  const seats = source("lib/seatCheck.ts");
  assert.match(flights, /fetchGoogleJson\(url, apiKey, 25_000, opts\?\.priority\)/);
  assert.match(seats, /fetchGoogleJson\(url, apiKey, 55_000, priority\)/);
  assert.doesNotMatch(flights + seats, /rapidApiSlot|x-rapidapi-key/);
  for (const name of [
    "flights", "flightDiscovery", "seatCheckSettings", "noPriceCheckSettings",
    "stalePriceCheckSettings", "newPriceCheckSettings", "wizzPriceMonitor",
  ]) assert.match(source(`routes/${name}.ts`), /router\.use\(manualGooglePriority\)/);
});
