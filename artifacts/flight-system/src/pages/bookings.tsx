import { useState, useMemo, useEffect } from "react";
import { useSearch } from "wouter";
import { fmtM, fmtAmPm, bookingPnrList, dueEuro } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { useListBookings, useListAgents } from "@workspace/api-client-react";
import { agencyColorMap } from "@/lib/agencyDisplayColor";
import { useQuery } from "@tanstack/react-query";
import { useInternalPageLayout } from "@/hooks/usePageLayout";
import { PageLayoutGate } from "@/components/PageLayoutGate";
import BookingsListPremium from "./bookings-premium";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";
import { bookingMatchesSearch } from "@/lib/bookingSearch";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { DatePicker } from "@/components/ui/date-picker";
import { Plus, Search, X, Filter, MessageSquare, Baby, Luggage, Backpack, ChevronLeft, ChevronRight, CheckSquare, Mail } from "lucide-react";
import { useEntityTaskCounts } from "@/lib/taskCounts";
import { AgentRankBadge } from "@/components/AgentRankBadge";
import { TicketDeadlineBadge } from "@/components/ticket-deadline-badge";
import { TicketEmailPendingBadge, TicketFoundBadge } from "@/components/ticket-found-badge";
import { ScheduleAlertBadge } from "@/components/schedule-alert-badge";
import { BookingNotesBadge } from "@/components/BookingComments";

const PER_PAGE = 50;
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500 hover:bg-gray-600",
  pending: "bg-yellow-500 hover:bg-yellow-600",
  confirmed: "bg-blue-500 hover:bg-blue-600",
  ticketed: "bg-[#00b050] hover:bg-[#009a45]",
  cancelled: "bg-red-500 hover:bg-red-600",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Pritje",
  confirmed: "Konfirmuar",
  ticketed: "Ticketed",
  cancelled: "Anuluar",
};

export default function BookingsList() {
  const layout = useInternalPageLayout("bookings_list");
  return <PageLayoutGate state={layout} render={v => v === "premium" ? <BookingsListPremium /> : <BookingsListClassic />} />;
}

function BookingsListClassic() {
  const { hasPermission } = useAdminAuth();
  const showCommissionCol = hasPermission("can_view_commission_in_bookings_list");
  const qs = useSearch();
  const initialStatus = (() => {
    try { return new URLSearchParams(qs).get("status") ?? ""; } catch { return ""; }
  })();
  const [search, setSearch] = useState("");
  const [pnrSearch, setPnrSearch] = useState("");
  const [flightSearch, setFlightSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [agentFilter, setAgentFilter] = useState("");
  // Filtri i njoftimeve të ndryshimit të fluturimit: "" | "with" | "without"
  const [alertFilter, setAlertFilter] = useState("");
  const [unsentTicketFilter, setUnsentTicketFilter] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // ── Ngarkim i shpejtë: fillimisht VETËM rezervimet e sotme; të gjitha
  // ngarkohen kur përdoruesi kërkon/filtron ose klikon "Shfaq të gjitha". ──
  const [showAll, setShowAll] = useState(false);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const anyFilterActive = !!(search || pnrSearch || flightSearch || dateFrom || dateTo || statusFilter || agentFilter || alertFilter || unsentTicketFilter);
  const loadAll = showAll || anyFilterActive;
  const { data: allBookings = [], isLoading, isFetching } = useListBookings(
    (loadAll ? {} : { createdFrom: todayStr }) as any,
    { query: { placeholderData: (prev: any) => prev } as any },
  );
  const { data: agents = [] } = useListAgents({});
  const agencyColors = useMemo(() => agencyColorMap(agents), [agents]);
  const { data: taskCounts = {} } = useEntityTaskCounts("booking");

  // "Data të Aferta" threshold (settings) — bookings whose flight departs within
  // this many days from today are tinted faint red across the whole row.
  const { data: upcomingDaysData } = useQuery<{ days: number }>({
    queryKey: ["upcoming-days"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/settings/upcoming-days`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });
  const soonDays = upcomingDaysData?.days ?? 7;
  const soonTodayStr = new Date().toISOString().slice(0, 10);
  const soonEndStr = (() => { const d = new Date(soonTodayStr + "T00:00:00"); d.setDate(d.getDate() + soonDays); return d.toISOString().slice(0, 10); })();
  const isFlightSoon = (dep?: string | null) => !!dep && dep >= soonTodayStr && dep <= soonEndStr;

  // Reset to page 1 whenever any filter changes
  useEffect(() => { setPage(1); }, [search, pnrSearch, flightSearch, dateFrom, dateTo, statusFilter, agentFilter, alertFilter, unsentTicketFilter]);

  const hasActiveFilters = search || pnrSearch || flightSearch || dateFrom || dateTo || statusFilter || agentFilter || alertFilter || unsentTicketFilter;

  const clearFilters = () => {
    setSearch(""); setPnrSearch(""); setFlightSearch("");
    setDateFrom(""); setDateTo(""); setStatusFilter(""); setAgentFilter(""); setAlertFilter(""); setUnsentTicketFilter(false);
  };

  // Kërkimi tekstual i ndarë që të bëhet GLOBAL kur përdoruesi kërkon.
  const hasTextSearch = !!(search.trim() || pnrSearch.trim() || flightSearch.trim());
  const matchesTextSearch = (b: any) => {
    if (search && !bookingMatchesSearch(b, search)) return false;
    if (pnrSearch) {
      const q = pnrSearch.toLowerCase();
      if (!bookingPnrList(b).some(p => p.toLowerCase().includes(q))) return false;
    }
    if (flightSearch) {
      const q = flightSearch.toLowerCase().trim();
      const f = b.flight;
      if (!f) return false;
      // Sintaksa e rrugës: "MXP-TIA" (edhe "MXP > TIA" / "MXP→TIA") — nisja DHE mbërritja bashkë
      const route = q.match(/^([a-zçë]{2,4})\s*[-–—>→\/]\s*([a-zçë]{2,4})$/);
      if (route) {
        const hit2 = (f.fromCity?.toLowerCase().includes(route[1]) ?? false) &&
                     (f.toCity?.toLowerCase().includes(route[2]) ?? false);
        if (!hit2) return false;
      } else {
        const hit =
          f.flightNumber?.toLowerCase().includes(q) ||
          f.airline?.toLowerCase().includes(q) ||
          f.fromCity?.toLowerCase().includes(q) ||
          f.toCity?.toLowerCase().includes(q);
        if (!hit) return false;
      }
    }
    return true;
  };

  const bookings = useMemo(() => {
    // KUR KA KËRKIM: global — anashkalon datë/agjent/status, kërkon në GJITHË sistemin.
    if (hasTextSearch) {
      const matches = (allBookings as any[]).filter(matchesTextSearch);
      return unsentTicketFilter
        ? matches.filter((b: any) => b.status === "ticketed" && b.ticketEmailPending === true)
        : matches;
    }
    return (allBookings as any[]).filter(b => {
      if (statusFilter && b.status !== statusFilter) return false;
      if (agentFilter && String(b.agentId) !== agentFilter) return false;
      if (alertFilter === "with" && !(Number(b.emailAlertsCount) > 0)) return false;
      if (alertFilter === "without" && Number(b.emailAlertsCount) > 0) return false;
      if (unsentTicketFilter && !(b.status === "ticketed" && b.ticketEmailPending === true)) return false;

      if (dateFrom || dateTo) {
        const dep = b.flight?.departureDate;
        if (!dep) return false;
        if (dateFrom && dep < dateFrom) return false;
        if (dateTo && dep > dateTo) return false;
      }

      return true;
    });
  }, [allBookings, hasTextSearch, search, pnrSearch, flightSearch, dateFrom, dateTo, statusFilter, agentFilter, alertFilter, unsentTicketFilter]);

  const unsentTicketCount = useMemo(
    () => (allBookings as any[]).filter((b: any) => b.status === "ticketed" && b.ticketEmailPending === true).length,
    [allBookings],
  );

  const totalPages = Math.ceil(bookings.length / PER_PAGE);
  const pagedBookings = useMemo(
    () => bookings.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [bookings, page]
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Rezervimet</h1>
          <p className="text-muted-foreground text-xs md:text-sm hidden sm:block">Administro dhe kërko rezervimet e klientëve.</p>
        </div>
        <Link href="/bookings/new">
          <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">Rezervim i Ri</span><span className="sm:hidden">+ Ri</span></Button>
        </Link>
      </div>

      {/* Filter bar */}
      <div className="page-filter-panel bg-card border rounded-xl p-3 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          {/* Search: name/ref */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background min-w-[200px] flex-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              placeholder="Klienti, agjenci, kod CP, emër/mbiemër, Ref, PNR..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground"
            />
            {search && <button onClick={() => setSearch("")}><X className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>}
          </div>

          {/* PNR */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background min-w-[140px]">
            <span className="text-xs font-mono text-muted-foreground shrink-0">PNR</span>
            <input
              placeholder="Kodi PNR..."
              value={pnrSearch}
              onChange={e => setPnrSearch(e.target.value)}
              className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground font-mono"
            />
            {pnrSearch && <button onClick={() => setPnrSearch("")}><X className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>}
          </div>

          {/* Flight code */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background min-w-[150px]">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              placeholder="Fluturimi, Rruga (MXP-TIA)..."
              value={flightSearch}
              onChange={e => setFlightSearch(e.target.value)}
              className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground"
            />
            {flightSearch && <button onClick={() => setFlightSearch("")}><X className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>}
          </div>

          {/* Date from */}
          <DatePicker
            value={dateFrom}
            placeholder="Nga data…"
            onChange={v => { setDateFrom(v); if (dateTo && v > dateTo) setDateTo(v); }}
            className="w-40"
          />

          {/* Date to */}
          <DatePicker
            value={dateTo}
            placeholder="Deri në datë…"
            min={dateFrom || undefined}
            onChange={v => setDateTo(v)}
            className="w-40"
          />

          {/* Status */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-transparent outline-none text-sm text-muted-foreground"
            >
              <option value="">Të gjitha statuset</option>
              <option value="draft">Draft</option>
              <option value="pending">Pritje</option>
              <option value="confirmed">Konfirmuar</option>
              <option value="ticketed">Ticketed</option>
              <option value="cancelled">Anuluar</option>
            </select>
          </div>

          {/* Agent */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value)}
              className="bg-transparent outline-none text-sm text-muted-foreground"
            >
              <option value="">Të gjitha agjencitë</option>
              {(agents as any[]).map((a: any) => (
                <option key={a.id} value={String(a.id)}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Njoftim ndryshimi fluturimi */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select
              value={alertFilter}
              onChange={e => setAlertFilter(e.target.value)}
              className="bg-transparent outline-none text-sm text-muted-foreground"
            >
              <option value="">Njoftimet: të gjitha</option>
              <option value="with">Me njoftim</option>
              <option value="without">Pa njoftim</option>
            </select>
          </div>

          {(unsentTicketCount > 0 || unsentTicketFilter) && (
            <button
              onClick={() => setUnsentTicketFilter(v => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold ${
                unsentTicketFilter
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
              title="Rezervime të biletuara pa email të dërguar te agjenti"
            >
              <Mail className="h-3.5 w-3.5" /> Bileta pa Dërguar: {unsentTicketCount}
            </button>
          )}

          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground ml-auto">
              <X className="h-3.5 w-3.5" /> Pastro filtrat
            </button>
          )}
        </div>

        {/* Result count */}
        <div className="text-xs text-muted-foreground px-1">
          {isLoading ? "Duke ngarkuar..." : (
            hasActiveFilters
              ? `${bookings.length} nga ${(allBookings as any[]).length} rezervime`
              : `${(allBookings as any[]).length} rezervime gjithsej`
          )}
        </div>
      </div>

      {/* Mobile card list (hidden on md+) */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Duke ngarkuar...</div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            {hasActiveFilters ? "Nuk ka rezervime me këto kritere." : "Nuk ka rezervime."}
          </div>
        ) : pagedBookings.map((booking: any) => (
          <div key={booking.id} className={`border rounded-xl p-3 space-y-2 ${isFlightSoon(booking.flight?.departureDate) && booking.status !== "cancelled" ? "bg-red-100/60 border-red-200" : "bg-card"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => setSelectedBookingId(booking.id)}
                  style={agencyColors.get(booking.agentId)}
                  className="font-mono text-xs font-bold text-primary hover:underline shrink-0">
                  {booking.bookingRef}
                </button>
                {bookingPnrList(booking).length > 0 && <span className="font-mono text-[10px] text-muted-foreground truncate">{bookingPnrList(booking).join(" / ")}</span>}
                {booking.source === "CitizenPlane" && (
                  <Badge className="h-4 px-1.5 bg-sky-600 text-white text-[9px] font-bold shrink-0">CP</Badge>
                )}
                {typeof booking.notes === "string" && booking.notes.includes("[MBISHITJE") && (
                  <Badge className="h-4 px-1.5 bg-red-600 text-white text-[9px] font-bold shrink-0 animate-pulse" title="Rezervim i importuar MBI kapacitetin e fluturimit">MBISHITJE</Badge>
                )}
                {taskCounts[String(booking.id)] > 0 && (
                  <span title={`${taskCounts[String(booking.id)]} detyrë aktive e lidhur`}>
                    <Badge className="h-4 px-1 bg-violet-600 text-white text-[10px] gap-0.5 shrink-0">
                      <CheckSquare className="h-2.5 w-2.5" />
                      {taskCounts[String(booking.id)]}
                    </Badge>
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="flex items-center gap-1">
                  <Link href={`/bookings/${booking.id}`}>
                    <Badge className={`text-white text-[10px] cursor-pointer shrink-0 ${STATUS_COLORS[booking.status] || "bg-gray-500"}`}>
                      {STATUS_LABELS[booking.status] || booking.status}
                    </Badge>
                  </Link>
                  <ScheduleAlertBadge booking={booking} size="xs" />
                  {booking.ticketEmailPending && <TicketEmailPendingBadge size="xs" />}
                  <TicketFoundBadge booking={booking} size="xs" />
                  <BookingNotesBadge booking={booking} size="xs" />
                </div>
                <TicketDeadlineBadge createdAt={booking.createdAt} status={booking.status} size="xs" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{(() => {
                  const p = (booking.passengers || []).find((x: any) => x.type !== "infant") || (booking.passengers || [])[0];
                  return p ? `${p.firstName} ${p.lastName}`.trim() : booking.customerName;
                })()}</div>
                <div className="text-xs text-muted-foreground">
                  {booking.flight?.fromCity} → {booking.flight?.toCity}
                  {booking.flight?.isConfirmed && (
                    <span className="ml-1 text-sm leading-none" title="Fluturim i Konfirmuar" aria-label="Fluturim i Konfirmuar">⭐</span>
                  )}
                  {booking.flight?.departureDate && (
                    <span className="ml-1">· {format(new Date(booking.flight.departureDate + "T00:00:00"), "dd MMM")}</span>
                  )}
                </div>
                {(booking.passengers || []).some((p: any) => p.hasPriorityBoarding === true) && (
                  <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold ring-1 ring-amber-200 leading-none" title="Ka priority boarding (10kg)">
                    <Backpack className="h-3 w-3" /> PRIORITY
                  </span>
                )}
                {booking.agentId && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                    <AgentRankBadge agentName={booking.agentName} />
                    <span style={agencyColors.get(booking.agentId)}>{booking.agentName || `Agjent #${booking.agentId}`}</span>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                {(() => {
                  const displayDue = dueEuro(booking.dueAmount);
                  const fullyPaid = displayDue <= 0 && booking.paidAmount > 0 && booking.status !== "cancelled";
                  return (
                    <div className={fullyPaid ? "inline-block rounded-md bg-[#00b050] px-1.5 py-0" : undefined}>
                      <div className={`text-sm font-bold ${fullyPaid ? "text-white" : ""}`}>€{fmtM(booking.totalAmount)}</div>
                      {displayDue > 0 && (
                        <div className="text-[11px] text-destructive font-semibold">-€{fmtM(displayDue)}</div>
                      )}
                    </div>
                  );
                })()}
                {showCommissionCol && (() => {
                  const net = booking.totalNetPrice;
                  if (net == null || Number(net) === 0) return null;
                  const com = Number(booking.commissionAmount ?? 0);
                  const cls = com > 0 ? "text-emerald-600" : com < 0 ? "text-destructive" : "text-muted-foreground";
                  return <div className={`text-[11px] font-semibold ${cls}`}>Kom: €{fmtM(com)}</div>;
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table (hidden on mobile) */}
      <div className="hidden md:block border rounded-md overflow-x-auto">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>PNR</TableHead>
              <TableHead>Klienti</TableHead>
              <TableHead>Agjencia</TableHead>
              <TableHead>Fluturimi</TableHead>
              <TableHead className="text-center">PAX</TableHead>
              <TableHead>Nisja</TableHead>
              <TableHead>
                <div className="flex items-center gap-4">
                  <span className="w-20 text-right text-[10px] uppercase tracking-wide">Total</span>
                  <span className="w-20 text-right text-[10px] uppercase tracking-wide">Paguar</span>
                  <span className="w-20 text-right text-[10px] uppercase tracking-wide">Detyrim</span>
                </div>
              </TableHead>
              {showCommissionCol && <TableHead className="text-right">Komisioni</TableHead>}
              <TableHead>Statusi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Duke ngarkuar...</TableCell></TableRow>
            ) : bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                  {hasActiveFilters ? "Nuk ka rezervime me këto kritere kërkimi." : "Nuk ka rezervime."}
                </TableCell>
              </TableRow>
            ) : (
              pagedBookings.map((booking: any) => (
                <TableRow key={booking.id} className={`hover:bg-muted/30 ${booking.status === "cancelled" ? "!bg-slate-50 line-through text-black [&_*]:line-through [&_*]:!text-black [&_.cx-anuluar]:!text-white [&_.cx-anuluar]:!no-underline" : isFlightSoon(booking.flight?.departureDate) ? "!bg-red-100/60 hover:!bg-red-100/80" : ""}`}>
                  <TableCell>
                    {(() => {
                      const d = new Date(booking.createdAt);
                      const dateStr = format(d, "dd MMM yyyy");
                      const cls = isToday(d)
                        ? "text-green-600 font-bold"
                        : isYesterday(d)
                        ? "text-foreground font-bold"
                        : "text-muted-foreground font-normal";
                      return <div className={`text-[11px] mb-0.5 ${cls}`}>{dateStr}</div>;
                    })()}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="flex flex-col gap-0">
                        <button onClick={() => setSelectedBookingId(booking.id)} style={agencyColors.get(booking.agentId)} className="hover:underline font-mono text-xs font-semibold text-primary text-left">
                          {booking.bookingRef}
                        </button>
                        {booking.pnr
                          ? <span className="font-mono text-[10px] text-muted-foreground">{booking.pnr}</span>
                          : null
                        }
                      </div>
                      {typeof booking.notes === "string" && booking.notes.includes("[MBISHITJE") && (
                        <Badge className="h-4 px-1.5 bg-red-600 text-white text-[9px] font-bold shrink-0 animate-pulse" title="Rezervim i importuar MBI kapacitetin e fluturimit">MBISHITJE</Badge>
                      )}
                      {booking.pendingPriceRequests > 0 && (
                        <span title={`${booking.pendingPriceRequests} kërkesë çmimi në pritje`}>
                          <Badge className="h-4 px-1 bg-orange-500 text-white text-[10px] gap-0.5 animate-pulse">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {booking.pendingPriceRequests}
                          </Badge>
                        </span>
                      )}
                      {taskCounts[String(booking.id)] > 0 && (
                        <span title={`${taskCounts[String(booking.id)]} detyrë aktive e lidhur`}>
                          <Badge className="h-4 px-1 bg-violet-600 text-white text-[10px] gap-0.5">
                            <CheckSquare className="h-2.5 w-2.5" />
                            {taskCounts[String(booking.id)]}
                          </Badge>
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const slots: (string | null)[] = bookingPnrList(booking);
                      if (slots.length === 0) {
                        return <span className="text-xs font-semibold text-destructive">NOT ISSUED</span>;
                      }
                      const MAX_SHOW = 2;
                      const shown = slots.slice(0, MAX_SHOW);
                      const rest = slots.slice(MAX_SHOW);
                      return (
                        <div className="flex items-center gap-0 flex-wrap">
                          {shown.map((p, i) => (
                            <span key={i} className="flex items-center">
                              {i > 0 && <span className="text-muted-foreground mx-1 font-bold">/</span>}
                              {p
                                ? <span className="font-mono text-xs font-semibold tracking-wider">{p}</span>
                                : <span className="text-xs font-semibold text-destructive">NOT ISSUED</span>
                              }
                            </span>
                          ))}
                          {rest.length > 0 && (
                            <span className="relative group inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1 cursor-default ml-1">
                              +{rest.length}
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[11px] font-mono px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                                {rest.map(p => p || "NOT ISSUED").join(" / ")}
                              </span>
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{(() => {
                      const p = (booking.passengers || []).find((x: any) => x.type !== "infant") || (booking.passengers || [])[0];
                      return p ? `${p.firstName} ${p.lastName}`.trim() : booking.customerName;
                    })()}</div>
                  </TableCell>
                  <TableCell>
                    {booking.agentId ? (
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <AgentRankBadge agentName={booking.agentName} />
                        <span style={agencyColors.get(booking.agentId)}>{booking.agentName || `Agjent #${booking.agentId}`}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <span>{booking.flight?.fromCity} → {booking.flight?.toCity}</span>
                      {booking.flight?.isConfirmed && (
                        <span className="text-sm leading-none" title="Fluturim i Konfirmuar" aria-label="Fluturim i Konfirmuar">⭐</span>
                      )}
                    </div>
                    {(booking.passengers || []).some((p: any) => p.hasPriorityBoarding === true) && (
                      <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold ring-1 ring-amber-200 leading-none" title="Ka priority boarding (10kg)">
                        <Backpack className="h-3 w-3" /> PRIORITY
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-sm font-semibold">
                        {(booking.passengers || []).filter((p: any) => p.type !== "infant" && !p.cancelled).length}
                      </span>
                      {(booking.passengers || []).some((p: any) => p.type === "infant") && (
                        <span title="Ka foshnjë (infant)">
                          <Baby className="h-3.5 w-3.5 text-blue-500" />
                        </span>
                      )}
                      {(booking.passengers || []).some((p: any) => p.baggageOption === "checked") && (
                        <span title="Ka bagazh 20kg">
                          <Luggage className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                      {(booking.passengers || []).some((p: any) => p.hasPriorityBoarding === true) && (
                        <span title="Ka priority boarding (10kg)">
                          <Backpack className="h-3.5 w-3.5 text-yellow-500" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {booking.flight?.departureDate ? (
                      <div className="flex flex-col leading-tight">
                        <span>{format(new Date(booking.flight.departureDate + "T00:00:00"), "dd MMM yyyy")}</span>
                        {booking.flight?.departureTime && (
                          <span className="text-[11px] font-mono text-foreground/70">{fmtAmPm(booking.flight.departureTime)}</span>
                        )}
                      </div>
                    ) : (
                      format(new Date(booking.createdAt), "dd MMM yyyy")
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const displayDue = dueEuro(booking.dueAmount);
                      const fullyPaid = displayDue <= 0 && booking.paidAmount > 0 && booking.status !== "cancelled";
                      return (
                        <div className="flex flex-col gap-0.5">
                          <div className={`flex items-center gap-4 text-sm ${fullyPaid ? "rounded-md bg-[#00b050] px-2 py-0.5" : ""}`}>
                            <span className={`w-20 text-right font-semibold ${fullyPaid ? "text-white" : "text-foreground"}`}>€{fmtM(booking.totalAmount)}</span>
                            <span className={`w-20 text-right font-semibold ${fullyPaid ? "text-white" : "text-green-600"}`}>€{fmtM(booking.paidAmount)}</span>
                            <span className={`w-20 text-right font-semibold ${displayDue > 0 ? "text-destructive" : fullyPaid ? "text-white" : "text-muted-foreground"}`}>
                              €{fmtM(displayDue)}
                            </span>
                          </div>
                          {Number(booking.creditAmount) > 0 && (
                            <div className="text-[10px] text-blue-500 font-semibold text-right">+€{fmtM(booking.creditAmount)} kredit</div>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  {showCommissionCol && (
                  <TableCell className="text-right">
                    {(() => {
                      const net = booking.totalNetPrice;
                      if (net == null || Number(net) === 0) {
                        return <span className="text-muted-foreground text-sm">—</span>;
                      }
                      const com = Number(booking.commissionAmount ?? 0);
                      const cls = com > 0 ? "text-emerald-600" : com < 0 ? "text-destructive" : "text-muted-foreground";
                      return <span className={`text-sm font-semibold ${cls}`}>€{fmtM(com)}</span>;
                    })()}
                  </TableCell>
                  )}
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/bookings/${booking.id}`}>
                          <Badge className={`cx-anuluar text-white text-xs cursor-pointer ${STATUS_COLORS[booking.status] || "bg-gray-500"}`}>
                            {STATUS_LABELS[booking.status] || booking.status}
                          </Badge>
                        </Link>
                        <ScheduleAlertBadge booking={booking} />
                        {booking.ticketEmailPending && <TicketEmailPendingBadge />}
                        <TicketFoundBadge booking={booking} />
                        <BookingNotesBadge booking={booking} />
                      </div>
                      <TicketDeadlineBadge createdAt={booking.createdAt} status={booking.status} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      {(totalPages > 1 || !loadAll) && (
        <div className="flex items-center justify-between px-1 gap-2">
          <span className="text-xs md:text-sm text-muted-foreground">
            <span className="hidden sm:inline">Faqja </span>
            <span className="font-semibold text-foreground">{page}</span>
            <span className="text-muted-foreground">/{totalPages || 1}</span>
            <span className="hidden sm:inline"> · {bookings.length} rez.{!loadAll ? " (vetëm sot)" : ""}</span>
          </span>
          <div className="flex items-center gap-2">
            {!loadAll && (
              <Button variant="outline" size="sm" onClick={() => setShowAll(true)} disabled={isFetching}>
                {isFetching ? "Duke ngarkuar…" : "Shfaq të gjitha"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 md:mr-1" />
              <span className="hidden md:inline">Mbrapa</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!loadAll && page >= totalPages) { setShowAll(true); return; }
                setPage(p => Math.min(totalPages, p + 1));
              }}
              disabled={loadAll ? page >= totalPages : false}
            >
              <span className="hidden md:inline">Përpara</span>
              <ChevronRight className="h-4 w-4 md:ml-1" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle></DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
