import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "./logger.js";

export type GoogleRequestPriority = "manual" | "background";
const priorityContext = new AsyncLocalStorage<GoogleRequestPriority>();

// Async context carries manual priority through group workers, informational
// seat lookups and detached manual jobs without changing business-level APIs.
// Cron/timer work has no request context and defaults to background.
export function withGooglePriority<T>(priority: GoogleRequestPriority, work: () => T): T {
  return priorityContext.run(priority, work);
}

export function manualGooglePriority(_req: unknown, _res: unknown, next: () => void): void {
  withGooglePriority("manual", next);
}

type JsonResult = { ok: boolean; status: number; data: any };
export class GoogleResponseJsonError extends Error {
  constructor(readonly status: number, cause: unknown) {
    super("Google response JSON could not be consumed", { cause });
    this.name = cause instanceof Error ? cause.name : "Error";
  }
}
type Entry = {
  key: string;
  url: string;
  apiKey: string;
  timeoutMs: number;
  priority: GoogleRequestPriority;
  attempt: number;
  resolve: (result: JsonResult) => void;
  reject: (error: unknown) => void;
};
type Clock = {
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};
type CoordinatorOptions = {
  concurrency?: number;
  gapMs?: number;
  clock?: Clock;
  fetch?: typeof fetch;
  signal?: (timeoutMs: number) => AbortSignal;
  log?: (fields: Record<string, unknown>, message: string) => void;
};

const DEFAULT_COOLDOWN_MS = 30_000;

// Valid Retry-After values are never shortened. Invalid/missing values get a
// conservative bounded default, not an immediate retry. Very long waits are
// serviced in timer-sized chunks (Node timers overflow above 2^31-1).
export function googleRetryAfterMs(value: string | null, now: number): number {
  if (value != null && value.trim() !== "") {
    const text = value.trim();
    const seconds = /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(text) - now;
    if (Number.isFinite(ms) && ms >= 0 && ms <= Number.MAX_SAFE_INTEGER - now) {
      return Math.max(1200, ms);
    }
  }
  return DEFAULT_COOLDOWN_MS;
}

/**
 * One process-wide Google gate: <=3 active HTTP requests, >=1200ms between
 * actual launches, including retries. A slot lasts through JSON consumption
 * (or error-body cancellation), not merely until response headers arrive.
 * Only unresolved requests are shared; never cache success or failure.
 */
export class GoogleRequestCoordinator {
  private readonly concurrency: number;
  private readonly gapMs: number;
  private readonly clock: Clock;
  private readonly fetcher: typeof fetch;
  private readonly signal: (timeoutMs: number) => AbortSignal;
  private readonly log: NonNullable<CoordinatorOptions["log"]>;
  private readonly queue: Entry[] = [];
  private readonly pending = new Map<string, { entry: Entry; promise: Promise<JsonResult> }>();
  private active = 0;
  private nextLaunchAt = 0;
  private cooldownUntil = 0;
  private manualBurst = 0;
  private timer: unknown;
  private failures = 0;
  private cooldowns = 0;

  constructor(options: CoordinatorOptions = {}) {
    this.concurrency = options.concurrency ?? 3;
    this.gapMs = options.gapMs ?? 1200;
    if (!Number.isInteger(this.concurrency) || this.concurrency < 1 || this.gapMs < 0) {
      throw new Error("Invalid Google coordinator limits");
    }
    this.clock = options.clock ?? {
      now: Date.now,
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
    };
    this.fetcher = options.fetch ?? ((...args) => fetch(...args));
    this.signal = options.signal ?? (ms => AbortSignal.timeout(ms));
    this.log = options.log ?? ((fields, message) => logger.warn(fields, message));
  }

  json(url: URL, apiKey: string, timeoutMs: number, priority = priorityContext.getStore() ?? "background"): Promise<JsonResult> {
    if (url.origin !== "https://google-flights2.p.rapidapi.com") {
      return Promise.reject(new Error("Google coordinator only accepts google-flights2"));
    }
    const canonical = new URL(url);
    canonical.searchParams.sort(); // Includes adults and EVERY query parameter.
    // Credentials are part of identity but are never logged. Timeout differences
    // must not let a 25s schedule abort a 55s seat check.
    const key = JSON.stringify([canonical.toString(), apiKey, timeoutMs]);
    let shared = this.pending.get(key);
    if (!shared) {
      let resolve!: Entry["resolve"];
      let reject!: Entry["reject"];
      const promise = new Promise<JsonResult>((yes, no) => { resolve = yes; reject = no; });
      const entry: Entry = { key, url: canonical.toString(), apiKey, timeoutMs, priority, attempt: 0, resolve, reject };
      shared = { entry, promise };
      this.pending.set(key, shared);
      this.queue.push(entry);
      this.pump();
    } else if (priority === "manual") {
      // A click joining background work promotes the queued lookup/retry too.
      shared.entry.priority = "manual";
      this.pump();
    }
    // Share parsed JSON, never Response/body streams or mutable caller objects.
    return shared.promise.then(result => structuredClone(result));
  }

  private pump(): void {
    if (this.timer !== undefined) {
      this.clock.clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.active >= this.concurrency || !this.queue.length) return;
    const wait = Math.max(this.nextLaunchAt, this.cooldownUntil) - this.clock.now();
    if (wait > 0) {
      this.timer = this.clock.setTimeout(() => {
        this.timer = undefined;
        this.pump();
      }, Math.min(wait, 2_147_483_647));
      return;
    }
    const manual = this.queue.findIndex(entry => entry.priority === "manual");
    const background = this.queue.findIndex(entry => entry.priority === "background");
    // Serve at least one background request after three manual launches when
    // both queues are nonempty. FIFO within each priority prevents starvation.
    const index = background >= 0 && (manual < 0 || this.manualBurst >= 3) ? background : manual;
    const [entry] = this.queue.splice(index, 1);
    this.manualBurst = entry.priority === "manual" ? Math.min(3, this.manualBurst + 1) : 0;
    this.active++;
    this.nextLaunchAt = this.clock.now() + this.gapMs;
    void this.execute(entry);
    this.pump();
  }

  private async execute(entry: Entry): Promise<void> {
    let retry = false;
    let status: number | undefined;
    entry.attempt++;
    try {
      const response = await this.fetcher(entry.url, {
        headers: { "x-rapidapi-host": "google-flights2.p.rapidapi.com", "x-rapidapi-key": entry.apiKey },
        signal: this.signal(entry.timeoutMs),
      });
      status = response.status;
      if (status === 429) {
        const delay = googleRetryAfterMs(response.headers.get("retry-after"), this.clock.now());
        this.cooldownUntil = Math.max(this.cooldownUntil, this.clock.now() + delay);
        this.cooldowns++;
        this.report("cooldown", entry, status, delay);
        // Only 429 is retried here, ONCE. Existing seat-group retries remain
        // bounded at three with 5s/10s backoff and also obey this shared gate.
        retry = entry.attempt < 2;
      }
      if (!response.ok) {
        await response.body?.cancel();
        this.failures++;
        this.report("http", entry, status);
        if (!retry) this.finish(entry, { ok: false, status, data: undefined });
      } else {
        let data: unknown;
        try {
          data = await response.json();
        } catch (error) {
          throw new GoogleResponseJsonError(status, error);
        }
        this.finish(entry, { ok: true, status, data });
      }
    } catch (error) {
      retry = false;
      this.failures++;
      // No URLs, credentials, upstream bodies or raw exception messages.
      this.report("transport_or_json", entry, status);
      this.pending.delete(entry.key);
      entry.reject(error);
    } finally {
      this.active--;
      if (retry) this.queue.push(entry);
      this.pump();
    }
  }

  private finish(entry: Entry, result: JsonResult): void {
    this.pending.delete(entry.key);
    entry.resolve(result);
  }

  private report(kind: string, entry: Entry, status?: number, cooldownMs?: number): void {
    this.log({
      provider: "google-flights2", kind, status, cooldownMs,
      attempt: entry.attempt, priority: entry.priority,
      active: this.active, queued: this.queue.length, shared: this.pending.size,
      failures: this.failures, cooldowns: this.cooldowns,
    }, "Google request coordination");
  }
}

const googleRequests = new GoogleRequestCoordinator();
export function fetchGoogleJson(url: URL, apiKey: string, timeoutMs: number, priority?: GoogleRequestPriority): Promise<JsonResult> {
  return googleRequests.json(url, apiKey, timeoutMs, priority);
}
