import { useEffect, useSyncExternalStore } from "react";
import { useModules } from "@/context/ModulesContext";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
const POLL_MS = 60_000;

export interface ClosingFlight {
  id: number;
  airline: string;
  flightNumber: string | null;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  closeAt: string;
  minutesLeft: number;
}

export interface AlertFlight {
  id: number;
  airline: string;
  flightNumber: string | null;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  arrivalTime?: string | null;
  status: string;
  totalSeats?: number;
  soldSeats?: number;
  availableSeats?: number;
  scheduleAlert: string | null;
  scheduleAlertDetail: string | null;
  scheduleCheckedAt?: string | null;
  seatAlert: string | null;
  seatAlertDetail?: string | null;
  seatMissCount?: number | null;
  seatGooglePrice?: number | null;
  seatCheckedAt?: string | null;
}

export interface SeatAlertFlight {
  id: number;
  airline: string;
  flightNumber: string | null;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  seatAlertDetail: string | null;
  seatMissCount: number | null;
  seatCheckedAt: string | null;
}

export interface SoldOutItem {
  historyId: number;
  flightId: number;
  source: string | null;
  note: string | null;
  userName: string | null;
  at: string;
  airline: string;
  flightNumber: string | null;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  totalSeats: number;
  soldSeats: number;
}

export interface ScheduleChange {
  id: number;
  flightId: number;
  flight: {
    id: number;
    airline: string;
    flightNumber: string | null;
    fromCity: string;
    toCity: string;
    departureDate: string;
    departureTime: string;
  };
  oldDepartureDate: string;
  oldDepartureTime: string;
  newDepartureDate: string;
  newDepartureTime: string;
  status: string;
  createdAt: string;
}

export interface SystemNotification {
  id: number;
  taskId: number | null;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

interface StoreSnapshot {
  sessionKey: string | null;
  closing: ClosingFlight[];
  alertFlights: AlertFlight[];
  seatAlerts: SeatAlertFlight[];
  soldOut: SoldOutItem[];
  scheduleChanges: ScheduleChange[];
  systemNotifications: SystemNotification[];
  loading: boolean;
  refreshedAt: Date | null;
}

interface AuthScope {
  id: number;
  role: string;
  alertsEnabled?: boolean;
  tasksEnabled?: boolean;
  scheduleEnabled?: boolean;
}

const emptySnapshot = (sessionKey: string | null = null): StoreSnapshot => ({
  sessionKey,
  closing: [],
  alertFlights: [],
  seatAlerts: [],
  soldOut: [],
  scheduleChanges: [],
  systemNotifications: [],
  loading: sessionKey !== null,
  refreshedAt: null,
});

let snapshot = emptySnapshot();
const listeners = new Set<() => void>();
let subscribers = 0;
let interval: ReturnType<typeof setInterval> | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let requestGeneration = 0;
let inFlight: Promise<void> | null = null;
let activeRole = "";
let activeAlerts = false;
let activeTasks = false;
let activeSchedule = true;

function emit(next: StoreSnapshot) {
  snapshot = next;
  listeners.forEach(listener => listener());
}

function getSnapshot() {
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function refresh(): Promise<void> {
  if (!snapshot.sessionKey) return Promise.resolve();
  if (inFlight) return inFlight;

  const generation = requestGeneration;
  const role = activeRole;
  emit({ ...snapshot, loading: true });

  const jobs = [
    activeAlerts ? getJson<ClosingFlight[]>(`${API_BASE}/flights/closing-soon`) : Promise.resolve(null),
    activeAlerts ? getJson<{ data: AlertFlight[] }>(
      `${API_BASE}/flights?anyAlert=true&timeframe=future&limit=200&sortKey=date&sortDir=asc`,
    ) : Promise.resolve(null),
    activeAlerts ? getJson<SeatAlertFlight[]>(`${API_BASE}/flights/seat-alerts`) : Promise.resolve(null),
    activeAlerts ? getJson<SoldOutItem[]>(`${API_BASE}/flights/soldout-recent`) : Promise.resolve(null),
    activeSchedule && ["admin", "manager"].includes(role)
      ? getJson<ScheduleChange[]>(`${API_BASE}/schedule-changes`)
      : Promise.resolve(null),
    activeTasks ? getJson<SystemNotification[]>(`${API_BASE}/tasks-notifications`) : Promise.resolve(null),
  ] as const;

  inFlight = Promise.all(jobs).then(([closing, alerts, seatAlerts, soldOut, scheduleChanges, systemNotifications]) => {
    if (generation !== requestGeneration) return;
    emit({
      ...snapshot,
      closing: Array.isArray(closing) ? closing : snapshot.closing,
      alertFlights: alerts && Array.isArray(alerts.data) ? alerts.data : snapshot.alertFlights,
      seatAlerts: Array.isArray(seatAlerts) ? seatAlerts : snapshot.seatAlerts,
      soldOut: Array.isArray(soldOut) ? soldOut : snapshot.soldOut,
      scheduleChanges: Array.isArray(scheduleChanges) ? scheduleChanges : snapshot.scheduleChanges,
      systemNotifications: Array.isArray(systemNotifications) ? systemNotifications : snapshot.systemNotifications,
      loading: false,
      refreshedAt: new Date(),
    });
  }).finally(() => {
    if (generation === requestGeneration) inFlight = null;
  });

  return inFlight;
}

function stop() {
  if (interval) clearInterval(interval);
  interval = null;
  requestGeneration += 1;
  inFlight = null;
}

function reset(sessionKey: string | null, scope: AuthScope | null = null) {
  stop();
  activeRole = scope?.role ?? "";
  activeAlerts = scope?.alertsEnabled ?? false;
  activeTasks = scope?.tasksEnabled ?? false;
  activeSchedule = scope?.scheduleEnabled ?? false;
  emit(emptySnapshot(sessionKey));
}

function acquire(scope: AuthScope | null) {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }

  const sessionKey = scope ? `${scope.id}:${scope.role}:${!!scope.alertsEnabled}:${!!scope.tasksEnabled}:${!!scope.scheduleEnabled}` : null;
  if (!sessionKey) {
    subscribers = 0;
    reset(null);
    return () => {};
  }

  if (snapshot.sessionKey !== sessionKey) {
    subscribers = 0;
    reset(sessionKey, scope);
  }

  subscribers += 1;
  if (!interval) {
    void refresh();
    interval = setInterval(() => { void refresh(); }, POLL_MS);
  }

  return () => {
    if (snapshot.sessionKey !== sessionKey) return;
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) {
      // Avoid a duplicate initial request during React StrictMode's effect probe.
      stopTimer = setTimeout(() => {
        stopTimer = null;
        if (subscribers === 0 && snapshot.sessionKey === sessionKey) stop();
      }, 0);
    }
  };
}

export function useFmsNotifications(user: AuthScope | null) {
  const { isPathEnabled } = useModules();
  const scope = user ? {
    ...user,
    alertsEnabled: isPathEnabled("/notifications"),
    tasksEnabled: isPathEnabled("/tasks"),
    scheduleEnabled: isPathEnabled("/schedule-changes"),
  } : null;
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const sessionKey = scope ? `${scope.id}:${scope.role}:${!!scope.alertsEnabled}:${!!scope.tasksEnabled}:${!!scope.scheduleEnabled}` : null;

  useEffect(() => acquire(scope), [scope?.id, scope?.role, scope?.alertsEnabled, scope?.tasksEnabled, scope?.scheduleEnabled]);

  if (current.sessionKey !== sessionKey) {
    return { ...emptySnapshot(sessionKey), refresh };
  }
  return { ...current, refresh };
}