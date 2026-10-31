import { format, parseISO } from "date-fns";
import { Plane, UserX } from "lucide-react";
import type { ClaimBooking, ClaimRecordStatus } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export const CLAIM_STATUS_META: Record<ClaimRecordStatus, { label: string; cls: string; dot: string }> = {
  open: { label: "Hapur", cls: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  in_progress: { label: "Në proces", cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  resolved: { label: "Zgjidhur", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

export function ClaimStatusBadge({ status }: { status: ClaimRecordStatus }) {
  const m = CLAIM_STATUS_META[status] ?? CLAIM_STATUS_META.open;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", m.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function errorMessage(e: unknown): string {
  const anyE = e as any;
  const d = anyE?.data;
  if (d && typeof d === "object" && typeof d.error === "string") return d.error;
  return anyE?.message || "Ndodhi një gabim i panjohur.";
}

export function errorStatus(e: unknown): number | null {
  const s = (e as any)?.status;
  return typeof s === "number" ? s : null;
}

function fmtDate(d: string | null) {
  if (!d) return "Pa datë";
  const dt = parseISO(d);
  return isNaN(dt.getTime()) ? d : format(dt, "dd MMM yyyy");
}

export function ClaimBookingRow({ b, highlight }: { b: ClaimBooking; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-white px-3 py-2", highlight && "border-indigo-300 bg-indigo-50/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-mono font-bold text-slate-900">{b.bookingRef}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
          <Plane className="h-3 w-3 text-slate-400" />
          {b.fromCity ?? "?"} <span className="text-slate-400">→</span> {b.toCity ?? "?"}
        </span>
        <span className="text-slate-500 tabular-nums">{fmtDate(b.departureDate)}</span>
        {b.flightNumber && <span className="font-mono text-slate-400">{b.flightNumber}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {b.passengers.length === 0 && <span className="text-[11px] italic text-slate-400">Pa pasagjerë</span>}
        {b.passengers.map(p => (
          <span key={p.id} className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
            p.cancelled ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-700",
          )}>
            {p.cancelled && <UserX className="h-3 w-3" />}
            <span className={cn("font-medium", p.cancelled && "line-through decoration-red-300")}>{p.firstName} {p.lastName}</span>
            {p.cancelled && <span className="rounded bg-red-600 px-1 text-[9px] font-bold uppercase text-white">Anuluar</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
