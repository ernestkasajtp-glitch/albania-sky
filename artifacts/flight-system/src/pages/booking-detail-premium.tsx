import { useGetBooking } from "@workspace/api-client-react";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { fmtFlightNum, fmtM, fmtAmPm, cn, dueEuro } from "@/lib/utils";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { normalizeBookingStatusHistory, type BookingStatusLog } from "@/lib/bookingStatusHistory";
import "./booking-detail-premium.css";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
type ChangeLogEntry = BookingStatusLog;

type AgentEmailOutcome = {
  outcome: "sent" | "failed" | "skipped";
  reason: string;
  email: string | null;
};

function parseAgentEmailOutcome(log: ChangeLogEntry): ({ statusEventId: number } & AgentEmailOutcome) | null {
  if (log.action !== "status_email" || !log.note) return null;
  try {
    const value = JSON.parse(log.note);
    if (
      value?.recipient !== "agent" ||
      !Number.isInteger(value?.statusEventId) ||
      !["sent", "failed", "skipped"].includes(value?.outcome)
    ) return null;
    return {
      statusEventId: value.statusEventId,
      outcome: value.outcome,
      reason: String(value.reason || ""),
      email: typeof value.email === "string" ? value.email : null,
    };
  } catch {
    return null;
  }
}
import {
  CheckCircle2, Circle, PlaneTakeoff, Clock, User, Phone, Mail, Building,
  ArrowRight, ArrowLeft, Hash, Ticket, Receipt, X,
} from "lucide-react";

const STEPS = [
  { key: "draft",     label: "Draft"     },
  { key: "pending",   label: "Pending"   },
  { key: "confirmed", label: "Confirmed" },
  { key: "ticketed",  label: "Ticketed"  },
] as const;

function stepState(currentStatus: string, stepKey: string): "done" | "current" | "upcoming" {
  const order = ["draft", "pending", "confirmed", "ticketed"];
  const cur = order.indexOf(currentStatus);
  const s = order.indexOf(stepKey);
  if (cur === -1) return "upcoming";
  if (s < cur) return "done";
  if (s === cur) return "current";
  return "upcoming";
}

export default function BookingDetailPremium({ bookingId, inDialog = false, onClose }: { bookingId: number; inDialog?: boolean; onClose?: () => void }) {
  const [, setLocation] = useLocation();
  const { user } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const { data: booking, isLoading } = useGetBooking(bookingId, { query: { enabled: !!bookingId } as any } as any);
  const { data: changeLogs = [] } = useQuery<ChangeLogEntry[]>({
    queryKey: [`/api/bookings/${bookingId}/change-log`],
    enabled: !!bookingId,
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/bookings/${bookingId}/change-log`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Nuk u mor dot historiku i statusit");
      return response.json();
    },
  });

  if (isLoading || !booking) {
    return (
      <div className="-mx-4 -my-4 md:-mx-6 md:-my-6 min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Duke ngarkuar...</div>
      </div>
    );
  }

  const b: any = booking;
  const cancelled = b.status === "cancelled";
  const totalAmount = Number(b.totalAmount ?? 0);
  // Use canonical backend totals (same source as classic BookingDetailContent)
  const paid = Number(b.paidAmount ?? 0);
  const remaining = dueEuro(b.dueAmount ?? Math.max(0, totalAmount - paid));
  const progressPct = totalAmount > 0 ? Math.min(100, Math.round((paid / totalAmount) * 100)) : 0;

  const flight = b.flight ?? {};
  const agent = b.agent ?? null;
  const emailOutcomes = new Map<number, AgentEmailOutcome>();
  for (const log of changeLogs) {
    const parsed = parseAgentEmailOutcome(log);
    if (parsed) emailOutcomes.set(parsed.statusEventId, parsed);
  }
  const statusTransitions = normalizeBookingStatusHistory(
    changeLogs,
    bookingId,
    b.createdAt ? String(b.createdAt) : null,
  ).map(transition => ({ ...transition, email: emailOutcomes.get(transition.id) ?? null }));

  // Try to extract a PNR — prefer booking.pnr, fall back to first passenger's PNR
  const pnr: string = b.pnr ?? (b.passengers ?? []).find((p: any) => p.pnr)?.pnr ?? "—";

  return (
    <div className={cn(
      "booking-premium-responsive bg-slate-50 font-sans antialiased text-slate-700 text-[13px]",
      inDialog ? "min-h-0" : "-mx-3 -my-5 md:-mx-4 md:-my-6 min-h-[calc(100vh-3.5rem)]"
    )}>
      {/* Premium top status rail */}
      <header className={cn("border-b border-slate-200 bg-[#eef3fa] dark:bg-card sticky top-0 z-20")}>
        <div className="px-3 md:px-4 py-1.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            {!inDialog && (
              <>
                <button
                  type="button"
                  onClick={() => setLocation("/bookings")}
                  className="h-8 px-2.5 rounded-lg text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 text-sm font-medium flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Mbrapa
                </button>
                <div className="h-5 w-px bg-slate-300" />
              </>
            )}

            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono text-slate-500 text-xs uppercase tracking-wider">REF</span>
              <span className="font-mono text-slate-900 text-base tracking-tight font-semibold">
                {b.bookingRef ?? b.reference ?? `#${bookingId}`}
              </span>
            </div>

            <div className="h-4 w-px bg-slate-300" />

            <div className="flex items-center gap-2">
              <Ticket className="w-3.5 h-3.5 text-amber-700" />
              <span className="font-mono text-slate-500 text-xs uppercase tracking-wider">PNR</span>
              <span className="font-mono text-amber-800 text-base tracking-tight font-semibold bg-amber-100 px-2 py-0.5 rounded">
                {pnr}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Stepper */}
            <div className="flex items-center">
            {cancelled ? (
              <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold uppercase tracking-wider">
                Anuluar
              </span>
            ) : (
              STEPS.map((step, idx) => {
                const s = stepState(b.status, step.key);
                return (
                  <div key={step.key} className="flex items-center">
                    <div
                      className={cn(
                        "flex items-center gap-1.5",
                        s === "current" && "text-blue-700",
                        s === "done" && "text-emerald-600",
                        s === "upcoming" && "text-slate-400"
                      )}
                    >
                      {s === "done" ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : s === "current" ? (
                        <Circle className="w-4 h-4 fill-current opacity-30" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                      <span className="text-[11px] uppercase tracking-wider font-semibold hidden sm:inline">
                        {step.label}
                      </span>
                    </div>
                    {idx < STEPS.length - 1 && <div className="w-6 h-px bg-slate-300 mx-2" />}
                  </div>
                );
              })
            )}
            </div>
            {inDialog && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Mbyll"
                className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

      {/* Rreshti i statusit: vizë me ndalesa sipas gjendjes — brenda header-it sticky që të rrijë fiks në krye */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        {cancelled ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 rounded-full bg-rose-200" />
            <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold uppercase tracking-wider shrink-0">Anuluar</span>
            <div className="flex-1 h-1 rounded-full bg-rose-200" />
          </div>
        ) : (
          <div className="flex items-center">
            {STEPS.map((step, idx) => {
              const s = stepState(b.status, step.key);
              return (
                <div key={step.key} className={cn("flex items-center", idx < STEPS.length - 1 && "flex-1")}>
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center border-2",
                        s === "done" && "bg-emerald-500 border-emerald-500 text-white",
                        s === "current" && "bg-blue-600 border-blue-600 text-white ring-4 ring-blue-100",
                        s === "upcoming" && "bg-white border-slate-300 text-slate-300"
                      )}
                    >
                      {s === "done" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-2 h-2 fill-current" />}
                    </div>
                    <span
                      className={cn(
                        "mt-1 text-[10px] uppercase tracking-wider font-bold",
                        s === "done" && "text-emerald-600",
                        s === "current" && "text-blue-700",
                        s === "upcoming" && "text-slate-400"
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={cn("flex-1 h-1 rounded-full mx-2 -mt-4", s === "done" ? "bg-emerald-400" : "bg-slate-200")} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </header>

      {/* Body: 3-col layout */}
      <div className="booking-premium-body grid gap-0">
        {/* Left sidebar: meta */}
        <aside className="booking-premium-summary bg-[#f8fafc] dark:bg-muted border-r border-slate-200 p-2.5 flex flex-col gap-3">
          <section>
            <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Klienti</h3>
            <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-slate-900">
                <User className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-semibold truncate">{b.customerName || "—"}</span>
              </div>
              {agent && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Building className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate">{agent.company || agent.name}</span>
                </div>
              )}
              {isAdmin && b.customerPhone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="font-mono text-xs truncate">{b.customerPhone}</span>
                </div>
              )}
              {isAdmin && b.customerEmail && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-xs truncate">{b.customerEmail}</span>
                </div>
              )}
            </div>
          </section>

          {flight && (
            <section>
              <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Fluturimi</h3>
              <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm shadow-sm">
                <div className="flex items-center gap-2 text-slate-900 mb-2">
                  <PlaneTakeoff className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold truncate">
                    {flight.airline} {flight.flightNumber ? fmtFlightNum(flight.flightNumber) : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span>{flight.fromAirport}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <span>{flight.toAirport}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {flight.fromCity} → {flight.toCity}
                </div>
                {flight.departureDate && (
                  <div className="flex items-center gap-2 mt-2 text-slate-600 font-mono text-[11px] bg-[#eef3fa] dark:bg-muted p-2 rounded">
                    <Clock className="w-3 h-3" />
                    <span>{format(new Date(flight.departureDate), "dd MMM yyyy")}</span>
                    {flight.departureTime && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span>{fmtAmPm(String(flight.departureTime))}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Çmimet</h3>
            {/* Slot: BookingDetailContent porton k\u00ebtu kart\u00ebn 'PNR / Shuma / Neto / Komisioni' me edit + sugjerime */}
            <div id="booking-price-card-slot" />
          </section>

        </aside>

        {/* Middle column: existing full BookingDetailContent (all functions intact) */}
        <main className="booking-premium-main bg-white min-w-0 px-3 md:px-4 py-1">
          <BookingDetailContent bookingId={bookingId} onClose={onClose} />
        </main>

        {/* Right rail: money mini-dash */}
        <aside className="booking-premium-payments bg-[#f8fafc] dark:bg-muted border-l border-slate-200 p-2.5 flex flex-col gap-3 min-w-0">
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3 flex items-center gap-2">
              <Receipt className="w-3.5 h-3.5" /> Pagesat
            </h3>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-emerald-600 border border-emerald-700 rounded-lg p-2.5 shadow-sm">
                <div className="text-[10px] text-white uppercase font-bold mb-1">Paguar</div>
                <div className="font-mono text-white text-lg font-bold tabular-nums">€{fmtM(paid)}</div>
              </div>
              <div
                className={cn(
                  "rounded-lg p-2.5 shadow-sm",
                  remaining > 0
                    ? "bg-red-600 border border-red-700"
                    : "bg-emerald-600 border border-emerald-700"
                )}
              >
                <div className="text-[10px] uppercase font-bold mb-1 text-white">
                  Detyrim
                </div>
                <div className="font-mono text-lg font-bold tabular-nums text-white">
                  €{fmtM(remaining)}
                </div>
              </div>
            </div>

            <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1.5 overflow-hidden">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  progressPct >= 100 ? "bg-emerald-500" : "bg-blue-500"
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-3">
              <span>{progressPct}%</span>
              <span>Total: €{fmtM(totalAmount)}</span>
            </div>

            {/* Slot: BookingDetailContent porton k\u00ebtu Historia e Pagesave + butonin Shto Pages\u00eb */}
            <div id="booking-payments-slot" />
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">
              Statusi i Rezervimit
            </h4>
            <div className="space-y-3">
              {statusTransitions.length === 0 ? (
                <div className="text-xs text-slate-500">
                  Nuk ka kalime statusi të regjistruara.
                </div>
              ) : statusTransitions.map((transition, index) => {
                const isCurrent = index === statusTransitions.length - 1;
                const isCancelled = transition.statusKey === "cancelled";
                const email = transition.email;
                return (
                  <div key={transition.id} className="relative pl-6 pb-1">
                    {index < statusTransitions.length - 1 && (
                      <div className="absolute left-[7px] top-4 bottom-[-12px] w-px bg-slate-200" />
                    )}
                    <Circle className={cn(
                      "absolute left-0 top-0.5 w-4 h-4 shrink-0",
                      isCancelled ? "fill-rose-500 text-rose-500" : isCurrent ? "fill-blue-500 text-blue-500" : "fill-emerald-500 text-emerald-500",
                    )} />
                    <div className={cn("text-sm font-semibold", isCancelled ? "text-rose-700" : isCurrent ? "text-blue-700" : "text-slate-700")}>
                      {transition.statusLabel}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      <span className="font-mono">{format(new Date(transition.createdAt), "dd.MM.yyyy h:mm a")}</span>
                      <span className="italic"> · {transition.userName || "System"}</span>
                    </div>
                    <div className={cn(
                      "text-[10px] mt-1 leading-snug",
                      email?.outcome === "sent" && "text-emerald-700",
                      email?.outcome === "failed" && "text-rose-700",
                      email?.outcome === "skipped" && "text-amber-700",
                      !email && "text-slate-400",
                    )}>
                      {!email ? (
                        transition.statusKey === "ticketed" && transition.note?.includes("pa i dërguar email")
                          ? "Biletat u lëshuan pa u dërguar me email"
                          : "Pa të dhëna për emailin"
                      ) : email.outcome === "sent" ? (
                        <>Emaili u dërgua{email.email ? ` te ${email.email}` : ""}</>
                      ) : email.outcome === "failed" ? (
                        <>Emaili dështoi · {email.reason}</>
                      ) : (
                        <>Emaili u anashkalua · {email.reason}</>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Detaje</h4>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Pasagjerë</span>
                <span className="font-semibold text-slate-900">{(b.passengers ?? []).length}</span>
              </div>
              {b.createdAt && (
                <div className="flex justify-between">
                  <span>Krijuar</span>
                  <span className="font-mono text-slate-700">
                    {format(new Date(b.createdAt), "dd.MM.yyyy")}
                  </span>
                </div>
              )}
              {b.updatedAt && (
                <div className="flex justify-between">
                  <span>Përditësuar</span>
                  <span className="font-mono text-slate-700">
                    {format(new Date(b.updatedAt), "dd.MM.yyyy")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
