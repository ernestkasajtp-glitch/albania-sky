import { tiraneMinute } from "./discountCampaignMath";

export const ACTIVITY_REPORT_PREFIX = "agent_activity_daily:";
export const ACTIVITY_REPORT_CURSOR = "agent_activity_daily_next_day";
export const ACTIVITY_REPORT_STALE_MS = 60 * 60 * 1000;

export function nextActivityDay(day: string, offset = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(`${day}T12:00:00Z`)) ||
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day)
    throw new Error("Datë e pavlefshme e raportit të aktivitetit");
  return new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}

export function latestDueActivityDay(now: Date) {
  const local = tiraneMinute(now);
  // At 00:00 the previous day's scheduled run is not due yet.
  return nextActivityDay(local.slice(0, 10), local.slice(11, 16) < "00:01" ? -2 : -1);
}

export type ActivityReportMarker = { key: string; value: string | null; updatedAt: Date };
export interface ActivityRecoveryStore {
  markers(): Promise<ActivityReportMarker[]>;
  initializeCursor(day: string): Promise<string>;
  advanceCursor(day: string): Promise<void>;
  sendDay(day: string): Promise<void>;
  alert(day: string, state: string): Promise<void>;
}

/** Bounded sequential recovery. Existing claims, including uncertain sends, are never retried. */
export async function recoverActivityReports(store: ActivityRecoveryStore, now = new Date()) {
  const due = latestDueActivityDay(now);
  const markers = await store.markers();
  const days = markers.map(marker => {
    const day = marker.key.slice(ACTIVITY_REPORT_PREFIX.length);
    nextActivityDay(day); // Fail explicitly on corrupt persisted keys.
    return day;
  });
  for (const [index, marker] of markers.entries()) {
    if ((marker.value === "preparing" || marker.value === "sending") &&
      now.getTime() - marker.updatedAt.getTime() >= ACTIVITY_REPORT_STALE_MS) {
      await store.alert(days[index], marker.value);
    }
  }
  // Upgrade starts at the oldest known run; a fresh installation starts with
  // the latest due day, not the entire historical activity table.
  let day = await store.initializeCursor([due, ...days].sort()[0]);
  nextActivityDay(day);
  const existing = new Set(days);
  for (let count = 0; day <= due && count < 7; count++) {
    if (!existing.has(day)) await store.sendDay(day);
    day = nextActivityDay(day);
    await store.advanceCursor(day);
  }
}
