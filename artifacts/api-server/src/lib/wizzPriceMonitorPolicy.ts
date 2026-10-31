export const WIZZ_MONITOR_INTERVAL_MS = 12 * 60 * 60 * 1000;

export interface WizzMonitorScheduleItem {
  id: string;
  enabled: boolean;
  endDate: string;
  lastRunAt: string | null;
}

export function isWizzMonitorDue(
  monitor: WizzMonitorScheduleItem,
  nowMs: number,
  today: string,
  intervalHours = 12,
): boolean {
  if (!monitor.enabled || monitor.endDate < today) return false;
  if (!monitor.lastRunAt) return true;
  const lastRunMs = new Date(monitor.lastRunAt).getTime();
  return !Number.isFinite(lastRunMs) || nowMs - lastRunMs >= intervalHours * 60 * 60 * 1000;
}

export function wizzMonitorErrorForDates(dates: string[]): string | null {
  return dates.length > 0
    ? `Google nuk u përgjigj pas 2 provave për ${dates.length} datë(a): ${dates.join(", ")}`
    : null;
}

export async function runDueWizzMonitorCycle<T extends { id: string }>(
  monitors: T[],
  run: (
    monitorId: string,
    options: { onlyDates?: string[]; retryFailedAtEnd: false },
  ) => Promise<string[]>,
  isEnabled: () => Promise<boolean> = async () => true,
): Promise<Map<string, string[]>> {
  const failedByMonitor = new Map<string, string[]>();

  for (const monitor of monitors) {
    if (!(await isEnabled())) return new Map();
    const failed = await run(monitor.id, { retryFailedAtEnd: false });
    if (failed.length > 0) failedByMonitor.set(monitor.id, failed);
  }

  const unresolvedByMonitor = new Map<string, string[]>();
  for (const [monitorId, failedDates] of failedByMonitor) {
    if (!(await isEnabled())) return unresolvedByMonitor;
    const unresolved = await run(monitorId, {
      onlyDates: failedDates,
      retryFailedAtEnd: false,
    });
    if (unresolved.length > 0) unresolvedByMonitor.set(monitorId, unresolved);
  }

  return unresolvedByMonitor;
}