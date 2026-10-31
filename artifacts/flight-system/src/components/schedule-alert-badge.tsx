import { Siren } from "lucide-react";

/**
 * Alarmi i kuq "Njoftim ndryshimi fluturimi" — shfaqet te rezervimet ku ka
 * ardhur email "Important changes to your flight" me PNR-në e rezervimit.
 * Burimi: booking.emailAlertsCount (nga GET /bookings).
 */
export function ScheduleAlertBadge({ booking, size = "sm" }: { booking: any; size?: "xs" | "sm" }) {
  const n = Number(booking?.emailAlertsCount ?? 0);
  if (!n) return null;
  const cls = size === "xs" ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]";
  const icon = size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-red-600 text-white font-bold leading-none animate-pulse shrink-0 ${cls}`}
      title={n > 1 ? `${n} njoftime ndryshimi fluturimi nga emaili` : "Njoftim ndryshimi fluturimi nga emaili"}
    >
      <Siren className={icon} />
      {n > 1 ? n : null}
    </span>
  );
}
