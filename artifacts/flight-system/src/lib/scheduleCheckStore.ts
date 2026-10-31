// Background-capable store for the batch "Kontrollo Oraret" (schedule/price check).
//
// The batch loop runs here, at module scope, completely detached from the React
// component lifecycle. That means when the user navigates away from the page the
// check keeps running, and when they come back the page just re-reads the current
// snapshot (live progress, or the finished result). The store survives in-app
// navigation; the last *finished* result is also mirrored to sessionStorage so it
// reappears even after a full page reload (a still-running batch cannot be resumed
// after reload because the in-flight fetches die with the document).

interface Change { field: string; old: string; new: string }

export interface BatchCheckResult {
  id: number;
  flightNumber: string;
  airline: string;
  departureDate: string;
  ourDepartureTime: string;
  ourArrivalTime: string;
  ourArrivalDate: string;
  googleDepartureDate: string | null;
  googleArrivalDate: string | null;
  googleDepartureTime: string | null;
  googleArrivalTime: string | null;
  status: "unchanged" | "time_changed" | "not_found" | "api_empty";
  changes: Change[];
  googleRaw: number;
  ourPrice: number | null;
  googlePrice: number | null;
}

export interface BatchCheckResponse {
  results: BatchCheckResult[];
  total: number;
  from: string;
  to: string;
  startDate: string;
  endDate: string;
  newFlights?: any[];
}

export interface BatchTarget {
  fromCity: string;
  toCity: string;
  firstDate: string;
  lastDate: string;
  flightNumber: string;
}

export type BatchStatus = "idle" | "running" | "done";

export interface BatchState {
  status: BatchStatus;
  progress: { done: number; total: number } | null;
  response: BatchCheckResponse | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const STORAGE_KEY = "scheduleCheck.lastBatch.v1";

function loadPersisted(): BatchState {
  const idle: BatchState = { status: "idle", progress: null, response: null, startedAt: null, finishedAt: null };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return idle;
    const parsed = JSON.parse(raw) as Partial<BatchState>;
    // Only a *finished* result is meaningful to restore after a reload.
    if (parsed.status === "done" && parsed.response) {
      return {
        status: "done",
        progress: null,
        response: parsed.response as BatchCheckResponse,
        startedAt: parsed.startedAt ?? null,
        finishedAt: parsed.finishedAt ?? null,
      };
    }
  } catch { /* ignore */ }
  return idle;
}

let state: BatchState = loadPersisted();
const listeners = new Set<() => void>();

function persist() {
  try {
    if (state.status === "done" && state.response) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else if (state.status === "idle") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

function setState(next: Partial<BatchState>) {
  state = { ...state, ...next };
  persist();
  listeners.forEach(l => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot(): BatchState {
  return state;
}

// Allow the page to edit the active batch response (e.g. drop a "new flight"
// after the user adds it) without losing the background-store ownership.
function setResponse(resp: BatchCheckResponse | null) {
  setState({ response: resp });
}

function clear() {
  setState({ status: "idle", progress: null, response: null, startedAt: null, finishedAt: null });
}

async function start(targets: BatchTarget[], apiBase: string): Promise<void> {
  if (state.status === "running") return;        // already running — ignore re-trigger
  if (!targets.length) return;

  setState({
    status: "running",
    progress: { done: 0, total: targets.length },
    response: null,
    startedAt: Date.now(),
    finishedAt: null,
  });

  const allResults: BatchCheckResult[] = [];
  let done = 0;
  const CONCURRENCY = 3;
  const queue = [...targets];

  async function worker() {
    while (queue.length > 0) {
      const f = queue.shift();
      if (!f) break;
      try {
        const res = await fetch(`${apiBase}/flights/schedule-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            from: f.fromCity,
            to:   f.toCity,
            startDate: f.firstDate,
            endDate:   f.lastDate,
            flightNumber: f.flightNumber,
          }),
        });
        if (res.ok) {
          const data: BatchCheckResponse = await res.json();
          allResults.push(...data.results);
        }
      } catch { /* ignore individual errors */ }
      finally {
        done++;
        setState({ progress: { done, total: targets.length } });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()));

  allResults.sort((a, b) => a.departureDate.localeCompare(b.departureDate) || a.flightNumber.localeCompare(b.flightNumber));

  setState({
    status: "done",
    progress: null,
    finishedAt: Date.now(),
    response: {
      results: allResults,
      total: allResults.length,
      from: `${targets.length} rrugë`,
      to: "",
      startDate: "",
      endDate: "",
    },
  });
}

export const scheduleCheckStore = {
  subscribe,
  getSnapshot,
  start,
  setResponse,
  clear,
};
