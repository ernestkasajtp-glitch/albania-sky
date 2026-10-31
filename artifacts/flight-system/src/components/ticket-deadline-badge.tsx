import { useSyncExternalStore } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

// Limiti për lëshimin e biletës: 5 orë nga momenti i krijimit të rezervimit.
const DEADLINE_HOURS = 5;
const TICK_MS = 30_000;

// Orë e vetme e përbashkët (një interval për gjithë listën) që njofton të
// gjitha badge-t njëkohësisht — pa e rirenderuar tërë listën.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let clockNow = Date.now();

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    clockNow = Date.now();
    timer = setInterval(() => {
      clockNow = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
function getSnapshot() {
  return clockNow;
}
function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Afati aktiv nga krijimi (draft/pritje/konfirmuar) derisa bëhet 'ticketed'.
// Të anuluarat nuk kanë afat.
const ACTIVE_STATUSES = new Set(["draft", "pending", "confirmed"]);

export function TicketDeadlineBadge({
  createdAt,
  status,
  size = "sm",
}: {
  createdAt?: string | null;
  status?: string | null;
  size?: "sm" | "xs";
}) {
  // Guard pa hook: rreshtat jo-draft/pending nuk abonohen fare te ora.
  if (!createdAt || !status || !ACTIVE_STATUSES.has(status)) return null;

  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return null;

  return <ActiveDeadlineBadge created={created} size={size} />;
}

function ActiveDeadlineBadge({
  created,
  size,
}: {
  created: number;
  size: "sm" | "xs";
}) {
  const nowMs = useNow();

  const deadline = created + DEADLINE_HOURS * 3_600_000;
  const remaining = deadline - nowMs;
  const expired = remaining <= 0;

  const totalMin = Math.floor(Math.abs(remaining) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  let label: string;
  if (expired) label = "SKADUAR";
  else if (totalMin < 1) label = "<1m";
  else if (h > 0) label = `${h}h ${m}m`;
  else label = `${m}m`;

  let tier: string;
  if (expired) {
    tier = "bg-red-600 text-white ring-1 ring-inset ring-red-700 animate-pulse";
  } else if (remaining < 30 * 60_000) {
    tier = "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 animate-pulse";
  } else if (remaining < 60 * 60_000) {
    tier = "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  } else {
    tier = "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200";
  }

  const sizeCls =
    size === "xs"
      ? "text-[10px] px-1.5 py-0.5 gap-0.5"
      : "text-[11px] px-2 py-0.5 gap-1";
  const iconCls = size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3";

  const title = expired
    ? `Afati për lëshimin e biletës skadoi më ${format(new Date(deadline), "dd MMM h:mm a")} (limit 5 orë nga krijimi)`
    : `Afati për lëshimin e biletës: ${format(new Date(deadline), "dd MMM h:mm a")} — limit 5 orë nga krijimi`;

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md font-bold leading-none whitespace-nowrap ${sizeCls} ${tier}`}
    >
      {expired ? <AlertTriangle className={iconCls} /> : <Clock className={iconCls} />}
      {label}
    </span>
  );
}
