const STORAGE_KEY = "fms.performance-metrics.v1";
const MAX_RECORDS = 100;
const INTERACTION_TTL_MS = 1000;
const REQUEST_CORRELATION_TTL_MS = 30000;
const API_PREFIX = /^\/api(?:\/|$)/;
const STATIC_ROUTE_GROUPS = new Set([
  "flights", "bookings", "passengers", "tasks", "notifications", "claim",
  "assistant", "atlas-seat-alerts", "agents", "payments", "reports",
  "group-tickets", "offline-flights", "admin-email", "import-alerts",
  "schedule-changes", "users", "permissions", "price-requests", "settings",
  "price-rules", "integrations", "schedule-check", "flight-types",
  "destinations", "flight-discovery", "wizz-price-monitor", "my-requests",
]);

export type PerformanceMetric = {
  routeGroup: string;
  action: "button" | "link" | "input" | "select";
  interactionToRequestMs: number;
  requestToResponseEndMs: number;
  interactionToRenderMs: number;
  status?: "success" | "error";
};

type Interaction = {
  routeGroup: string;
  action: PerformanceMetric["action"];
  time: number;
};

type TrackedRequest = {
  // Used only in-memory to correlate with Resource Timing, then blanked on match.
  url: string;
  startTime: number;
  interaction: Interaction;
  status?: "success" | "error";
  finished: boolean;
};

type ApiRequestInfo = {
  kind: "api" | "excluded";
  url: string;
};

const interactions: Interaction[] = [];
const trackedRequests: TrackedRequest[] = [];
let installed = false;

function pruneTrackedRequests(now = performance.now()): void {
  for (let index = trackedRequests.length - 1; index >= 0; index--) {
    const request = trackedRequests[index];
    if (now - request.startTime > REQUEST_CORRELATION_TTL_MS) {
      request.url = "";
      trackedRequests.splice(index, 1);
    }
  }
}

function routeGroup(): string {
  let pathname = window.location.pathname;
  try {
    const basePath = new URL(import.meta.env.BASE_URL, window.location.origin).pathname.replace(/\/+$/, "");
    if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
      pathname = pathname.slice(basePath.length) || "/";
    }
  } catch {
    // Keep the current path if the configured base cannot be normalized.
  }
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  return STATIC_ROUTE_GROUPS.has(firstSegment) ? firstSegment : "root";
}

function classifyTarget(target: EventTarget | null): PerformanceMetric["action"] | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest("button, a, input, select");
  if (!control) return null;
  if (control instanceof HTMLButtonElement) return "button";
  if (control instanceof HTMLAnchorElement) return "link";
  if (control instanceof HTMLSelectElement) return "select";
  if (control instanceof HTMLInputElement) {
    return ["button", "submit", "reset"].includes(control.type) ? "button" : "input";
  }
  return null;
}

function onInteraction(event: Event): void {
  const action = classifyTarget(event.target);
  if (!action || (event.type === "change" && action !== "input" && action !== "select")) return;
  const time = performance.now();
  interactions.push({ routeGroup: routeGroup(), action, time });
  while (interactions.length > 10) interactions.shift();
}

function apiRequestInfo(rawUrl: string | URL): ApiRequestInfo | null {
  try {
    const url = new URL(String(rawUrl), window.location.href);
    if (url.origin !== window.location.origin || !API_PREFIX.test(url.pathname)) return null;
    const kind = /^\/api\/admin\/(?:login|setup|logout|me|has-admin)(?:\/|$)/.test(url.pathname)
      ? "excluded"
      : "api";
    url.hash = "";
    return { kind, url: url.href };
  } catch {
    return null;
  }
}

function startTrackedRequest(info: ApiRequestInfo): TrackedRequest | null {
  const now = performance.now();
  pruneTrackedRequests(now);
  while (interactions.length && now - interactions[0].time > INTERACTION_TTL_MS) interactions.shift();
  const interaction = interactions.pop();
  interactions.length = 0;
  if (!interaction) return null;
  // Authentication setup/session calls are excluded from authenticated FMS
  // measurements, and still consume the triggering interaction.
  if (info.kind === "excluded") return null;
  const request: TrackedRequest = { url: info.url, startTime: now, interaction, finished: false };
  trackedRequests.push(request);
  while (trackedRequests.length > MAX_RECORDS) trackedRequests.shift();
  return request;
}

function persistMetric(metric: PerformanceMetric): void {
  try {
    const previous = getPerformanceMetrics();
    previous.push(metric);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(previous.slice(-MAX_RECORDS)));
  } catch {
    // Storage may be unavailable or full; measurement must never affect the app.
  }
}

function finishRequest(request: TrackedRequest, responseEnd: number): void {
  if (request.finished || !Number.isFinite(responseEnd) || responseEnd < request.startTime) return;
  request.finished = true;
  request.url = "";
  const scheduleFrame = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16);
  scheduleFrame(() => scheduleFrame(() => {
    const renderedAt = performance.now();
    const metric: PerformanceMetric = {
      routeGroup: request.interaction.routeGroup,
      action: request.interaction.action,
      interactionToRequestMs: round(request.startTime - request.interaction.time),
      requestToResponseEndMs: round(responseEnd - request.startTime),
      interactionToRenderMs: round(renderedAt - request.interaction.time),
    };
    if (request.status) metric.status = request.status;
    persistMetric(metric);
  }));
}

function round(value: number): number {
  return Math.round(Math.max(0, value) * 10) / 10;
}

function validMetric(value: unknown): value is PerformanceMetric {
  if (!value || typeof value !== "object") return false;
  const metric = value as Record<string, unknown>;
  return (metric.routeGroup === "root" || (typeof metric.routeGroup === "string" && STATIC_ROUTE_GROUPS.has(metric.routeGroup)))
    && (metric.action === "button" || metric.action === "link" || metric.action === "input" || metric.action === "select")
    && Number.isFinite(metric.interactionToRequestMs)
    && Number.isFinite(metric.requestToResponseEndMs)
    && Number.isFinite(metric.interactionToRenderMs)
    && (metric.status === undefined || metric.status === "success" || metric.status === "error");
}

export function getPerformanceMetrics(): PerformanceMetric[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validMetric).slice(-MAX_RECORDS).map(metric => ({
      routeGroup: metric.routeGroup,
      action: metric.action,
      interactionToRequestMs: metric.interactionToRequestMs,
      requestToResponseEndMs: metric.requestToResponseEndMs,
      interactionToRenderMs: metric.interactionToRenderMs,
      ...(metric.status ? { status: metric.status } : {}),
    }));
  } catch {
    return [];
  }
}

export function clearPerformanceMetrics(): void {
  interactions.length = 0;
  trackedRequests.length = 0;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}

export function startPerformanceMetrics(): void {
  if (installed || typeof window === "undefined" || typeof performance === "undefined") return;
  installed = true;
  document.addEventListener("click", onInteraction, true);
  document.addEventListener("change", onInteraction, true);

  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver(list => {
      pruneTrackedRequests();
      for (const entry of list.getEntries()) {
        if (!(entry instanceof PerformanceResourceTiming) || !entry.responseEnd) continue;
        const entryRequest = apiRequestInfo(entry.name);
        if (entryRequest?.kind !== "api") continue;
        const matches = trackedRequests.filter(candidate =>
          !candidate.finished &&
          candidate.url === entryRequest.url &&
          entry.startTime >= candidate.startTime - 5 &&
          entry.startTime <= candidate.startTime + 1000,
        );
        if (!matches.length) continue;
        matches.sort((left, right) =>
          Math.abs(entry.startTime - left.startTime) - Math.abs(entry.startTime - right.startTime),
        );
        const closest = matches[0];
        const nextClosest = matches[1];
        if (nextClosest &&
          Math.abs(
            Math.abs(entry.startTime - closest.startTime) -
            Math.abs(entry.startTime - nextClosest.startTime),
          ) <= 1) {
          continue;
        }
        finishRequest(closest, entry.responseEnd);
      }
    });
    observer.observe({ type: "resource", buffered: true });
  } catch {
    // Older browsers may not support resource timing observation.
    return;
  }

  const originalFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const info = apiRequestInfo(rawUrl);
    const request = info ? startTrackedRequest(info) : null;
    let result: Promise<Response>;
    try {
      result = originalFetch.call(this, input, init);
    } catch (error) {
      if (request) request.status = "error";
      throw error;
    }
    return result.then(response => {
      if (request) request.status = response.ok ? "success" : "error";
      return response;
    }, error => {
      if (request) request.status = "error";
      throw error;
    });
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const xhrApiRequests = new WeakMap<XMLHttpRequest, ApiRequestInfo>();
  XMLHttpRequest.prototype.open = function(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    const info = apiRequestInfo(url);
    if (info) xhrApiRequests.set(this, info);
    else xhrApiRequests.delete(this);
    return originalOpen.call(this, method, url, async ?? true, username, password);
  };
  XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
    const info = xhrApiRequests.get(this);
    xhrApiRequests.delete(this);
    const request = info ? startTrackedRequest(info) : null;
    if (request) {
      this.addEventListener("loadend", () => {
        request.status = this.status >= 200 && this.status < 400 ? "success" : "error";
      }, { once: true });
    }
    return originalSend.call(this, body);
  };
}
