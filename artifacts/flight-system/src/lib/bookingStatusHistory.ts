export type BookingStatusLog = {
  id: number;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  userName: string | null;
  createdAt: string;
};

export type NormalizedStatusEvent = BookingStatusLog & {
  statusKey: string | null;
  statusLabel: string;
};

const STATUS_VALUE_TO_KEY: Record<string, string> = {
  draft: "draft",
  "në pritje": "pending",
  pending: "pending",
  konfirmuar: "confirmed",
  confirmed: "confirmed",
  "bileta lëshuar": "ticketed",
  ticketed: "ticketed",
  anulluar: "cancelled",
  anuluar: "cancelled",
  cancelled: "cancelled",
};

const STATUS_KEY_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  confirmed: "Confirmed",
  ticketed: "Ticketed",
  cancelled: "Anuluar",
};

function normalizeStatusValue(value: string | null | undefined): { key: string | null; label: string } {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return { key: null, label: "Status fillestar i panjohur" };
  const key = STATUS_VALUE_TO_KEY[trimmed.toLocaleLowerCase("sq-AL")] ?? null;
  return { key, label: key ? STATUS_KEY_LABEL[key] : trimmed };
}

export function normalizeBookingStatusHistory(
  logs: BookingStatusLog[],
  bookingId: number,
  bookingCreatedAt?: string | null,
): NormalizedStatusEvent[] {
  const firstTransition = logs.find(log => log.action === "status_changed");
  const inferredCreationStatus = firstTransition?.oldValue ?? null;
  const statusEvents = logs
    .filter(log => log.action === "created" || log.action === "status_changed")
    .map(log => {
      const status = normalizeStatusValue(
        log.action === "created" ? (log.newValue || inferredCreationStatus) : log.newValue,
      );
      return { ...log, statusKey: status.key, statusLabel: status.label };
    });

  if (!statusEvents.some(event => event.action === "created") && bookingCreatedAt) {
    const status = normalizeStatusValue(inferredCreationStatus);
    statusEvents.unshift({
      id: -bookingId,
      action: "created",
      oldValue: null,
      newValue: inferredCreationStatus,
      note: null,
      userName: "Aktori i panjohur",
      createdAt: bookingCreatedAt,
      statusKey: status.key,
      statusLabel: status.label,
    });
  }
  return statusEvents;
}