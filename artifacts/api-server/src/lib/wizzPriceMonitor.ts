import { db, settingsTable, taskNotificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchGoogleFlightSchedules } from "../routes/flights.js";
import { sendEmail } from "./gmail.js";
import { logger } from "./logger.js";
import { isModuleEnabled } from "./moduleControls.js";
import { fetchWhileEnabled } from "./backgroundWork.js";
import {
  isWizzMonitorDue,
  runDueWizzMonitorCycle,
  wizzMonitorErrorForDates,
} from "./wizzPriceMonitorPolicy.js";

const STORE_KEY = "wizz_price_monitors.v1";
const ENABLED_KEY = "wizz_price_monitor_enabled";
const MAX_HISTORY = 90;

export async function getWizzMonitoringEnabled(): Promise<boolean> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, ENABLED_KEY));
  return row?.value !== "false";
}

export async function setWizzMonitoringEnabled(enabled: boolean): Promise<boolean> {
  await db.insert(settingsTable)
    .values({ key: ENABLED_KEY, value: String(enabled), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: String(enabled), updatedAt: new Date() },
    });
  return enabled;
}

async function isWizzMonitoringAllowed(): Promise<boolean> {
  return await isModuleEnabled("wizzMonitor") && await getWizzMonitoringEnabled();
}

class WizzMonitoringPausedError extends Error {}

async function assertWizzMonitoringAllowed(): Promise<true> {
  if (!(await isWizzMonitoringAllowed())) throw new WizzMonitoringPausedError("Monitorimi Wizz është çaktivizuar.");
  return true;
}

export interface WizzPriceHistory {
  price: number;
  checkedAt: string;
}

export interface WizzMonitorResult {
  departureDate: string;
  flightNumber: string;
  airline: string;
  departureTime: string;
  arrivalTime: string;
  currentPrice: number | null;
  previousPrice: number | null;
  lowestPrice: number | null;
  dropAmount: number | null;
  dropPercent: number | null;
  lastCheckedAt: string | null;
  history: WizzPriceHistory[];
}

export interface WizzMonitor {
  id: string;
  name: string;
  fromAirport: string;
  toAirport: string;
  startDate: string;
  endDate: string;
  enabled: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
  results: WizzMonitorResult[];
  pendingAlerts?: Array<Omit<WizzMonitorResult, "history"> & { eventId: string }>;
}

export interface WizzMonitorDefaultRule {
  startDate: string;
  endDate: string;
  intervalHours?: number;
}

export class WizzMonitorDuplicateError extends Error {
  constructor(fromAirport: string, toAirport: string) {
    super(`Monitorimi ${fromAirport} → ${toAirport} ekziston tashmë.`);
    this.name = "WizzMonitorDuplicateError";
  }
}

export interface WizzStore { version: 1; monitors: WizzMonitor[]; defaultRule?: WizzMonitorDefaultRule; }
interface RunInfo { running: boolean; total: number; completed: number; startedAt: string | null; }

const runs = new Map<string, RunInfo>();
const reservedRuns = new Set<string>();
let runAllActive = false;

function blankStore(): WizzStore {
  return { version: 1, monitors: [] };
}

async function readStore(): Promise<WizzStore> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, STORE_KEY));
  if (!rows[0]?.value) return blankStore();
  try {
    const parsed = JSON.parse(rows[0].value) as WizzStore;
    if (parsed?.version === 1 && Array.isArray(parsed.monitors)) return parsed;
  } catch (err) {
    logger.warn({ err }, "Invalid Wizz monitor settings JSON; using empty store");
  }
  return blankStore();
}

async function writeStore(store: WizzStore): Promise<void> {
  await db.insert(settingsTable)
    .values({ key: STORE_KEY, value: JSON.stringify(store), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: JSON.stringify(store), updatedAt: new Date() },
    });
}

export function createSerializedWizzStoreMutator(
  read: () => Promise<WizzStore>,
  write: (store: WizzStore) => Promise<void>,
): <T>(fn: (store: WizzStore) => Promise<T> | T) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: (store: WizzStore) => Promise<T> | T): Promise<T> => {
    const task = chain.then(async () => {
      const store = await read();
      const result = await fn(store);
      await write(store);
      return result;
    });
    chain = task.catch(() => undefined);
    return task;
  };
}

const mutateStore = createSerializedWizzStoreMutator(readStore, writeStore);

export async function listWizzMonitors(): Promise<WizzMonitor[]> {
  return (await readStore()).monitors;
}

export async function getWizzMonitorDefaultRule(): Promise<WizzMonitorDefaultRule | null> {
  const rule = (await readStore()).defaultRule;
  return rule ? { ...rule, intervalHours: rule.intervalHours ?? 12 } : null;
}

export async function setWizzMonitorDefaultRule(rule: WizzMonitorDefaultRule): Promise<WizzMonitorDefaultRule> {
  return mutateStore(store => {
    store.defaultRule = { ...rule, intervalHours: rule.intervalHours ?? store.defaultRule?.intervalHours ?? 12 };
    return store.defaultRule;
  });
}

export async function getWizzMonitor(id: string): Promise<WizzMonitor | undefined> {
  return (await readStore()).monitors.find(m => m.id === id);
}

export function validateWizzMonitorInput(input: {
  fromAirport?: unknown; toAirport?: unknown; startDate?: unknown; endDate?: unknown;
}): string | null {
  if (typeof input.fromAirport !== "string" || !/^[A-Z]{3}$/.test(input.fromAirport)) return "Aeroporti i nisjes duhet të ketë 3 shkronja të mëdha.";
  if (typeof input.toAirport !== "string" || !/^[A-Z]{3}$/.test(input.toAirport)) return "Aeroporti i mbërritjes duhet të ketë 3 shkronja të mëdha.";
  if (typeof input.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return "Data e nisjes nuk është valide.";
  if (typeof input.endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) return "Data e mbarimit nuk është valide.";
  if (input.endDate < input.startDate) return "Data e mbarimit duhet të jetë pas datës së fillimit.";
  const start = Date.parse(`${input.startDate}T00:00:00Z`);
  const end = Date.parse(`${input.endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Intervali i datave nuk është valid.";
  return null;
}

export function validateWizzMonitorDefaultRule(input: {
  startDate?: unknown; endDate?: unknown; intervalHours?: unknown;
}): string | null {
  if (input.intervalHours !== undefined && (typeof input.intervalHours !== "number" || !Number.isInteger(input.intervalHours) || input.intervalHours < 1 || input.intervalHours > 168)) return "Intervali duhet të jetë numër i plotë nga 1 deri në 168 orë.";
  if (typeof input.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return "Data e nisjes nuk është valide.";
  if (typeof input.endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) return "Data e mbarimit nuk është valide.";
  if (input.endDate < input.startDate) return "Data e mbarimit duhet të jetë pas datës së fillimit.";
  const start = Date.parse(`${input.startDate}T00:00:00Z`);
  const end = Date.parse(`${input.endDate}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? null : "Intervali i datave nuk është valid.";
}

export async function createWizzMonitor(input: {
  name?: string; fromAirport: string; toAirport: string; startDate: string; endDate: string; createdBy: number;
}): Promise<{ monitor: WizzMonitor; created: boolean }> {
  const now = new Date().toISOString();
  return mutateStore(store => applyWizzMonitorCreate(
    store,
    input,
    now,
    `wizz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  ));
}

export function applyWizzMonitorCreate(
  store: WizzStore,
  input: {
    name?: string; fromAirport: string; toAirport: string; startDate: string; endDate: string; createdBy: number;
  },
  now: string,
  id: string,
): { monitor: WizzMonitor; created: boolean } {
  const existing = store.monitors.find(
    m => m.fromAirport === input.fromAirport && m.toAirport === input.toAirport,
  );
  if (existing) {
    const periodChanged =
      existing.startDate !== input.startDate ||
      existing.endDate !== input.endDate;
    existing.startDate = input.startDate;
    existing.endDate = input.endDate;
    if (input.name?.trim()) existing.name = input.name.trim();
    existing.updatedAt = now;
    if (periodChanged) {
      existing.results = [];
      existing.pendingAlerts = [];
      existing.lastRunAt = null;
      existing.lastCompletedAt = null;
      existing.lastError = null;
    }
    return { monitor: existing, created: false };
  }
  const monitor: WizzMonitor = {
    id,
    name: input.name?.trim() || `${input.fromAirport} → ${input.toAirport}`,
    fromAirport: input.fromAirport, toAirport: input.toAirport,
    startDate: input.startDate, endDate: input.endDate, enabled: true,
    createdBy: input.createdBy, createdAt: now, updatedAt: now,
    lastRunAt: null, lastCompletedAt: null, lastError: null, results: [],
  };
  store.monitors.push(monitor);
  return { monitor, created: true };
}

export async function updateWizzMonitor(id: string, patch: Partial<Pick<WizzMonitor, "name" | "fromAirport" | "toAirport" | "startDate" | "endDate" | "enabled">>): Promise<WizzMonitor | undefined> {
  return mutateStore(store => {
    const monitor = store.monitors.find(m => m.id === id);
    if (!monitor) return undefined;
    const nextFrom = patch.fromAirport ?? monitor.fromAirport;
    const nextTo = patch.toAirport ?? monitor.toAirport;
    if (store.monitors.some(m => m.id !== id && m.fromAirport === nextFrom && m.toAirport === nextTo)) {
      throw new WizzMonitorDuplicateError(nextFrom, nextTo);
    }
    const searchChanged =
      nextFrom !== monitor.fromAirport ||
      nextTo !== monitor.toAirport ||
      (patch.startDate != null && patch.startDate !== monitor.startDate) ||
      (patch.endDate != null && patch.endDate !== monitor.endDate);
    Object.assign(monitor, patch, { updatedAt: new Date().toISOString() });
    if (searchChanged) {
      monitor.results = [];
      monitor.pendingAlerts = [];
      monitor.lastRunAt = null;
      monitor.lastCompletedAt = null;
      monitor.lastError = null;
    }
    return monitor;
  });
}

export async function deleteWizzMonitor(id: string): Promise<boolean> {
  return mutateStore(store => {
    const before = store.monitors.length;
    store.monitors = store.monitors.filter(m => m.id !== id);
    return store.monitors.length !== before;
  });
}

export function getWizzRunInfo(): Record<string, RunInfo> {
  return Object.fromEntries(runs.entries());
}

export function isWizzRunActive(id: string): boolean {
  return reservedRuns.has(id) || runs.get(id)?.running === true;
}

export function isWizzRunAllActive(): boolean {
  return runAllActive;
}

export async function runAllWizzPriceMonitors(): Promise<void> {
  if (runAllActive) return;
  runAllActive = true;
  try {
    const monitors = (await listWizzMonitors()).filter(monitor => monitor.enabled);
    for (const monitor of monitors) {
      if (!(await isWizzMonitoringAllowed())) break;
      await runWizzPriceMonitor(monitor.id);
    }
  } finally {
    runAllActive = false;
  }
}

function isoToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });
}

function albaniaDateOf(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });
}

function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const final = new Date(`${end}T00:00:00Z`);
  for (; cursor <= final; cursor.setUTCDate(cursor.getUTCDate() + 1)) out.push(cursor.toISOString().slice(0, 10));
  return out;
}

function isWizz(airline: string, flightNumber: string): boolean {
  void airline;
  const normalized = flightNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^(W4|W6|W9)\d+[A-Z]?$/.test(normalized);
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function saveResult(monitorId: string, date: string, flights: WizzMonitorResult[], checkedAt: string): Promise<WizzMonitorResult[]> {
  return mutateStore(store => {
    const monitor = store.monitors.find(m => m.id === monitorId);
    if (!monitor) return [];
    const byKey = new Map(monitor.results.map(r => [`${r.departureDate}|${r.flightNumber}`, r]));
    for (const incoming of flights) {
      const key = `${incoming.departureDate}|${incoming.flightNumber}`;
      const old = byKey.get(key);
      const oldPrice = old?.currentPrice != null && Number.isFinite(old.currentPrice) ? old.currentPrice : null;
      const newPrice = incoming.currentPrice;
      const drop = oldPrice != null && newPrice != null && oldPrice > newPrice
        ? Math.round((oldPrice - newPrice) * 100) / 100
        : null;
      const history = old?.history ?? [];
      if (newPrice != null) history.push({ price: newPrice, checkedAt });
      const next: WizzMonitorResult = {
        ...incoming,
        // A successful upstream response can contain a flight without a
        // per-flight price. Keep the last known price in that case; only a
        // real numeric observation is allowed to change price state.
        currentPrice: newPrice == null ? old?.currentPrice ?? null : newPrice,
        previousPrice: newPrice == null ? old?.previousPrice ?? null : oldPrice,
        lowestPrice: newPrice == null ? old?.lowestPrice ?? null : Math.min(...[old?.lowestPrice, newPrice].filter((p): p is number => typeof p === "number")),
        dropAmount: drop,
        dropPercent: drop != null && oldPrice ? Math.round((drop / oldPrice) * 10_000) / 100 : null,
        lastCheckedAt: newPrice == null ? old?.lastCheckedAt ?? checkedAt : checkedAt,
        history: history.slice(-MAX_HISTORY),
      };
      byKey.set(key, next);
      if (drop != null && drop > 0) {
        monitor.pendingAlerts ??= [];
        const eventId = `${key}|${checkedAt}|${newPrice}`;
        if (!monitor.pendingAlerts.some(alert => alert.eventId === eventId)) {
          const { history: _history, ...alert } = next;
          monitor.pendingAlerts.push({ ...alert, eventId });
        }
      }
    }
    monitor.results = [...byKey.values()].filter(r => r.departureDate >= isoToday()).slice(-2000);
    monitor.updatedAt = checkedAt;
    return flights.map(f => byKey.get(`${f.departureDate}|${f.flightNumber}`)!).filter(Boolean);
  });
}

async function checkWizzMonitorDate(
  monitor: WizzMonitor,
  date: string,
): Promise<boolean> {
  const response = await fetchWhileEnabled(
    assertWizzMonitoringAllowed,
    () => fetchGoogleFlightSchedules(
      monitor.fromAirport,
      monitor.toAirport,
      date,
      { directOnly: true },
    ),
    "Wizz monitor",
  );
  if (response.error) return false;

  const candidates = response.flights.filter(f =>
    isWizz(f.airline, f.flightNumber),
  );
  const fresh = [
    ...new Map(
      candidates.map(f => {
        const result: WizzMonitorResult = {
          departureDate: f.departureDate || date,
          flightNumber: f.flightNumber,
          airline: f.airline,
          departureTime: f.departureTime,
          arrivalTime: f.arrivalTime,
          currentPrice: response.flightPriceMap[f.flightNumber] ?? null,
          previousPrice: null,
          lowestPrice: null,
          dropAmount: null,
          dropPercent: null,
          lastCheckedAt: null,
          history: [],
        };
        return [`${result.departureDate}|${result.flightNumber}`, result] as const;
      }),
    ).values(),
  ];
  await saveResult(idOfMonitor(monitor), date, fresh, new Date().toISOString());
  return true;
}

function idOfMonitor(monitor: WizzMonitor): string {
  return monitor.id;
}

export async function runWizzPriceMonitor(
  id: string,
  options: {
    onlyDates?: string[];
    retryFailedAtEnd?: boolean;
  } = {},
): Promise<string[]> {
  if (reservedRuns.has(id)) return [];
  reservedRuns.add(id);
  const startedAt = new Date().toISOString();
  let attemptedDates: string[] = [];
  try {
    await assertWizzMonitoringAllowed();
    const monitor = await getWizzMonitor(id);
    if (!monitor || monitor.endDate < isoToday()) return [];
    const allDates = datesInRange(
      monitor.startDate < isoToday() ? isoToday() : monitor.startDate,
      monitor.endDate,
    );
    const allowedDates = new Set(allDates);
    const dates = options.onlyDates
      ? [...new Set(options.onlyDates)].filter(date => allowedDates.has(date))
      : allDates;
    attemptedDates = dates;
    runs.set(id, { running: true, total: dates.length, completed: 0, startedAt });
    await mutateStore(store => {
      const current = store.monitors.find(item => item.id === id);
      if (current) {
        current.lastRunAt = startedAt;
        current.lastError = null;
        current.updatedAt = startedAt;
      }
    });
    const failedDates: string[] = [];
    for (const date of dates) {
      await assertWizzMonitoringAllowed();
      if (!(await checkWizzMonitorDate(monitor, date))) failedDates.push(date);
      const run = runs.get(id);
      if (run) runs.set(id, { ...run, completed: run.completed + 1 });
    }
    let unresolvedDates = failedDates;
    if (
      options.retryFailedAtEnd !== false &&
      failedDates.length > 0
    ) {
      const run = runs.get(id);
      if (run) {
        runs.set(id, {
          ...run,
          total: run.total + failedDates.length,
        });
      }
      unresolvedDates = [];
      for (const date of failedDates) {
        await assertWizzMonitoringAllowed();
        if (!(await checkWizzMonitorDate(monitor, date))) {
          unresolvedDates.push(date);
        }
        const currentRun = runs.get(id);
        if (currentRun) {
          runs.set(id, {
            ...currentRun,
            completed: currentRun.completed + 1,
          });
        }
      }
    }
    await assertWizzMonitoringAllowed();
    const finished = new Date().toISOString();
    const current = await getWizzMonitor(id);
    const uniqueDrops = current?.pendingAlerts ?? [];
    if (uniqueDrops.length > 0) {
      if (current) {
        await db.insert(taskNotificationsTable).values({
          userId: current.createdBy, taskId: null, type: "wizz_price_drop",
          title: `Ulje çmimi Wizz Air — ${current.fromAirport} → ${current.toAirport}`,
          body: uniqueDrops.map(d => `${d.flightNumber} ${d.departureDate}: €${d.previousPrice} → €${d.currentPrice}`).join(" | "),
        });
        const recipient = process.env.NOTIFY_EMAIL;
        if (recipient) {
          const rows = uniqueDrops.map(d => `<tr><td>${esc(d.departureDate)}</td><td>${esc(d.flightNumber)}</td><td>€${d.previousPrice}</td><td style="color:#15803d;font-weight:bold">€${d.currentPrice}</td><td>−€${d.dropAmount?.toFixed(2)}</td></tr>`).join("");
          await sendEmail(recipient, `Ulje çmimi Wizz Air — ${current.fromAirport} → ${current.toAirport}`, `<h2>U gjet ulje çmimi në Google Flights</h2><p><strong>${esc(current.fromAirport)} → ${esc(current.toAirport)}</strong></p><table border="1" cellpadding="7" cellspacing="0"><tr><th>Data</th><th>Fluturimi</th><th>Para</th><th>Tani</th><th>Ulja</th></tr>${rows}</table>`).catch(err => logger.warn({ err }, "Wizz price-drop email failed"));
        }
      }
    }
    await mutateStore(store => {
      const m = store.monitors.find(item => item.id === id);
      if (!m) return;
      m.pendingAlerts = [];
      m.lastRunAt = startedAt;
      m.lastCompletedAt = unresolvedDates.length === 0 ? finished : m.lastCompletedAt;
      m.lastError = wizzMonitorErrorForDates(unresolvedDates);
      m.updatedAt = finished;
    });
    return unresolvedDates;
  } catch (err) {
    if (err instanceof WizzMonitoringPausedError) {
      logger.info({ monitorId: id }, "Wizz monitoring paused by administrator");
      return [];
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, monitorId: id }, "Wizz price monitor run failed");
    await mutateStore(store => {
      const m = store.monitors.find(item => item.id === id);
      if (m) { m.lastRunAt = startedAt; m.lastError = message.slice(0, 500); m.updatedAt = new Date().toISOString(); }
    });
    return attemptedDates;
  } finally {
    runs.delete(id);
    reservedRuns.delete(id);
  }
}

export function startWizzPriceMonitorScheduler(): void {
  let schedulerRunning = false;
  const tick = async () => {
    if (schedulerRunning) return;
    if (!(await isWizzMonitoringAllowed())) return;
    const today = isoToday();
    const nowMs = Date.now();
    const store = await readStore();
    const monitors = store.monitors.filter(m =>
      isWizzMonitorDue(m, nowMs, today, store.defaultRule?.intervalHours ?? 12),
    );
    if (monitors.length === 0) return;

    schedulerRunning = true;
    try {
      // Pasi përfundojnë të gjitha rrugët, provohet edhe një herë vetëm lista
      // e datave që dështuan në kalimin e parë.
      await runDueWizzMonitorCycle(monitors, runWizzPriceMonitor, isWizzMonitoringAllowed);
    } finally {
      schedulerRunning = false;
    }
  };
  setTimeout(() => { void tick(); setInterval(() => { void tick(); }, 30 * 60 * 1000); }, 90_000).unref();
}