import { Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

// Source components/ticket-deadline-badge.tsx. Only useNow's shared interval
// is replaced by a frozen illustrative timestamp consistent with the header.
const NOW = new Date("2026-05-19T12:35:00").getTime();
const ACTIVE_STATUSES = new Set(["draft", "pending", "confirmed"]);
export function TicketDeadlineBadge({ createdAt, status, size = "sm" }: {
  createdAt: string; status: string; size?: "sm" | "xs";
}) {
  if (!createdAt || !ACTIVE_STATUSES.has(status)) return null;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return null;
  const deadline = created + 5 * 3_600_000;
  const remaining = deadline - NOW;
  const expired = remaining <= 0;
  const totalMin = Math.floor(Math.abs(remaining) / 60_000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  const label = expired ? "SKADUAR" : totalMin < 1 ? "<1m" : h > 0 ? `${h}h ${m}m` : `${m}m`;
  const tier = expired ? "bg-red-600 text-white ring-1 ring-inset ring-red-700 animate-pulse"
    : remaining < 30 * 60_000 ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 animate-pulse"
    : remaining < 60 * 60_000 ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
    : "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200";
  const sizeCls = size === "xs" ? "text-[10px] px-1.5 py-0.5 gap-0.5" : "text-[11px] px-2 py-0.5 gap-1";
  const iconCls = size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3";
  const title = expired
    ? `Afati për lëshimin e biletës skadoi më ${format(new Date(deadline), "dd MMM h:mm a")} (limit 5 orë nga krijimi)`
    : `Afati për lëshimin e biletës: ${format(new Date(deadline), "dd MMM h:mm a")} — limit 5 orë nga krijimi`;
  return <span title={title} className={`inline-flex items-center rounded-md font-bold leading-none whitespace-nowrap ${sizeCls} ${tier}`}>
    {expired ? <AlertTriangle className={iconCls} /> : <Clock className={iconCls} />}{label}
  </span>;
}
