import { useState, useMemo, useEffect } from "react";
import { usePremiumBookings, fetchPremiumBookings, EMPTY_PREMIUM } from "@/hooks/usePremiumBookings";
import { useToast } from "@/hooks/use-toast";
import { useSearch } from "wouter";
import { fmtM, fmtAmPm, fmtDateTimeAmPm, bookingPnrList, dueEuro } from "@/lib/utils";
import { cpCodeOf } from "@/lib/reportDetailed";
import { format, isToday } from "date-fns";
import { useListAgents } from "@workspace/api-client-react";
import { agencyColorMap } from "@/lib/agencyDisplayColor";
import { useBookingColumns } from "@/hooks/useBookingColumns";
import { BookingColumnPicker } from "@/components/BookingColumnPicker";
import { BOOKING_FINANCIAL_WIDTHS } from "@/lib/bookingColumns";
import { BookingColumnResize } from "@/components/BookingColumnResize";
import { useResizableBookingTable } from "@/hooks/useResizableBookingTable";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import BookingDetailPremium from "@/pages/booking-detail-premium";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";
import { DatePicker } from "@/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useTheme } from "@/context/ThemeContext";
import {
  Plus, Search, X, Filter, MessageSquare, Baby, Luggage, Backpack,
  ChevronLeft, ChevronRight, ChevronDown, Plane, ArrowUpRight, ArrowDownRight,
  ArrowUp, ArrowDown, ArrowUpDown,
  TrendingUp, Users, CreditCard, CircleDollarSign, AlertCircle, MoreHorizontal, CheckSquare,
  Download, FileSpreadsheet, FileText, Ticket, Siren, Mail, Check, ClipboardList, Banknote, Percent, FileClock,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fitPdfCellToOneLine } from "@/lib/pdfSingleLine";
import { useEntityTaskCounts } from "@/lib/taskCounts";
import { AgentRankBadge } from "@/components/AgentRankBadge";
import { TicketDeadlineBadge } from "@/components/ticket-deadline-badge";
import { TicketEmailPendingBadge, TicketFoundBadge } from "@/components/ticket-found-badge";
import { ScheduleAlertBadge } from "@/components/schedule-alert-badge";
import { BookingNotesBadge } from "@/components/BookingComments";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  draft:      { bg: "bg-slate-100",   text: "text-slate-700",   dot: "bg-slate-400",   label: "Draft" },
  pending:    { bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-500",   label: "Pritje" },
  confirmed:  { bg: "bg-blue-50",     text: "text-blue-700",    dot: "bg-blue-500",    label: "Konfirmuar" },
  ticketed:   { bg: "bg-[#00b050]",   text: "text-white",       dot: "bg-white",       label: "Ticketed" },
  cancelled:  { bg: "bg-rose-50",     text: "text-rose-700",    dot: "bg-rose-500",    label: "Anuluar" },
};

const STATUS_STRIPE: Record<string, string> = {
  draft: "#94a3b8",
  pending: "#f59e0b",
  confirmed: "#3b82f6",
  ticketed: "#00b050",
  cancelled: "#cbd5e1",
};

function fmt(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return fmtM(v);
}

function StatCard({ label, value, delta, deltaDir, icon: Icon, accent, kind }: {
  label: string; value: string; delta?: string; deltaDir?: "up" | "down" | "flat"; icon: any; accent: string;
  kind?: "bookings" | "sales" | "profit" | "unpaid" | "pax";
}) {
  const deltaCls = deltaDir === "up" ? "text-emerald-600 bg-emerald-50"
    : deltaDir === "down" ? "text-rose-600 bg-rose-50"
    : "text-slate-500 bg-slate-100";
  const DeltaIcon = deltaDir === "up" ? ArrowUpRight : deltaDir === "down" ? ArrowDownRight : TrendingUp;
  return (
    <div className="flex items-baseline gap-3 px-4 py-2.5 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{label}</span>
      {delta && (
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${deltaCls}`}>
          <DeltaIcon className="w-3 h-3" /> {delta}
        </span>
      )}
      <span className={`ml-auto text-xl font-bold tabular-nums tracking-tight ${kind === "unpaid" ? "text-rose-600" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}


export default function BookingsListPremium() {
  const { hasPermission, user } = useAdminAuth();
  const qs = useSearch();
  const initialStatus = (() => {
    try { return new URLSearchParams(qs).get("status") ?? ""; } catch { return ""; }
  })();
  const [search, setSearch] = useState("");
  const [pnrSearch, setPnrSearch] = useState("");
  const [flightSearch, setFlightSearch] = useState("");
  const todayISO = format(new Date(), "yyyy-MM-dd");
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [customRange, setCustomRange] = useState(false);
  const [dateTo, setDateTo] = useState(todayISO);
  const showCustomRange = (() => {
    if (customRange) return true;
    if (!dateFrom && !dateTo) return false;
    const day = (n: number) => format(new Date(Date.now() - n * 864e5), "yyyy-MM-dd");
    const today = day(0);
    if (dateFrom === dateTo && (dateFrom === today || dateFrom === day(1))) return false;
    if (dateTo === today && (dateFrom === day(6) || dateFrom === day(29))) return false;
    return true;
  })();
  // Filtri i datës së FLUTURIMIT (nisja) — vlen edhe gjatë kërkimit tekstual
  const [flightDateFrom, setFlightDateFrom] = useState("");
  const [flightDateTo, setFlightDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [agentFilter, setAgentFilter] = useState<string[]>([]);
  const [agentFilterOpen, setAgentFilterOpen] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<"" | "paid" | "partial" | "unpaid">("");
  // Filtri i biletave nga emaili: "" (të gjitha) | "with" (me email) | "without" (pa email)
  const [emailTicketFilter, setEmailTicketFilter] = useState<"" | "with" | "without">("");
  const [unsentTicketFilter, setUnsentTicketFilter] = useState(false);
  // Filtri i njoftimeve të ndryshimit të fluturimit: "" | "with" (me njoftim) | "without" (pa njoftim)
  const [alertFilter, setAlertFilter] = useState<"" | "with" | "without">("");
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const openBooking = (id: number) => setSelectedBookingId(id);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(true);

  // ── Renditja sipas kolonave (klikim mbi header: rritëse → zbritëse → default) ──
  type SortKey = "date" | "ref" | "pnr" | "klienti" | "agjencia" | "fluturimi" | "flightDate" | "flightTime" | "pax" | "financa" | "neto" | "commission" | "paid" | "due" | "credit" | "statusi";
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (key: SortKey) => {
    setPage(1);
    if (sortBy !== key) { setSortBy(key); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortBy(null); // klikimi i tretë kthen renditjen default (më të rejat lart)
  };


  // ── Ngarkim i shpejtë: fillimisht VETËM rezervimet e sotme; të gjitha
  // ngarkohen kur përdoruesi kërkon/filtron ose klikon "Shfaq të gjitha". ──
  const [showAll, setShowAll] = useState(false);
  const loadAll = showAll ||
    !!(search || pnrSearch || flightSearch || flightDateFrom || flightDateTo || statusFilter || agentFilter.length || paymentFilter || emailTicketFilter || unsentTicketFilter || alertFilter) ||
    dateFrom !== todayISO || dateTo !== todayISO;
  const listInput = {
    loadAll, todayISO, page, search, pnrSearch, flightSearch, flightDateFrom, flightDateTo,
    dateFrom, dateTo, statusFilter: statusFilter as any, agentFilter, paymentFilter,
    emailTicketFilter, unsentTicketFilter, alertFilter, sortBy: sortBy || "" as const, sortDir,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
  };
  const { data: listResult = EMPTY_PREMIUM, isLoading, isFetching, error: listError, refetch } = usePremiumBookings(listInput, user?.id);
  const { toast } = useToast();
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  useEffect(() => {
    if (!isFetching && listResult.page < page && listResult !== EMPTY_PREMIUM) setPage(listResult.page);
  }, [listResult, isFetching, page]);
  const { data: agents = [] } = useListAgents({});
  const agencyColors = useMemo(() => agencyColorMap(agents), [agents]);
  const { data: taskCounts = {} } = useEntityTaskCounts("booking");

  // Permission flags for the 4 stat cards
  const canStatBookings = hasPermission("can_view_stat_bookings_today");
  const canStatSales    = hasPermission("can_view_stat_sales_today");
  const canStatProfit   = hasPermission("can_view_stat_profit_today");
  const canStatUnpaid   = hasPermission("can_view_stat_unpaid_total");
  const canStatPax      = true;
  const visibleStatCount = [canStatBookings, canStatSales, canStatProfit, canStatUnpaid, canStatPax].filter(Boolean).length;
  const canNewBookingBtn   = hasPermission("can_use_new_booking_button");
  const canCommissionCol   = hasPermission("can_view_commission_in_bookings_list");
  const columnState = useBookingColumns(user?.id, canCommissionCol);
  const isColumnVisible = (key: SortKey) => columnState.shown.has(key);
  const hiddenSort = sortBy !== null && !isColumnVisible(sortBy);
  useEffect(() => { if (hiddenSort) setSortBy(null); }, [hiddenSort]);
  const canSearchBookings  = hasPermission("can_search_bookings");
  const canFilterByStatus  = hasPermission("can_filter_bookings_by_status");
  const canFilterByAgent   = hasPermission("can_filter_bookings_by_agent");
  const canAdvFilters      = hasPermission("can_use_advanced_booking_filters");
  const canViewTotalCount  = hasPermission("can_view_bookings_total_count");
  const canExport          = hasPermission("can_export_bookings");

  useEffect(() => { setPage(1); }, [search, pnrSearch, flightSearch, flightDateFrom, flightDateTo, dateFrom, dateTo, statusFilter, agentFilter, paymentFilter, emailTicketFilter, unsentTicketFilter, alertFilter]);

  const hasActiveFilters = !!(search || pnrSearch || flightSearch || flightDateFrom || flightDateTo || dateFrom || dateTo || statusFilter || agentFilter.length || paymentFilter || emailTicketFilter || unsentTicketFilter || alertFilter);
  // Filtra që prekin kartat e statistikave (PA datat e listës — ato s'i prekin kartat lart).
  const hasStatsScopeFilter = !!(search || pnrSearch || flightSearch || statusFilter || agentFilter.length);

  const clearFilters = () => {
    setSearch(""); setPnrSearch(""); setFlightSearch(""); setFlightDateFrom(""); setFlightDateTo("");
    setDateFrom(""); setDateTo(""); setStatusFilter(""); setAgentFilter([]); setPaymentFilter("");
    setEmailTicketFilter(""); setUnsentTicketFilter(false); setAlertFilter("");
  };

  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Etiketa e periudhës aktive — rrjedh nga FILTRI I VETËM I DATËS poshtë (Sot/Dje/7d/30d/custom/gjithë).
  const periodLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return "gjithë";
    const today = format(new Date(), "yyyy-MM-dd");
    const yest = format(new Date(Date.now() - 864e5), "yyyy-MM-dd");
    const d7 = format(new Date(Date.now() - 6 * 864e5), "yyyy-MM-dd");
    const d30 = format(new Date(Date.now() - 29 * 864e5), "yyyy-MM-dd");
    if (dateFrom === today && dateTo === today) return "sot";
    if (dateFrom === yest && dateTo === yest) return "dje";
    if (dateFrom === d7 && dateTo === today) return "7 ditët";
    if (dateFrom === d30 && dateTo === today) return "30 ditët";
    const f = (s: string) => (s ? format(new Date(s + "T00:00:00"), "dd/MM") : "…");
    if (dateFrom && dateTo) return `${f(dateFrom)}–${f(dateTo)}`;
    if (dateFrom) return `nga ${f(dateFrom)}`;
    return `deri ${f(dateTo)}`;
  }, [dateFrom, dateTo]);

  // "Data të Aferta" threshold (settings) — tint rows whose flight departs within it.
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

  const { items: pagedBookings, totalPages, statusCounts, emailTicketCounts, alertCount, unsentTicketCount,
    stats, filteredUnpaid, totalCount, filteredCount, matchingCount } = listResult;
  const bookings = pagedBookings;
  const hasTextSearch = !!(search.trim() || pnrSearch.trim() || flightSearch.trim());
  const resizeTable = useResizableBookingTable(columnState.widths, columnState.columns.map(column => column.k), pagedBookings);

  // ── Eksport i listës AKTUALE të filtruar (PDF / Excel) ────────────────────
  const STATUS_LABEL: Record<string, string> = {
    draft: "Draft", pending: "Pritje", confirmed: "Konfirmuar", ticketed: "Ticketed", cancelled: "Anuluar",
  };
  const makeExportRows = (sortedBookings: any[]) => {
    return (sortedBookings as any[]).map((b: any) => {
      const px = (b.passengers || []).find((x: any) => x.type !== "infant") || (b.passengers || [])[0];
      const clientName = px ? `${px.firstName} ${px.lastName}`.trim() : (b.customerName || "");
      const paxCount = (b.passengers || []).filter((p: any) => p.type !== "infant" && !p.cancelled).length;
      const from = b.flight ? (b.flight.fromCity || "—") : "—";
      const to = b.flight ? (b.flight.toCity || "—") : "—";
      const flightDate = b.flight?.departureDate
        ? format(new Date(b.flight.departureDate + "T00:00:00"), "dd/MM/yyyy")
        : "";
      const created = b.createdAt ? format(new Date(b.createdAt), "dd/MM/yyyy h:mm a") : "";
      return {
        created,
        ref: b.bookingRef || "",
        pnr: bookingPnrList(b).join(" / "),
        cp: cpCodeOf(b),
        client: clientName,
        agency: b.agentName || (b.agentId ? `Agjent #${b.agentId}` : "—"),
        from,
        to,
        flightDate,
        pax: paxCount,
        total: Number(b.totalAmount ?? 0),
        paid: Number(b.paidAmount ?? 0),
        due: dueEuro(b.dueAmount),
        comm: (b.totalNetPrice == null || Number(b.totalNetPrice) === 0) ? null : Number(b.commissionAmount ?? 0),
        status: STATUS_LABEL[b.status] || b.status || "",
      };
    });
  };

  // Mbron nga "formula injection" në Excel: tekstet që fillojnë me = + - @ priklohen me '.
  const safeCell = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);

  // Kolona "Kodi CP" shfaqet vetëm kur lista e filtruar ka rezervime ONLINE TRAVEL me kod CP.
  const runExport = async (kind: "excel" | "pdf") => {
    if (exportBusy) return;
    setExportBusy(true); setExportError(""); setExportMenuOpen(false);
    try {
      const result = await fetchPremiumBookings({ ...listInput, exportAll: true });
      if (kind === "excel") handleExportExcel(result.items);
      else handleExportPdf(result.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Eksporti dështoi.";
      setExportError(message);
      toast({ title: "Eksporti dështoi", description: message, variant: "destructive" });
    } finally { setExportBusy(false); }
  };

  const handleExportExcel = (sortedBookings: any[]) => {
    const exportRows = makeExportRows(sortedBookings);
    const hasCpCol = exportRows.some(r => r.cp);
    setExportMenuOpen(false);
    const fileBase = `rezervimet_${format(new Date(), "yyyy-MM-dd_HHmm")}`;
    const header = [
      "Data Rez.", "REF", "PNR",
      ...(hasCpCol ? ["Kodi CP"] : []),
      "Klienti", "Agjencia", "Nisja", "Mbërritja", "Data Fluturimit",
      "PAX", "Total (€)", "Paguar (€)", "Mbetet (€)",
      ...(canCommissionCol ? ["Komisioni (€)"] : []),
      "Statusi",
    ];
    const aoa: any[][] = [header];
    exportRows.forEach(r => {
      aoa.push([
        r.created, safeCell(r.ref), safeCell(r.pnr),
        ...(hasCpCol ? [safeCell(r.cp)] : []),
        safeCell(r.client), safeCell(r.agency),
        safeCell(r.from), safeCell(r.to), r.flightDate, r.pax, r.total, r.paid, r.due,
        ...(canCommissionCol ? [r.comm == null ? "" : r.comm] : []),
        r.status,
      ]);
    });
    const totals = exportRows.reduce(
      (s, r) => { s.total += r.total; s.paid += r.paid; s.due += r.due; s.pax += r.pax; s.comm += r.comm ?? 0; return s; },
      { total: 0, paid: 0, due: 0, pax: 0, comm: 0 },
    );
    aoa.push([]);
    aoa.push([
      "TOTALI", "", "",
      ...(hasCpCol ? [""] : []),
      "", "", "", "", "", totals.pax, totals.total, totals.paid, totals.due,
      ...(canCommissionCol ? [totals.comm] : []),
      `${exportRows.length} rezervime`,
    ]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 16 }, { wch: 12 }, { wch: 12 },
      ...(hasCpCol ? [{ wch: 12 }] : []),
      { wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 6 }, { wch: 11 }, { wch: 11 }, { wch: 11 },
      ...(canCommissionCol ? [{ wch: 12 }] : []),
      { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rezervimet");
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  };

  const handleExportPdf = (sortedBookings: any[]) => {
    const exportRows = makeExportRows(sortedBookings);
    const hasCpCol = exportRows.some(r => r.cp);
    setExportMenuOpen(false);
    const fileBase = `rezervimet_${format(new Date(), "yyyy-MM-dd_HHmm")}`;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const now = fmtDateTimeAmPm(new Date(), { dateOptions: { dateStyle: "medium" } });
    const pageW = 297;
    const margin = 10;
    const usable = pageW - margin * 2;

    // Header bar
    doc.setFillColor(30, 58, 95);
    doc.rect(margin, margin, usable, 12, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Raport Rezervimesh - Kings Travel", margin + 3, margin + 8);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(`${exportRows.length} rezervime  |  ${now}`, margin + usable - 2, margin + 8, { align: "right" });

    const totals = exportRows.reduce(
      (s, r) => { s.total += r.total; s.paid += r.paid; s.due += r.due; s.pax += r.pax; s.comm += r.comm ?? 0; return s; },
      { total: 0, paid: 0, due: 0, pax: 0, comm: 0 },
    );

    const fmtComm = (c: number | null) => c == null ? "—" : (c < 0 ? `-${fmt(Math.abs(c))}` : fmt(c));

    const rows = exportRows.map((r, index) => [
      r.created, r.ref, r.pnr,
      ...(hasCpCol ? [r.cp || "—"] : []),
      r.client, r.agency, r.from, r.to, r.flightDate,
      sortedBookings[index]?.flight?.departureTime ? fmtAmPm(sortedBookings[index].flight!.departureTime!) : "—",
      String(r.pax), fmt(r.total), fmt(r.paid), fmt(r.due),
      ...(canCommissionCol ? [fmtComm(r.comm)] : []),
      r.status,
    ]);

    autoTable(doc, {
      startY: margin + 15,
      head: [[
        "Data Rez.", "REF", "PNR",
        ...(hasCpCol ? ["Kodi CP"] : []),
        "Klienti", "Agjencia", "Nisja", "Mbërritja", "Data Flut.", "Ora Flut.", "PAX", "Total", "Paguar", "Mbetet",
        ...(canCommissionCol ? ["Komision"] : []),
        "Statusi",
      ]],
      body: rows,
      foot: [[
        "TOTALI", "", "",
        ...(hasCpCol ? [""] : []),
        "", "", "", "", "", "", String(totals.pax), fmt(totals.total), fmt(totals.paid), fmt(totals.due),
        ...(canCommissionCol ? [fmtComm(totals.comm)] : []),
        "",
      ]],
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.6, right: 1, bottom: 1.6, left: 1 },
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
        textColor: [30, 41, 59],
        overflow: "visible",
        minCellHeight: 6.2,
        valign: "middle",
      },
      headStyles: {
        fillColor: [30, 58, 95], textColor: [255, 255, 255], fontSize: 6.8,
        fontStyle: "bold", halign: "center",
      },
      footStyles: {
        fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", halign: "right",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: data => fitPdfCellToOneLine(doc, data),
      // Gjerësitë ndërtohen dinamikisht sipas kolonave aktive (Kodi CP / Komision),
      // që indekset të mos zhvendosen kur shtohet kolona e CP-së.
      columnStyles: Object.fromEntries(
        (canCommissionCol ? [
          { cellWidth: 28 },                                              // Data Rez.
          { cellWidth: 17, fontStyle: "bold" },                           // REF
          { cellWidth: 16 },                                              // PNR
          ...(hasCpCol ? [{ cellWidth: 16 }] : []),                       // Kodi CP
          { cellWidth: hasCpCol ? 30 : 38 },                              // Klienti
          { cellWidth: hasCpCol ? 25 : 33 },                              // Agjencia
          { cellWidth: 13 },                                              // Nisja
          { cellWidth: 13 },                                              // Mbërritja
          { cellWidth: 19 },                                              // Data Flut.
          { cellWidth: 14, halign: "center" },                            // Ora Flut.
          { cellWidth: 10, halign: "center" },                            // PAX
          { cellWidth: 14, halign: "right" },                             // Total
          { cellWidth: 14, halign: "right", textColor: [22, 163, 74] },   // Paguar
          { cellWidth: 14, halign: "right", textColor: [220, 38, 38] },   // Mbetet
          { cellWidth: 16, halign: "right", textColor: [124, 58, 237] },  // Komision
          { cellWidth: 18, halign: "center" },                            // Statusi
        ] : [
          { cellWidth: 28 },                                              // Data Rez.
          { cellWidth: 18, fontStyle: "bold" },                           // REF
          { cellWidth: 16 },                                              // PNR
          ...(hasCpCol ? [{ cellWidth: 16 }] : []),                       // Kodi CP
          { cellWidth: hasCpCol ? 35 : 43 },                              // Klienti
          { cellWidth: hasCpCol ? 29 : 37 },                              // Agjencia
          { cellWidth: 14 },                                              // Nisja
          { cellWidth: 14 },                                              // Mbërritja
          { cellWidth: 20 },                                              // Data Flut.
          { cellWidth: 14, halign: "center" },                            // Ora Flut.
          { cellWidth: 11, halign: "center" },                            // PAX
          { cellWidth: 14, halign: "right" },                             // Total
          { cellWidth: 14, halign: "right", textColor: [22, 163, 74] },   // Paguar
          { cellWidth: 14, halign: "right", textColor: [220, 38, 38] },   // Mbetet
          { cellWidth: 20, halign: "center" },                            // Statusi
        ]).map((style, i) => [i, style]),
      ) as any,
    });

    doc.save(`${fileBase}.pdf`);
  };

  // Page money summary — anuluarat nuk llogariten.
  const pageSummary = useMemo(() => {
    let total = 0, paid = 0, due = 0, comm = 0;
    pagedBookings.forEach((b: any) => {
      if (b.status === "cancelled") return;
      total += Number(b.totalAmount ?? 0);
      paid += Number(b.paidAmount ?? 0);
      due += dueEuro(b.dueAmount);
      comm += Number(b.commissionAmount ?? 0);
    });
    return { total, paid, due, comm };
  }, [pagedBookings]);

  // Numërimet e rezervimeve nuk i përfshijnë anuluarat (ato shfaqen në listë, por
  // nuk llogariten si "nr rezervimi"). Renditja/faqësimi mbeten mbi listën e plotë.
  const pagedActiveCount  = (pagedBookings as any[]).filter(b => b.status !== "cancelled").length;

  return (
    <div
      className="min-h-full -mx-4 -my-4 md:-mx-6 md:-my-6 px-4 py-4 md:px-6 md:py-6 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 text-slate-900"
      style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
    >
      <div className="max-w-[1800px] mx-auto space-y-4 px-2">
        {listError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          {listError.message} <button className="underline ml-2" onClick={() => refetch()}>Provo përsëri</button>
        </div>}
        {exportError && <div role="alert" className="text-red-700">{exportError}</div>}

        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Operacionet</span>
              <span className="text-slate-300">/</span>
              <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Rezervimet</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Rezervimet
              <span className="px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-md border border-blue-100 tabular-nums">{totalCount.toLocaleString()}</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">Menaxho të gjitha rezervimet, pagesat dhe biletat e fluturimit.</p>
          </div>
          <div className="flex items-center gap-2">
            <BookingColumnPicker state={columnState} canCommission={canCommissionCol} />
            {canNewBookingBtn && (
              <Link href="/bookings/new">
                <button className="h-9 px-3.5 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:from-blue-500 hover:to-indigo-500 flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20">
                  <Plus className="w-4 h-4" /> Rezervim i Ri
                </button>
              </Link>
            )}
          </div>
        </div>

        {/* Stats */}
        {visibleStatCount > 0 && (
          <div className="space-y-2">
            <div className={`grid grid-cols-2 ${visibleStatCount >= 5 ? "lg:grid-cols-5" : visibleStatCount === 4 ? "lg:grid-cols-4" : visibleStatCount === 3 ? "lg:grid-cols-3" : visibleStatCount === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"} bg-white rounded-xl border border-slate-200 divide-x divide-slate-200 overflow-hidden`}>
              {canStatBookings && (
                <StatCard kind="bookings" label={`Rezervime ${periodLabel}`} value={String(stats.periodCount)} icon={Users} accent="bg-gradient-to-br from-blue-500 to-indigo-600" />
              )}
              {canStatSales && (
                <StatCard kind="sales" label={`Shitje ${periodLabel}`} value={`€${fmt(stats.periodSales)}`} icon={CreditCard} accent="bg-gradient-to-br from-emerald-500 to-teal-600" />
              )}
              {canStatProfit && (
                <StatCard kind="profit" label={`Profit ${periodLabel}`} value={`€${fmt(stats.periodProfit)}`} icon={TrendingUp} accent="bg-gradient-to-br from-violet-500 to-purple-600" />
              )}
              {canStatUnpaid && (
                <StatCard
                  kind="unpaid"
                  label={(!dateFrom && !dateTo) ? (hasStatsScopeFilter ? "Pa paguar (filtruar)" : "Pa paguar (total)") : `Pa paguar (${periodLabel})`}
                  value={`€${fmt(filteredUnpaid)}`}
                  icon={AlertCircle}
                  accent="bg-gradient-to-br from-rose-500 to-pink-600"
                />
              )}
              {canStatPax && (
                <StatCard kind="pax" label={`Pasagjerë ${periodLabel}`} value={String(stats.periodPax)} icon={Users} accent="bg-gradient-to-br from-sky-500 to-cyan-600" />
              )}
            </div>
          </div>
        )}

        {/* Filters bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {canSearchBookings && (
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                placeholder="Kërko klient, agjenci, kod CP, emër/mbiemër, REF, PNR..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-8 rounded-lg bg-slate-50 border border-slate-200/60 text-sm placeholder:text-slate-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            )}
            {canSearchBookings && (canFilterByStatus || canFilterByAgent || canAdvFilters) && (
              <div className="w-px h-6 bg-slate-200" />
            )}

            {/* Status — çipa të klikueshëm me numërim (mbi gjithë sistemin, "Të gjitha") */}
            {canFilterByStatus && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: "draft",     chip: "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200",   active: "bg-slate-600 text-white ring-slate-600" },
                { key: "pending",   chip: "bg-amber-100 text-amber-700 ring-amber-200 hover:bg-amber-200",   active: "bg-amber-500 text-white ring-amber-500" },
                { key: "confirmed", chip: "bg-blue-100 text-blue-700 ring-blue-200 hover:bg-blue-200",       active: "bg-blue-600 text-white ring-blue-600" },
                { key: "ticketed",  chip: "bg-emerald-100 text-emerald-700 ring-emerald-200 hover:bg-emerald-200", active: "bg-[#00b050] text-white ring-[#00b050]" },
                { key: "cancelled", chip: "bg-rose-100 text-rose-700 ring-rose-200 hover:bg-rose-200",       active: "bg-rose-600 text-white ring-rose-600" },
              ] as const).map(s => (
                <button
                  key={s.key}
                  onClick={() => {
                    const activating = statusFilter !== s.key;
                    setStatusFilter(activating ? s.key : "");
                    // Kur klikohet një status, lista kalon automatikisht në "Të gjitha"
                    // (pa kufizim date), që rezultatet të përputhen me numrin e çipit.
                    if (activating) { setDateFrom(""); setDateTo(""); }
                  }}
                  className={`h-7 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ring-1 transition-colors tabular-nums ${statusFilter === s.key ? s.active : s.chip}`}
                  title={`${STATUS_STYLES[s.key].label}: numri mbi gjithë sistemin (Të gjitha) — kliko për të filtruar, rikliko për t'i hequr filtrin`}
                >
                  {STATUS_STYLES[s.key].label}: {statusCounts[s.key]}
                </button>
              ))}
            </div>
            )}

            {/* Agent */}
            {canFilterByAgent && (
              <Popover open={agentFilterOpen} onOpenChange={setAgentFilterOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-9 min-w-[180px] max-w-[230px] pl-3 pr-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-200/60 bg-white cursor-pointer inline-flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {agentFilter.length === 0
                        ? "Të gjitha agjencitë"
                        : agentFilter.length === 1
                          ? ((agents as any[]).find((a: any) => String(a.id) === agentFilter[0])?.name || "1 agjenci")
                          : `${agentFilter.length} agjenci`}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[280px] p-0">
                  <Command>
                    <CommandInput placeholder="Kërko agjenci..." />
                    <CommandList className="max-h-72">
                      <CommandEmpty>Nuk u gjet asnjë agjenci.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="te gjitha agjencite"
                          onSelect={() => setAgentFilter([])}
                          className="font-medium"
                        >
                          <span className="w-4 h-4 mr-2 rounded border border-slate-300 flex items-center justify-center">
                            {agentFilter.length === 0 && <Check className="w-3 h-3 text-blue-600" />}
                          </span>
                          Të gjitha agjencitë
                        </CommandItem>
                        {(agents as any[]).map((a: any) => {
                          const id = String(a.id);
                          const selected = agentFilter.includes(id);
                          return (
                            <CommandItem
                              key={a.id}
                              value={`${a.name} ${id}`}
                              onSelect={() => setAgentFilter(prev =>
                                prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                              )}
                            >
                              <span className="w-4 h-4 mr-2 rounded border border-slate-300 flex items-center justify-center">
                                {selected && <Check className="w-3 h-3 text-blue-600" />}
                              </span>
                              <span className="truncate">{a.name}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}

            <div className="relative">
              <select
                value={paymentFilter}
                onChange={e => setPaymentFilter(e.target.value as "" | "paid" | "partial" | "unpaid")}
                className="h-9 pl-3 pr-8 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-200/60 appearance-none bg-white cursor-pointer"
                aria-label="Filtro sipas pagesës"
              >
                <option value="">Të gjitha pagesat</option>
                <option value="paid">Paid</option>
                <option value="partial">Partially Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {canAdvFilters && (
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className={`h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors border ${filtersOpen ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-700 hover:bg-slate-50 border-slate-200/60"}`}
            >
              <Filter className="w-3.5 h-3.5" /> Më shumë
            </button>
            )}

            {/* Numëruesit e biletave nga emaili (kliko për të filtruar) */}
            {(unsentTicketCount > 0 || unsentTicketFilter) && (
              <button
                onClick={() => setUnsentTicketFilter(v => !v)}
                className={`h-7 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ring-1 transition-colors tabular-nums ${
                  unsentTicketFilter
                    ? "bg-red-600 text-white ring-red-600"
                    : "bg-red-100 text-red-700 ring-red-300 hover:bg-red-200"
                }`}
                title="Rezervime të biletuara, por emaili nuk i është dërguar ende agjentit"
              >
                <Mail className="w-3 h-3" /> Bileta pa Dërguar: {unsentTicketCount}
              </button>
            )}

            {/* Numëruesit e biletave të gjetura nga inbox-i Wizz (kliko për të filtruar) */}
            {(emailTicketCounts.withoutEmail > 0 || emailTicketCounts.withEmail > 0 || emailTicketFilter) && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEmailTicketFilter(f => f === "without" ? "" : "without")}
                  className={`h-7 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ring-1 transition-colors tabular-nums ${
                    emailTicketCounts.withoutEmail > 1
                      ? emailTicketFilter === "without"
                        ? "bg-red-600 text-white ring-red-600"
                        : "bg-red-100 text-red-700 ring-red-200 hover:bg-red-200"
                      : emailTicketCounts.withoutEmail === 0
                        ? emailTicketFilter === "without"
                          ? "bg-emerald-600 text-white ring-emerald-600"
                          : "bg-emerald-100 text-emerald-700 ring-emerald-200 hover:bg-emerald-200"
                        : emailTicketFilter === "without"
                          ? "bg-slate-600 text-white ring-slate-600"
                          : "bg-slate-100 text-slate-500 ring-slate-200 hover:bg-slate-200"
                  }`}
                  title="Totali në gjithë sistemin: bileta Wizz ende PA email — kliko për të shfaqur të gjitha këto"
                >
                  <Ticket className="w-3 h-3" /> Pa Email: {emailTicketCounts.withoutEmail}
                </button>
                <button
                  onClick={() => setEmailTicketFilter(f => f === "with" ? "" : "with")}
                  className={`h-7 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ring-1 transition-colors tabular-nums ${
                    emailTicketFilter === "with"
                      ? "bg-pink-600 text-white ring-pink-600"
                      : "bg-pink-100 text-pink-700 ring-pink-200 hover:bg-pink-200"
                  }`}
                  title="Totali në gjithë sistemin: bileta të gjetura nga emaili — kliko për të shfaqur të gjitha këto"
                >
                  <Ticket className="w-3 h-3" /> Me Email: {emailTicketCounts.withEmail}
                </button>
              </div>
            )}

            {/* Njoftimet e ndryshimit të fluturimit nga emaili (kliko për të filtruar) */}
            {(alertCount > 0 || alertFilter) && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setAlertFilter(f => f === "with" ? "" : "with")}
                  className={`h-7 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ring-1 transition-colors tabular-nums ${
                    alertFilter === "with"
                      ? "bg-red-600 text-white ring-red-600"
                      : "bg-red-100 text-red-700 ring-red-200 hover:bg-red-200"
                  }`}
                  title="Rezervime me njoftim ndryshimi fluturimi nga emaili — kliko për të shfaqur vetëm këto"
                >
                  <Siren className="w-3 h-3" /> Me Njoftim: {alertCount}
                </button>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              {hasTextSearch && (
                <span className="text-[11px] text-blue-600 font-medium">Kërkim në gjithë sistemin (filtrat e datës/agjentit/statusit anashkalohen)</span>
              )}
              {canExport && (
              <div className="relative">
                <button
                  onClick={() => setExportMenuOpen(o => !o)}
                  disabled={matchingCount === 0 || exportBusy || isFetching || isLoading}
                  className="h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors border bg-white text-slate-700 hover:bg-slate-50 border-slate-200/60 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Shkarko listën e filtruar"
                >
                  <Download className="w-3.5 h-3.5" /> {exportBusy ? "Duke përgatitur…" : "Shkarko"}
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {exportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 w-52 rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden">
                      <div className="px-3 py-2 text-[11px] text-slate-400 font-semibold border-b border-slate-100">
                        {matchingCount} rezervime (filtruar)
                      </div>
                      <button
                        onClick={() => void runExport("excel")}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 transition-colors"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Shkarko Excel
                      </button>
                      <button
                        onClick={() => void runExport("pdf")}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-rose-50 transition-colors border-t border-slate-100"
                      >
                        <FileText className="w-4 h-4 text-rose-600" /> Shkarko PDF
                      </button>
                    </div>
                  </>
                )}
              </div>
              )}
              {canViewTotalCount && (
              <span className="text-[11px] text-slate-400 font-medium">
                {isLoading ? "Duke ngarkuar…" : hasActiveFilters
                  ? `${filteredCount} nga ${totalCount} rezervime`
                  : `${totalCount} rezervime gjithsej`}
              </span>
              )}
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-[11px] text-blue-600 font-semibold hover:underline">
                  Pastro
                </button>
              )}
            </div>
          </div>

          {filtersOpen && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              {/* Quick date presets */}
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/60 rounded-lg p-0.5">
                {([
                  ["today",  "Sot",        () => { const t = format(new Date(), "yyyy-MM-dd"); setDateFrom(t); setDateTo(t); }],
                  ["yest",   "Dje",        () => { const y = format(new Date(Date.now() - 864e5), "yyyy-MM-dd"); setDateFrom(y); setDateTo(y); }],
                  ["7d",     "7 ditët",    () => { setDateFrom(format(new Date(Date.now() - 6*864e5), "yyyy-MM-dd")); setDateTo(format(new Date(), "yyyy-MM-dd")); }],
                  ["30d",    "30 ditët",   () => { setDateFrom(format(new Date(Date.now() - 29*864e5), "yyyy-MM-dd")); setDateTo(format(new Date(), "yyyy-MM-dd")); }],
                  ["all",    "Të gjitha",  () => { setDateFrom(""); setDateTo(""); }],
                  ["custom", "Periudhë…",  () => {}],
                ] as const).map(([key, label, fn]) => {
                  const today = format(new Date(), "yyyy-MM-dd");
                  const yest = format(new Date(Date.now() - 864e5), "yyyy-MM-dd");
                  const d7 = format(new Date(Date.now() - 6*864e5), "yyyy-MM-dd");
                  const d30 = format(new Date(Date.now() - 29*864e5), "yyyy-MM-dd");
                  const active =
                    (key === "today" && dateFrom === today && dateTo === today) ||
                    (key === "yest"  && dateFrom === yest  && dateTo === yest) ||
                    (key === "7d"    && dateFrom === d7    && dateTo === today) ||
                    (key === "30d"   && dateFrom === d30   && dateTo === today) ||
                    (key === "all"   && !dateFrom && !dateTo);
                  const isActive = key === "custom" ? showCustomRange : active && !customRange;
                  return (
                    <button
                      key={key}
                      onClick={() => { setCustomRange(key === "custom"); fn(); }}
                      className={`px-2.5 h-7 rounded-md text-[11px] font-semibold transition-colors ${isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 border rounded-lg px-3 h-9 bg-slate-50 border-slate-200/60 min-w-[160px]">
                <span className="text-[10px] font-mono text-slate-500 shrink-0">PNR</span>
                <input
                  placeholder="Kodi PNR…"
                  value={pnrSearch}
                  onChange={e => setPnrSearch(e.target.value)}
                  className="bg-transparent outline-none w-full text-sm placeholder:text-slate-400 font-mono"
                />
                {pnrSearch && <button onClick={() => setPnrSearch("")}><X className="w-3 w-3 text-slate-400 hover:text-slate-600" /></button>}
              </div>
              <div className="flex items-center gap-1.5 border rounded-lg px-3 h-9 bg-slate-50 border-slate-200/60 min-w-[180px]">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  placeholder="Fluturimi, Rruga (MXP-TIA)…"
                  value={flightSearch}
                  onChange={e => setFlightSearch(e.target.value)}
                  className="bg-transparent outline-none w-full text-sm placeholder:text-slate-400"
                />
                {flightSearch && <button onClick={() => setFlightSearch("")}><X className="w-3 h-3 text-slate-400 hover:text-slate-600" /></button>}
              </div>
              <DatePicker
                value={flightDateFrom}
                placeholder="Fluturimi nga…"
                onChange={v => { setFlightDateFrom(v); if (flightDateTo && v > flightDateTo) setFlightDateTo(v); }}
                className="w-40"
              />
              <DatePicker
                value={flightDateTo}
                placeholder="Fluturimi deri…"
                min={flightDateFrom || undefined}
                onChange={v => setFlightDateTo(v)}
                className="w-40"
              />
              {(flightDateFrom || flightDateTo) && (
                <button onClick={() => { setFlightDateFrom(""); setFlightDateTo(""); }} className="text-[11px] text-slate-500 hover:text-slate-800 underline shrink-0">
                  Hiq periudhën
                </button>
              )}
              {showCustomRange && <>
              <DatePicker
                value={dateFrom}
                placeholder="Rezervuar nga…"
                onChange={v => { setDateFrom(v); if (dateTo && v > dateTo) setDateTo(v); }}
                className="w-40"
              />
              <DatePicker
                value={dateTo}
                placeholder="Rezervuar deri…"
                min={dateFrom || undefined}
                onChange={v => setDateTo(v)}
                className="w-40"
              />
              </>}
            </div>
          )}
        </div>

        {/* Active filter chips */}
        {(statusFilter || agentFilter.length > 0 || paymentFilter) && (
          <div className="flex items-center gap-1.5 px-1 flex-wrap">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Filtra:</span>
            {statusFilter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-100">
                Statusi: {STATUS_STYLES[statusFilter]?.label || statusFilter}
                <button onClick={() => setStatusFilter("")} className="text-blue-400 hover:text-blue-600">×</button>
              </span>
            )}
            {agentFilter.map(agentId => (
              <span key={agentId} className="inline-flex items-center gap-1.5 px-2 py-1 bg-violet-50 text-violet-700 text-xs font-medium rounded-md border border-violet-100">
                Agjent: {(agents as any[]).find((a: any) => String(a.id) === agentId)?.name || agentId}
                <button onClick={() => setAgentFilter(prev => prev.filter(id => id !== agentId))} className="text-violet-400 hover:text-violet-600">×</button>
              </span>
            ))}
            {paymentFilter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-md border border-emerald-100">
                Pagesa: {paymentFilter === "paid" ? "Paid" : paymentFilter === "partial" ? "Partially Paid" : "Unpaid"}
                <button onClick={() => setPaymentFilter("")} className="text-emerald-500 hover:text-emerald-700">×</button>
              </span>
            )}
          </div>
        )}

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-slate-500 text-sm">Duke ngarkuar…</div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              {hasActiveFilters ? "Nuk ka rezervime me këto kritere." : "Nuk ka rezervime."}
            </div>
          ) : pagedBookings.map((b: any) => {
            const s = STATUS_STYLES[b.status] || STATUS_STYLES.draft;
            const px = (b.passengers || []).find((x: any) => x.type !== "infant") || (b.passengers || [])[0];
            const clientName = px ? `${px.firstName} ${px.lastName}`.trim() : b.customerName;
            const comm = Number(b.commissionAmount ?? 0);
            return (
              <div key={b.id} className={`rounded-2xl border p-3 shadow-sm space-y-2 ${isFlightSoon(b.flight?.departureDate) && b.status !== "cancelled" ? "bg-red-100/60 border-red-200" : "bg-white border-slate-200/80"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <button onClick={() => openBooking(b.id)} style={agencyColors.get(b.agentId)} className="font-mono text-xs font-bold text-blue-700 hover:underline shrink-0">{b.bookingRef}</button>
                    {bookingPnrList(b).length > 0 && <span className="font-mono text-[10px] text-slate-500 truncate">{bookingPnrList(b).join(" / ")}</span>}
                    {typeof b.notes === "string" && b.notes.includes("[MBISHITJE") && (
                      <span className="inline-flex items-center px-1.5 h-4 bg-red-600 text-white text-[9px] font-bold rounded shrink-0 animate-pulse" title="Rezervim i importuar MBI kapacitetin e fluturimit">MBISHITJE</span>
                    )}
                    {taskCounts[String(b.id)] > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1 h-4 bg-violet-600 text-white text-[10px] font-bold rounded shrink-0" title={`${taskCounts[String(b.id)]} detyrë aktive e lidhur`}>
                        <CheckSquare className="w-2.5 h-2.5" /> {taskCounts[String(b.id)]}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${s.bg} ${s.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {s.label}
                      </span>
                      <ScheduleAlertBadge booking={b} size="xs" />
                      {b.ticketEmailPending && <TicketEmailPendingBadge size="xs" />}
                      <TicketFoundBadge booking={b} size="xs" />
                      <BookingNotesBadge booking={b} size="xs" />
                    </div>
                    <TicketDeadlineBadge createdAt={b.createdAt} status={b.status} size="xs" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{clientName}</div>
                    <div className="text-xs text-slate-500">
                      {b.flight?.fromCity} → {b.flight?.toCity}
                      {b.flight?.isConfirmed && (
                        <span className="ml-1 text-sm leading-none" title="Fluturim i Konfirmuar" aria-label="Fluturim i Konfirmuar">⭐</span>
                      )}
                      {b.flight?.departureDate && (
                        <span className="ml-1">· {format(new Date(b.flight.departureDate + "T00:00:00"), "dd MMM")}</span>
                      )}
                      <span className="ml-1 font-semibold text-slate-600">
                        · {(b.passengers || []).filter((p: any) => p.type !== "infant" && !p.cancelled).length} pax
                      </span>
                    </div>
                    {b.createdAt && (
                      <div className="text-[11px] text-slate-400">
                        Rezervuar: <span className={isToday(new Date(b.createdAt)) ? "text-emerald-600 font-semibold" : undefined}>{format(new Date(b.createdAt), "dd MMM yyyy")}</span>
                      </div>
                    )}
                    {(b.passengers || []).some((p: any) => p.hasPriorityBoarding) && (
                      <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold ring-1 ring-amber-200 leading-none" title="Ka priority boarding (10kg)">
                        <Backpack className="w-3 h-3" /> PRIORITY
                      </span>
                    )}
                    {b.agentId && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                        <AgentRankBadge agentName={b.agentName} />
                        <span style={agencyColors.get(b.agentId)}>{b.agentName || `Agjent #${b.agentId}`}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    {(() => {
                      const displayDue = dueEuro(b.dueAmount);
                      const fullyPaid = displayDue <= 0 && Number(b.paidAmount ?? 0) > 0 && b.status !== "cancelled";
                      return (
                        <div className="flex items-center justify-end gap-1.5">
                          {comm !== 0 && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 ${comm > 0 ? "bg-emerald-100 text-emerald-700 ring-emerald-200" : "bg-rose-100 text-rose-700 ring-rose-200"}`} title="Komision">{comm > 0 ? "+" : "−"}€{fmt(Math.abs(comm))}</span>
                          )}
                          <span className={`text-sm font-bold ${fullyPaid ? "inline-flex items-center rounded-md bg-[#00b050] px-1 py-0 text-white" : "text-slate-900"}`}>€{fmt(b.totalAmount)}</span>
                        </div>
                      );
                    })()}
                    {dueEuro(b.dueAmount) > 0 ? (
                      <div className="text-[11px] text-rose-600 font-semibold">−€{fmt(dueEuro(b.dueAmount))}</div>
                    ) : (
                      <div className="text-[11px] text-emerald-600 font-bold">✓</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Premium table (desktop) */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table ref={resizeTable.ref}
              style={resizeTable.sizes ? { tableLayout: "fixed", width: Object.values(resizeTable.sizes).reduce((sum, width) => sum + width, 40) } : undefined}
              className="min-w-full w-max text-sm whitespace-nowrap [&_td]:overflow-hidden">
              {resizeTable.sizes && <colgroup>
                {columnState.columns.map(column => <col key={column.k} style={{ width: resizeTable.sizes![column.k] }} />)}
                <col style={{ width: 40 }} />
              </colgroup>}
              <thead>
                <tr className="bg-slate-50/80 border-b-2 border-slate-300">
                  {columnState.columns.map(({ k, label, align }) => {
                    const active = sortBy === k;
                    const financial = align === "text-right";
                    const financialWidth = resizeTable.sizes?.[k] ?? BOOKING_FINANCIAL_WIDTHS[k];
                    const compact = ["date", "ref", "pnr", "flightDate", "flightTime", "pax"].includes(k);
                    return (
                      <th key={k}
                        style={financialWidth ? { width: financialWidth, minWidth: financialWidth, maxWidth: financialWidth } : undefined}
                        className={`relative overflow-hidden ${align} ${compact ? "w-px " : ""}px-2 py-1 text-[10px] uppercase font-semibold ${active ? "text-blue-700" : "text-slate-500"}`}>
                        <button
                          type="button"
                          onClick={() => toggleSort(k)}
                          className={`inline-flex max-w-full overflow-hidden items-center gap-1 uppercase hover:text-blue-700 transition-colors ${financial ? "justify-end tracking-normal" : "tracking-widest"}`}
                          title={active ? (sortDir === "asc" ? "Renditur rritëse — kliko për zbritëse" : "Renditur zbritëse — kliko për ta hequr") : `Rendit sipas "${label}"`}
                        >
                          {label}
                          {active
                            ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                            : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                        </button>
                        <BookingColumnResize label={label} disabled={columnState.disabled} onResize={width => columnState.resize(k, width)} />
                      </th>
                    );
                  })}
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading || columnState.loading ? (
                  <tr><td colSpan={columnState.columns.length + 1} className="whitespace-normal text-center py-10 text-slate-500">Duke ngarkuar…</td></tr>
                ) : bookings.length === 0 ? (
                  <tr><td colSpan={columnState.columns.length + 1} className="whitespace-normal text-center py-12 text-slate-500">
                    {hasActiveFilters ? "Nuk ka rezervime me këto kritere." : "Nuk ka rezervime."}
                  </td></tr>
                ) : pagedBookings.map((b: any) => {
                  const s = STATUS_STYLES[b.status] || STATUS_STYLES.draft;
                  const createdAt = new Date(b.createdAt);
                  const t = isToday(createdAt);
                  const px = (b.passengers || []).find((x: any) => x.type !== "infant") || (b.passengers || [])[0];
                  const clientName = px ? `${px.firstName} ${px.lastName}`.trim() : b.customerName;
                  const paxCount = (b.passengers || []).filter((p: any) => p.type !== "infant" && !p.cancelled).length;
                  const infCount = (b.passengers || []).filter((p: any) => p.type === "infant").length;
                  const bagCount = (b.passengers || []).filter((p: any) => p.baggageOption === "checked").length;
                  const total = Number(b.totalAmount ?? 0);
                  const paid = Number(b.paidAmount ?? 0);
                  const due = dueEuro(b.dueAmount);
                  const comm = Number(b.commissionAmount ?? 0);
                  const netoRaw = Number(b.netPrice ?? 0);
                  const hasNeto = netoRaw > 0;
                  const fullyPaid = due <= 0 && paid > 0 && b.status !== "cancelled";
                  const stripe = { boxShadow: `inset 4px 0 0 ${STATUS_STRIPE[b.status] || STATUS_STRIPE.draft}` };
                  const firstCol = columnState.columns.find(c => isColumnVisible(c.k))?.k;
                  const stripeFor = (k: string) => (k === firstCol ? stripe : undefined);
                  return (
                    <tr key={b.id} className={`border-b border-slate-300 hover:bg-slate-50/60 group transition-colors ${b.status === "cancelled" ? "!bg-slate-50 line-through text-black [&_*]:line-through [&_*]:!text-black [&_.cx-anuluar]:!text-red-600 [&_.cx-anuluar]:!no-underline" : isFlightSoon(b.flight?.departureDate) ? "!bg-red-100/60 hover:!bg-red-100/80" : ""}`}>
                      <td hidden={!isColumnVisible("date")} style={stripeFor("date")} className="w-px px-2 py-1 align-middle">
                        <div className="flex flex-col leading-tight">
                          <span className={`text-[13px] font-semibold ${t ? "text-emerald-600" : "text-slate-900"}`}>{format(createdAt, "dd MMM yyyy")}</span>
                        </div>
                      </td>
                      <td hidden={!isColumnVisible("ref")} style={stripeFor("ref")} className="w-px px-2 py-1 align-middle">
                        <div className="flex flex-col gap-0.5 items-start">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => openBooking(b.id)}
                              className="relative inline-flex items-center font-mono text-[13px] font-bold bg-gradient-to-b from-white to-slate-50 border border-slate-200 hover:border-blue-400 hover:from-blue-50 hover:to-white px-2 py-0.5 rounded-md shadow-sm hover:shadow transition-all tracking-tight"
                              title="Hap rezervimin"
                            >
                              <span style={agencyColors.get(b.agentId)} className="bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">{b.bookingRef}</span>
                            </button>
                            {typeof b.notes === "string" && b.notes.includes("[MBISHITJE") && (
                              <span className="inline-flex items-center px-1.5 h-4 bg-red-600 text-white text-[9px] font-bold rounded animate-pulse" title="Rezervim i importuar MBI kapacitetin e fluturimit">MBISHITJE</span>
                            )}
                            {b.pendingPriceRequests > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1 h-4 bg-orange-500 text-white text-[10px] font-bold rounded animate-pulse">
                                <MessageSquare className="w-2.5 h-2.5" /> {b.pendingPriceRequests}
                              </span>
                            )}
                            {taskCounts[String(b.id)] > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1 h-4 bg-violet-600 text-white text-[10px] font-bold rounded" title={`${taskCounts[String(b.id)]} detyrë aktive e lidhur`}>
                                <CheckSquare className="w-2.5 h-2.5" /> {taskCounts[String(b.id)]}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td hidden={!isColumnVisible("pnr")} style={stripeFor("pnr")} className="w-px px-2 py-1 align-middle">
                        <div className="flex flex-col gap-0.5 items-start">
                          {(() => {
                            const pnrs = bookingPnrList(b);
                            return pnrs.length > 0 ? (
                            <span
                              className="relative inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-emerald-800 bg-gradient-to-b from-emerald-50 to-emerald-100/70 border border-emerald-300 pl-1.5 pr-2 py-0.5 rounded-md shadow-sm tracking-wider"
                              title="PNR e leshuar"
                            >
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              <span>{pnrs.join(" / ")}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-gradient-to-b from-rose-50 to-rose-100/70 border border-rose-200 px-2 py-0.5 rounded-md shadow-sm tracking-wide">
                              <span className="w-1 h-1 rounded-full bg-rose-400" />
                              NOT ISSUED
                            </span>
                          );
                          })()}
                        </div>
                      </td>
                      <td hidden={!isColumnVisible("klienti")} style={stripeFor("klienti")} className="px-2 py-1 align-middle">
                        <div className="font-medium text-slate-900 text-[14px]">{clientName || "—"}</div>
                      </td>
                      <td hidden={!isColumnVisible("agjencia")} style={stripeFor("agjencia")} className="px-2 py-1 align-middle">
                        {b.agentId && b.agentName ? (
                          <div className="flex items-center gap-2">
                            <span style={agencyColors.get(b.agentId)} className="text-[14px] font-medium text-slate-700 truncate max-w-[140px]">{b.agentName}</span>
                            <AgentRankBadge agentName={b.agentName} />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td hidden={!isColumnVisible("fluturimi")} style={stripeFor("fluturimi")} className="px-2 py-1 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900 text-[14px]">{b.flight?.fromCity || "—"}-{b.flight?.toCity || "—"}</span>
                          {b.flight?.isConfirmed && (
                            <span className="text-sm leading-none" title="Fluturim i Konfirmuar" aria-label="Fluturim i Konfirmuar">⭐</span>
                          )}
                        </div>
                      </td>
                      <td hidden={!isColumnVisible("flightDate")} style={stripeFor("flightDate")} className="w-px px-2 py-1 align-middle text-[11px] text-slate-500">
                        {b.flight?.departureDate ? format(new Date(b.flight.departureDate + "T00:00:00"), "dd.MM.yyyy") : "—"}
                      </td>
                      <td hidden={!isColumnVisible("flightTime")} style={stripeFor("flightTime")} className="w-px px-2 py-1 align-middle font-mono text-[11px] text-slate-500">
                        {b.flight?.departureTime ? fmtAmPm(b.flight.departureTime) : "—"}
                      </td>
                      <td hidden={!isColumnVisible("pax")} style={stripeFor("pax")} className="w-px px-2 py-1 text-left align-middle">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-800 tabular-nums">{paxCount}</span>
                          {bagCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500" title={`${bagCount} bagazh 20kg`}>
                              <span className="text-[15px] leading-none" aria-hidden="true">🧳</span>{bagCount > 1 && bagCount}
                            </span>
                          )}
                          {infCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500" title={`${infCount} foshnjë (infant)`}>
                              <span className="text-[15px] leading-none" aria-hidden="true">👶</span>{infCount > 1 && infCount}
                            </span>
                          )}
                          {(b.passengers || []).some((p: any) => p.hasPriorityBoarding) && (
                            <span className="text-[15px] leading-none" title="Priority boarding (10kg)">🎒</span>
                          )}
                        </div>
                      </td>
                      <td hidden={!isColumnVisible("financa")} style={stripeFor("financa")} className="w-px px-2 py-1 align-middle text-right tabular-nums">
                        <span className="font-bold text-[14px] text-slate-900">€{fmt(total)}</span>
                      </td>
                      <td hidden={!isColumnVisible("neto")} style={stripeFor("neto")} className="w-px px-2 py-1 align-middle text-right tabular-nums">
                        {hasNeto ? <span className="font-semibold text-slate-700">€{fmt(netoRaw)}</span> : <span className="text-slate-400 italic">—</span>}
                      </td>
                      {canCommissionCol && (
                        <td hidden={!isColumnVisible("commission")} style={stripeFor("commission")} className="w-px px-2 py-1 align-middle text-right tabular-nums">
                          {comm !== 0 ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 ${comm > 0 ? "bg-emerald-100 text-emerald-700 ring-emerald-200" : "bg-rose-100 text-rose-700 ring-rose-200"}`} title="Komision">{comm > 0 ? "+" : "−"}€{fmt(Math.abs(comm))}</span>
                          ) : <span className="text-slate-400">€0</span>}
                        </td>
                      )}
                      <td hidden={!isColumnVisible("paid")} style={stripeFor("paid")} className="w-px px-2 py-1 align-middle text-right tabular-nums font-semibold">
                        {fullyPaid
                          ? <span className="inline-flex items-center rounded-md bg-[#00b050] px-1.5 py-0 text-white font-bold">€{fmt(paid)}</span>
                          : <span className="text-emerald-600">€{fmt(paid)}</span>}
                      </td>
                      <td hidden={!isColumnVisible("due")} style={stripeFor("due")} className="w-px px-2 py-1 align-middle text-right tabular-nums">
                        {due > 0 ? <span className="text-rose-600 font-bold">€{fmt(due)}</span> : <span className="text-slate-400 font-semibold">€0</span>}
                      </td>
                      <td hidden={!isColumnVisible("credit")} style={stripeFor("credit")} className="w-px px-2 py-1 align-middle text-right tabular-nums">
                        {Number(b.creditAmount) > 0 ? <span className="text-blue-600 font-semibold">+€{fmt(b.creditAmount)}</span> : <span className="text-slate-400">—</span>}
                      </td>
                      <td hidden={!isColumnVisible("statusi")} style={stripeFor("statusi")} className="px-2 py-1 align-middle">
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/bookings/${b.id}`}>
                              <span className={`cx-anuluar inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold cursor-pointer ${s.bg} ${s.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                {s.label}
                              </span>
                            </Link>
                            <ScheduleAlertBadge booking={b} />
                            {b.ticketEmailPending && <TicketEmailPendingBadge />}
                            <TicketFoundBadge booking={b} />
                            <BookingNotesBadge booking={b} />
                          </div>
                          <TicketDeadlineBadge createdAt={b.createdAt} status={b.status} />
                        </div>
                      </td>
                      <td className="px-2 py-1 align-middle">
                        <button onClick={() => openBooking(b.id)} className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer / pagination */}
          {(totalPages > 1 || !loadAll) && (
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50/40 border-t border-slate-200/80">
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>Faqe <span className="font-semibold text-slate-700">{page}</span> nga <span className="font-semibold text-slate-700">{totalPages}</span></span>
                <span className="text-slate-300">•</span>
                <span><span className="font-semibold text-slate-700">{filteredCount}</span> rezervime{!loadAll ? " (vetëm sot)" : ""}</span>
              </div>
              <div className="flex items-center gap-1">
                {!loadAll && (
                  <button
                    onClick={() => setShowAll(true)}
                    disabled={isFetching}
                    className="h-8 px-3 rounded-lg text-xs font-medium text-violet-700 hover:bg-white border border-violet-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {isFetching ? "Duke ngarkuar…" : "Shfaq të gjitha"}
                  </button>
                )}
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-8 px-3 rounded-lg text-xs font-medium text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Më parë
                </button>
                <span className="text-xs font-semibold text-slate-700 px-2 tabular-nums">{page} / {totalPages}</span>
                <button
                  onClick={() => {
                    if (!loadAll && page >= totalPages) { setShowAll(true); return; }
                    setPage(p => Math.min(totalPages, p + 1));
                  }}
                  disabled={loadAll ? page === totalPages : false}
                  className="h-8 px-3 rounded-lg text-xs font-medium text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  Më pas <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Money summary footer */}
        {pagedBookings.length > 0 && (
          <div className="hidden md:flex bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 rounded-2xl p-4 items-center justify-between text-white shadow-xl shadow-slate-900/10 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-blue-500/20 to-transparent" />
            <div className="flex items-center gap-6 relative">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
                <CircleDollarSign className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-blue-200 font-semibold">Total i Faqes</div>
                <div className="text-xl font-bold tabular-nums tracking-tight">€{fmt(pageSummary.total)}</div>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-emerald-200 font-semibold">Paguar</div>
                <div className="text-xl font-bold tabular-nums tracking-tight">€{fmt(pageSummary.paid)}</div>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-rose-200 font-semibold">Detyrim</div>
                <div className="text-xl font-bold tabular-nums tracking-tight">€{fmt(pageSummary.due)}</div>
              </div>
              {canCommissionCol && (
                <>
                  <div className="w-px h-10 bg-white/10" />
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-violet-200 font-semibold">Komisioni</div>
                    <div className={`text-xl font-bold tabular-nums tracking-tight ${pageSummary.comm < 0 ? "text-rose-300" : ""}`}>{pageSummary.comm < 0 ? "−" : ""}€{fmt(Math.abs(pageSummary.comm))}</div>
                  </div>
                </>
              )}
            </div>
            <div className="relative text-right text-[11px] text-blue-200">
              <div>{pagedActiveCount} rezervime në faqe</div>
              <div className="text-blue-300/70">nga {filteredCount} të filtruara</div>
            </div>
          </div>
        )}
      </div>

      {/* Booking detail dialog */}
      <Dialog
        open={selectedBookingId !== null}
        onOpenChange={(open) => {
          if (!open && canCloseBookingDetail()) setSelectedBookingId(null);
        }}
      >
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[96vh] overflow-y-auto p-0 [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Rezervimi</DialogTitle>
          </DialogHeader>
          {selectedBookingId && (
            <BookingDetailPremium bookingId={selectedBookingId} inDialog onClose={() => setSelectedBookingId(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
