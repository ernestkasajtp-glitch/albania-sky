import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Plus, Search, X, Filter, ChevronLeft, ChevronRight, ChevronDown,
  ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown, ArrowUpDown,
  TrendingUp, Users, CreditCard, CircleDollarSign, AlertCircle, MoreHorizontal,
  Download, FileSpreadsheet, FileText, Check, CalendarIcon,
  Columns3, ClipboardList, Banknote, Percent, FileClock,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Link } from "./Layout";
import { useResizableBookingTable, BookingColumnResize } from "./TableSizing";
import { TicketDeadlineBadge } from "./TicketDeadlineBadge";
import { agents, bookings, TODAY, BOOKING_COLUMNS, BOOKING_FINANCIAL_WIDTHS, type SortKey } from "./data";

// pages/bookings-premium.tsx STATUS_STYLES, verbatim.
const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  draft:      { bg: "bg-slate-100",   text: "text-slate-700",   dot: "bg-slate-400",   label: "Draft" },
  pending:    { bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-500",   label: "Pritje" },
  confirmed:  { bg: "bg-blue-50",     text: "text-blue-700",    dot: "bg-blue-500",    label: "Konfirmuar" },
  ticketed:   { bg: "bg-[#00b050]",   text: "text-white",       dot: "bg-white",       label: "Ticketed" },
  cancelled:  { bg: "bg-rose-50",     text: "text-rose-700",    dot: "bg-rose-500",    label: "Anuluar" },
};
// lib/utils.ts fmtM and fmtAmPm: source intentionally shows whole euros without
// grouping separators and keeps flight times in 24-hour format despite the name.
const fmt = (n: number) => String(Math.round(Number(n ?? 0)));
const fmtAmPm = (t: string) => String(t).trim();

// pages/bookings-premium.tsx lines 58–82, unchanged StatCard JSX/classes.
function StatCard({ label, value, delta, deltaDir, icon: Icon, accent }: {
  label: string; value: string; delta?: string; deltaDir?: "up" | "down" | "flat";
  icon: typeof Users; accent: string;
}) {
  const deltaCls = deltaDir === "up" ? "text-emerald-600 bg-emerald-50"
    : deltaDir === "down" ? "text-rose-600 bg-rose-50"
    : "text-slate-500 bg-slate-100";
  const DeltaIcon = deltaDir === "up" ? ArrowUpRight : deltaDir === "down" ? ArrowDownRight : TrendingUp;
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 hover:shadow-md hover:border-slate-300 transition-all group relative overflow-hidden">
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${accent} opacity-[0.08] group-hover:opacity-[0.14] transition-opacity`} />
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center shadow-sm`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        {delta && (
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${deltaCls}`}>
            <DeltaIcon className="w-3 h-3" /> {delta}
          </span>
        )}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{value}</div>
    </div>
  );
}

// ui/date-picker.tsx trigger JSX retained at the calendar dependency boundary.
// Native date selection is local only; the full source calendar is out of scope.
function DatePicker({ value, onChange, placeholder, className = "", min }: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string; min?: string;
}) {
  const [open, setOpen] = useState(false);
  const displayValue = value ? format(new Date(value + "T00:00:00"), "dd / MM / yyyy") : null;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className={cn("group flex h-10 w-full items-center gap-2.5 rounded-xl border border-input bg-background px-3.5 text-sm shadow-sm transition-all duration-150 hover:border-blue-400 hover:shadow-md hover:shadow-blue-100/60 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:ring-offset-1", open && "border-blue-500 ring-2 ring-blue-400/30 shadow-md shadow-blue-100", className)}>
        <CalendarIcon className={`h-4 w-4 shrink-0 transition-colors ${open || displayValue ? "text-blue-600" : "text-muted-foreground/60"}`} />
        <span className={`flex-1 text-left font-medium whitespace-nowrap ${displayValue ? "text-foreground" : "text-muted-foreground/70 font-normal"}`}>{displayValue ?? placeholder}</span>
        {displayValue && <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onChange(""); }} onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); onChange(""); } }} className="rounded-full p-0.5 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"><X className="h-3.5 w-3.5" /></span>}
      </button>
    </PopoverTrigger>
    <PopoverContent className="nav-gold-current w-64"><input aria-label={placeholder} type="date" value={value} min={min} onChange={e => { onChange(e.target.value); setOpen(false); }} /></PopoverContent>
  </Popover>;
}

/**
 * Source: pages/bookings-premium.tsx render (lines 460–1287).
 * Stub boundary: premium query, agent query, task badges, column persistence,
 * table sizing, auth permissions, export and booking-detail navigation.
 * Default visible state is preserved: all columns/stats, expanded filters, today.
 * Badge children with empty fixture data are omitted; no server hooks imported.
 */
export function BookingsPremium({ goldIcons = false }: { goldIcons?: boolean } = {}) {
  const [search, setSearch] = useState("");
  const [pnrSearch, setPnrSearch] = useState("");
  const [flightSearch, setFlightSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(TODAY);
  const [dateTo, setDateTo] = useState(TODAY);
  const [flightDateFrom, setFlightDateFrom] = useState("");
  const [flightDateTo, setFlightDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState<string[]>([]);
  const [agentFilterOpen, setAgentFilterOpen] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [shown, setShown] = useState<Set<SortKey>>(() => new Set(BOOKING_COLUMNS.map(c => c.k)));
  const columns = BOOKING_COLUMNS.filter(c => shown.has(c.k));
  const [widths, setWidths] = useState<Record<string, number>>({});
  const toggleSort = (key: SortKey) => {
    if (sortBy !== key) { setSortBy(key); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortBy(null);
  };
  const hasActiveFilters = !!(search || pnrSearch || flightSearch || flightDateFrom || flightDateTo || dateFrom || dateTo || statusFilter || agentFilter.length || paymentFilter);
  const clearFilters = () => {
    setSearch(""); setPnrSearch(""); setFlightSearch(""); setFlightDateFrom(""); setFlightDateTo("");
    setDateFrom(""); setDateTo(""); setStatusFilter(""); setAgentFilter([]); setPaymentFilter("");
  };
  const loadAll = showAll || !!(search || pnrSearch || flightSearch || statusFilter || agentFilter.length || paymentFilter) || dateFrom !== TODAY || dateTo !== TODAY;
  const periodLabel = dateFrom === TODAY && dateTo === TODAY ? "sot" : !dateFrom && !dateTo ? "gjithë" : `${dateFrom.slice(8)}/${dateFrom.slice(5, 7)}–${dateTo.slice(8)}/${dateTo.slice(5, 7)}`;
  const pagedBookings = useMemo(() => {
    const rows = bookings.filter(b =>
      `${b.bookingRef} ${b.customerName} ${b.agentName} ${b.pnr}`.toLowerCase().includes(search.toLowerCase()) &&
      b.pnr.toLowerCase().includes(pnrSearch.toLowerCase()) &&
      `${b.flight.fromCity}-${b.flight.toCity}`.toLowerCase().includes(flightSearch.toLowerCase()) &&
      (!statusFilter || b.status === statusFilter) &&
      (!agentFilter.length || agentFilter.includes(String(b.agentId))) &&
      (!paymentFilter || (paymentFilter === "paid" ? b.dueAmount <= 0 : paymentFilter === "unpaid" ? b.paidAmount === 0 : b.paidAmount > 0 && b.dueAmount > 0)) &&
      (!dateFrom || b.createdAt.slice(0, 10) >= dateFrom) && (!dateTo || b.createdAt.slice(0, 10) <= dateTo) &&
      (!flightDateFrom || b.flight.departureDate >= flightDateFrom) && (!flightDateTo || b.flight.departureDate <= flightDateTo));
    const sortValue = (b: typeof bookings[number], key: SortKey): string | number => ({
      date: b.createdAt, ref: b.bookingRef, pnr: b.pnr, klienti: b.customerName,
      agjencia: b.agentName, fluturimi: b.flight.toCity, flightDate: b.flight.departureDate,
      flightTime: b.flight.departureTime, pax: b.passengers.length, financa: b.totalAmount,
      neto: b.netPrice, commission: b.commissionAmount, paid: b.paidAmount,
      due: b.dueAmount, credit: b.creditAmount, statusi: b.status,
    })[key];
    if (sortBy) rows.sort((a, b) => {
      const av = sortValue(a, sortBy), bv = sortValue(b, sortBy);
      return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))) * (sortDir === "asc" ? 1 : -1);
    });
    return rows;
  }, [search, pnrSearch, flightSearch, statusFilter, agentFilter, paymentFilter, dateFrom, dateTo, flightDateFrom, flightDateTo, sortBy, sortDir]);
  const activeRows = pagedBookings.filter(b => b.status !== "cancelled");
  const resizeTable = useResizableBookingTable(widths, columns.map(c => c.k), pagedBookings);
  const pageSummary = activeRows.reduce((s, b) => ({
    total: s.total + b.totalAmount, paid: s.paid + b.paidAmount,
    due: s.due + b.dueAmount, comm: s.comm + b.commissionAmount,
  }), { total: 0, paid: 0, due: 0, comm: 0 });
  const statusCounts = Object.fromEntries(Object.keys(STATUS_STYLES).map(k => [k, bookings.filter(b => b.status === k).length]));
  const totalCount = bookings.filter(b => b.status !== "cancelled").length;
  const filteredCount = activeRows.length;
  const stats = { periodCount: activeRows.length, periodSales: pageSummary.total, periodProfit: pageSummary.comm, periodPax: activeRows.reduce((s, b) => s + b.passengers.length, 0) };
  const openBooking = () => setNotice("Pamje e izoluar: detajet e rezervimit nuk lidhen me sistemin.");

  return (
    <div className="min-h-full -mx-4 -my-4 md:-mx-6 md:-my-6 px-4 py-4 md:px-6 md:py-6 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 text-slate-900" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      <div className="max-w-[1800px] mx-auto space-y-4 px-2">
        {notice && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{notice}<button className="ml-2 underline" onClick={() => setNotice("")}>Mbyll</button></div>}
        {/* Source page header; the column-picker's persistence is local-only. */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1"><span className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Operacionet</span><span className="text-slate-300">/</span><span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Rezervimet</span></div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">Rezervimet<span className="px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-md border border-blue-100 tabular-nums">{totalCount.toLocaleString()}</span></h1>
            <p className="text-sm text-slate-500 mt-1">Menaxho të gjitha rezervimet, pagesat dhe biletat e fluturimit.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:block"><Popover><PopoverTrigger asChild><button className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border [border-color:var(--button-outline)] shadow-xs active:shadow-none min-h-8 px-3 text-xs"><Columns3 className="h-4 w-4" />Kolonat</button></PopoverTrigger><PopoverContent className="nav-gold-current w-64">
              <div className="space-y-2">{BOOKING_COLUMNS.map(c => <label key={c.k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shown.has(c.k)} disabled={shown.has(c.k) && shown.size === 1} onChange={() => setShown(prev => { const next = new Set(prev); if (next.has(c.k)) next.delete(c.k); else next.add(c.k); return next; })} />{c.label}</label>)}</div>
            </PopoverContent></Popover></div>
            <Link href="/bookings/new"><button onClick={() => setNotice("Pamje e izoluar: krijimi i rezervimit nuk lidhet me sistemin.")} className="h-9 px-3.5 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:from-blue-500 hover:to-indigo-500 flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20"><Plus className="w-4 h-4" /> Rezervim i Ri</button></Link>
          </div>
        </div>
        {/* Source stats lines 497–523; optional preview-only icon substitutions. */}
        <div className="space-y-2"><div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label={`Rezervime ${periodLabel}`} value={String(stats.periodCount)} icon={goldIcons ? ClipboardList : Users} accent="bg-gradient-to-br from-blue-500 to-indigo-600" />
          <StatCard label={`Shitje ${periodLabel}`} value={`€${fmt(stats.periodSales)}`} icon={goldIcons ? Banknote : CreditCard} accent="bg-gradient-to-br from-emerald-500 to-teal-600" />
          <StatCard label={`Profit ${periodLabel}`} value={`€${fmt(stats.periodProfit)}`} icon={goldIcons ? Percent : TrendingUp} accent="bg-gradient-to-br from-violet-500 to-purple-600" />
          <StatCard label={(!dateFrom && !dateTo) ? (search || statusFilter || agentFilter.length ? "Pa paguar (filtruar)" : "Pa paguar (total)") : `Pa paguar (${periodLabel})`} value={`€${fmt(pageSummary.due)}`} icon={goldIcons ? FileClock : AlertCircle} accent="bg-gradient-to-br from-rose-500 to-pink-600" />
          <StatCard label={`Pasagjerë ${periodLabel}`} value={String(stats.periodPax)} icon={Users} accent="bg-gradient-to-br from-sky-500 to-cyan-600" />
        </div></div>
        {/* Source filters lines 525–866. Empty email/alert count branches elided. */}
        <div className="page-filter-panel bg-white rounded-2xl border border-slate-200/80 p-3 shadow-sm space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Kërko klient, agjenci, kod CP, emër/mbiemër, REF, PNR..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-9 pl-9 pr-8 rounded-lg bg-slate-50 border border-slate-200/60 text-sm placeholder:text-slate-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all" />
              {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: "draft", chip: "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200", active: "bg-slate-600 text-white ring-slate-600" },
                { key: "pending", chip: "bg-amber-100 text-amber-700 ring-amber-200 hover:bg-amber-200", active: "bg-amber-500 text-white ring-amber-500" },
                { key: "confirmed", chip: "bg-blue-100 text-blue-700 ring-blue-200 hover:bg-blue-200", active: "bg-blue-600 text-white ring-blue-600" },
                { key: "ticketed", chip: "bg-emerald-100 text-emerald-700 ring-emerald-200 hover:bg-emerald-200", active: "bg-[#00b050] text-white ring-[#00b050]" },
                { key: "cancelled", chip: "bg-rose-100 text-rose-700 ring-rose-200 hover:bg-rose-200", active: "bg-rose-600 text-white ring-rose-600" },
              ] as const).map(s => <button key={s.key} onClick={() => { const activating = statusFilter !== s.key; setStatusFilter(activating ? s.key : ""); if (activating) { setDateFrom(""); setDateTo(""); } }} className={`h-7 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ring-1 transition-colors tabular-nums ${statusFilter === s.key ? s.active : s.chip}`} title={`${STATUS_STYLES[s.key].label}: numri mbi gjithë sistemin (Të gjitha) — kliko për të filtruar, rikliko për t'i hequr filtrin`}>{STATUS_STYLES[s.key].label}: {statusCounts[s.key]}</button>)}
            </div>
            <Popover open={agentFilterOpen} onOpenChange={setAgentFilterOpen}>
              <PopoverTrigger asChild><button type="button" className="h-9 min-w-[180px] max-w-[230px] pl-3 pr-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-200/60 bg-white cursor-pointer inline-flex items-center justify-between gap-2"><span className="truncate">{agentFilter.length === 0 ? "Të gjitha agjencitë" : agentFilter.length === 1 ? agents.find(a => String(a.id) === agentFilter[0])?.name : `${agentFilter.length} agjenci`}</span><ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /></button></PopoverTrigger>
              <PopoverContent align="start" className="nav-gold-current w-[280px] p-0"><Command><CommandInput placeholder="Kërko agjenci..." /><CommandList className="max-h-72"><CommandEmpty>Nuk u gjet asnjë agjenci.</CommandEmpty><CommandGroup>
                <CommandItem value="te gjitha agjencite" onSelect={() => setAgentFilter([])} className="font-medium"><span className="w-4 h-4 mr-2 rounded border border-slate-300 flex items-center justify-center">{agentFilter.length === 0 && <Check className="w-3 h-3 text-blue-600" />}</span>Të gjitha agjencitë</CommandItem>
                {agents.map(a => <CommandItem key={a.id} value={`${a.name} ${a.id}`} onSelect={() => setAgentFilter(prev => prev.includes(String(a.id)) ? prev.filter(x => x !== String(a.id)) : [...prev, String(a.id)])}><span className="w-4 h-4 mr-2 rounded border border-slate-300 flex items-center justify-center">{agentFilter.includes(String(a.id)) && <Check className="w-3 h-3 text-blue-600" />}</span><span className="truncate">{a.name}</span></CommandItem>)}
              </CommandGroup></CommandList></Command></PopoverContent>
            </Popover>
            <div className="relative"><select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="h-9 pl-3 pr-8 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-200/60 appearance-none bg-white cursor-pointer" aria-label="Filtro sipas pagesës"><option value="">Të gjitha pagesat</option><option value="paid">Paid</option><option value="partial">Partially Paid</option><option value="unpaid">Unpaid</option></select><ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" /></div>
            <button onClick={() => setFiltersOpen(o => !o)} className={`h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors border ${filtersOpen ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-700 hover:bg-slate-50 border-slate-200/60"}`}><Filter className="w-3.5 h-3.5" /> Më shumë</button>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <button onClick={() => setExportMenuOpen(o => !o)} disabled={pagedBookings.length === 0} className="h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors border bg-white text-slate-700 hover:bg-slate-50 border-slate-200/60 disabled:opacity-40 disabled:cursor-not-allowed" title="Shkarko listën e filtruar"><Download className="w-3.5 h-3.5" /> Shkarko<ChevronDown className="w-3 h-3 text-slate-400" /></button>
                {exportMenuOpen && <><div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} /><div className="absolute right-0 mt-1 w-52 rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden"><div className="px-3 py-2 text-[11px] text-slate-400 font-semibold border-b border-slate-100">{pagedBookings.length} rezervime (filtruar)</div><button onClick={() => { setExportMenuOpen(false); setNotice("Pamje e izoluar: eksporti është çaktivizuar."); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 transition-colors"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Shkarko Excel</button><button onClick={() => { setExportMenuOpen(false); setNotice("Pamje e izoluar: eksporti është çaktivizuar."); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-rose-50 transition-colors border-t border-slate-100"><FileText className="w-4 h-4 text-rose-600" /> Shkarko PDF</button></div></>}
              </div>
              <span className="text-[11px] text-slate-400 font-medium">{hasActiveFilters ? `${filteredCount} nga ${totalCount} rezervime` : `${totalCount} rezervime gjithsej`}</span>
              {hasActiveFilters && <button onClick={clearFilters} className="text-[11px] text-blue-600 font-semibold hover:underline">Pastro</button>}
            </div>
          </div>
          {filtersOpen && <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/60 rounded-lg p-0.5">
              {([["today", "Sot", TODAY], ["yest", "Dje", "2026-05-18"], ["7d", "7 ditët", "2026-05-13"], ["30d", "30 ditët", "2026-04-20"], ["all", "Të gjitha", ""]] as const).map(([key, label, start]) => {
                const end = key === "yest" ? start : start ? TODAY : "";
                const active = dateFrom === start && dateTo === end;
                return <button key={key} onClick={() => { setDateFrom(start); setDateTo(end); }} className={`px-2.5 h-7 rounded-md text-[11px] font-semibold transition-colors ${active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}>{label}</button>;
              })}
            </div>
            <div className="flex items-center gap-1.5 border rounded-lg px-3 h-9 bg-slate-50 border-slate-200/60 min-w-[160px]"><span className="text-[10px] font-mono text-slate-500 shrink-0">PNR</span><input placeholder="Kodi PNR…" value={pnrSearch} onChange={e => setPnrSearch(e.target.value)} className="bg-transparent outline-none w-full text-sm placeholder:text-slate-400 font-mono" />{pnrSearch && <button onClick={() => setPnrSearch("")}><X className="w-3 h-3 text-slate-400 hover:text-slate-600" /></button>}</div>
            <div className="flex items-center gap-1.5 border rounded-lg px-3 h-9 bg-slate-50 border-slate-200/60 min-w-[180px]"><Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" /><input placeholder="Fluturimi, Rruga (MXP-TIA)…" value={flightSearch} onChange={e => setFlightSearch(e.target.value)} className="bg-transparent outline-none w-full text-sm placeholder:text-slate-400" />{flightSearch && <button onClick={() => setFlightSearch("")}><X className="w-3 h-3 text-slate-400 hover:text-slate-600" /></button>}</div>
            <DatePicker value={flightDateFrom} placeholder="Fluturimi nga…" onChange={v => { setFlightDateFrom(v); if (flightDateTo && v > flightDateTo) setFlightDateTo(v); }} className="w-40" />
            <DatePicker value={flightDateTo} placeholder="Fluturimi deri…" min={flightDateFrom || undefined} onChange={setFlightDateTo} className="w-40" />
            {(flightDateFrom || flightDateTo) && <button onClick={() => { setFlightDateFrom(""); setFlightDateTo(""); }} className="text-[11px] text-slate-500 hover:text-slate-800 underline shrink-0">Hiq periudhën</button>}
            <DatePicker value={dateFrom} placeholder="Rezervuar nga…" onChange={v => { setDateFrom(v); if (dateTo && v > dateTo) setDateTo(v); }} className="w-40" />
            <DatePicker value={dateTo} placeholder="Rezervuar deri…" min={dateFrom || undefined} onChange={setDateTo} className="w-40" />
          </div>}
        </div>
        {(statusFilter || agentFilter.length > 0 || paymentFilter) && <div className="flex items-center gap-1.5 px-1 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Filtra:</span>
          {statusFilter && <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-100">Statusi: {STATUS_STYLES[statusFilter]?.label}<button onClick={() => setStatusFilter("")} className="text-blue-400 hover:text-blue-600">×</button></span>}
          {agentFilter.map(id => <span key={id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-violet-50 text-violet-700 text-xs font-medium rounded-md border border-violet-100">Agjent: {agents.find(a => String(a.id) === id)?.name}<button onClick={() => setAgentFilter(prev => prev.filter(x => x !== id))} className="text-violet-400 hover:text-violet-600">×</button></span>)}
          {paymentFilter && <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-md border border-emerald-100">Pagesa: {paymentFilter === "paid" ? "Paid" : paymentFilter === "partial" ? "Partially Paid" : "Unpaid"}<button onClick={() => setPaymentFilter("")} className="text-emerald-400 hover:text-emerald-600">×</button></span>}
        </div>}
        {/* Source mobile list, simplified only for the empty optional badge fixture. */}
        <div className="md:hidden space-y-2">
          {pagedBookings.length === 0 && <div className="text-center py-10 text-slate-500 text-sm">Nuk ka rezervime me këto kritere.</div>}
          {pagedBookings.map(b => {
            const s = STATUS_STYLES[b.status];
            return <div key={b.id} className="rounded-2xl border p-3 shadow-sm space-y-2 bg-white border-slate-200/80">
              <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 min-w-0"><button onClick={openBooking} className="font-mono text-xs font-bold text-blue-700 hover:underline shrink-0">{b.bookingRef}</button>{b.pnr && <span className="font-mono text-[10px] text-slate-500 truncate">{b.pnr}</span>}</div><div className="flex flex-col items-end gap-1 shrink-0"><div className="flex items-center gap-1"><span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${s.bg} ${s.text}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</span></div><TicketDeadlineBadge createdAt={b.createdAt} status={b.status} size="xs" /></div></div>
              <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="font-medium text-sm truncate">{b.customerName}</div><div className="text-xs text-slate-500">{b.flight.fromCity} → {b.flight.toCity}<span className="ml-1">· {format(new Date(b.flight.departureDate + "T00:00:00"), "dd MMM")}</span><span className="ml-1 font-semibold text-slate-600">· {b.passengers.length} pax</span></div><div className="text-[11px] text-slate-400">Rezervuar: <span className="text-emerald-600 font-semibold">{format(new Date(b.createdAt), "dd MMM yyyy")}</span></div><div className="flex items-center gap-1 text-[11px] text-slate-500 truncate"><span>{b.agentName}</span></div></div>
                <div className="text-right shrink-0 tabular-nums"><div className="flex items-center justify-end gap-1.5">{b.commissionAmount !== 0 && <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 ${b.commissionAmount > 0 ? "bg-emerald-100 text-emerald-700 ring-emerald-200" : "bg-rose-100 text-rose-700 ring-rose-200"}`}>{b.commissionAmount > 0 ? "+" : "−"}€{fmt(Math.abs(b.commissionAmount))}</span>}<span className={`text-sm font-bold ${b.dueAmount <= 0 && b.paidAmount > 0 && b.status !== "cancelled" ? "inline-flex items-center rounded-md bg-[#00b050] px-1 py-0 text-white" : "text-slate-900"}`}>€{fmt(b.totalAmount)}</span></div>{b.dueAmount > 0 ? <div className="text-[11px] text-rose-600 font-semibold">−€{fmt(b.dueAmount)}</div> : <div className="text-[11px] text-emerald-600 font-bold">✓</div>}</div>
              </div>
            </div>;
          })}
        </div>
        {/* Source premium desktop table lines 992–1247. Source measurement and
            resizing are local-only; only preference persistence is stubbed. */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table ref={resizeTable.ref} style={resizeTable.sizes ? { tableLayout: "fixed", width: Object.values(resizeTable.sizes).reduce((sum, width) => sum + width, 40) } : undefined} className="w-max text-sm whitespace-nowrap [&_td]:overflow-hidden">
              {resizeTable.sizes && <colgroup>{columns.map(column => <col key={column.k} style={{ width: resizeTable.sizes![column.k] }} />)}<col style={{ width: 40 }} /></colgroup>}
              <thead><tr className="bg-slate-50/80 border-b-2 border-slate-300">
                {columns.map(({ k, label, align }) => {
                  const active = sortBy === k, financial = align === "text-right";
                  const financialWidth = resizeTable.sizes?.[k] ?? BOOKING_FINANCIAL_WIDTHS[k];
                  const compact = ["date", "ref", "pnr", "flightDate", "flightTime", "pax"].includes(k);
                  return <th key={k} style={financialWidth ? { width: financialWidth, minWidth: financialWidth, maxWidth: financialWidth } : undefined} className={`relative overflow-hidden ${align} ${compact ? "w-px " : ""}px-2 py-1 text-[10px] uppercase font-semibold ${active ? "text-blue-700" : "text-slate-500"}`}>
                    <button type="button" onClick={() => toggleSort(k)} className={`inline-flex max-w-full overflow-hidden items-center gap-1 uppercase hover:text-blue-700 transition-colors ${financial ? "justify-end tracking-normal" : "tracking-widest"}`} title={`Rendit sipas "${label}"`}>{label}{active ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}</button>
                    <BookingColumnResize label={label} disabled={false} onResize={width => setWidths(prev => ({ ...prev, [k]: width }))} />
                  </th>;
                })}<th className="w-10"></th>
              </tr></thead>
              <tbody>
                {pagedBookings.length === 0 && <tr><td colSpan={columns.length + 1} className="whitespace-normal text-center py-12 text-slate-500">Nuk ka rezervime me këto kritere.</td></tr>}
                {pagedBookings.map(b => {
                  const s = STATUS_STYLES[b.status], total = b.totalAmount, paid = b.paidAmount, due = b.dueAmount, comm = b.commissionAmount, netoRaw = b.netPrice;
                  return <tr key={b.id} className={`border-b border-slate-300 hover:bg-slate-50/60 group transition-colors ${b.status === "cancelled" ? "!bg-slate-50 line-through text-black [&_*]:line-through [&_*]:!text-black [&_.cx-anuluar]:!text-red-600 [&_.cx-anuluar]:!no-underline" : ""}`}>
                    <td hidden={!shown.has("date")} className="w-px px-2 py-1 align-middle"><div className="flex flex-col leading-tight"><span className="text-[13px] font-semibold text-emerald-600">{format(new Date(b.createdAt), "dd MMM yyyy")}</span></div></td>
                    <td hidden={!shown.has("ref")} className="w-px px-2 py-1 align-middle"><div className="flex flex-col gap-0.5 items-start"><div className="flex items-center gap-1.5 flex-wrap"><button onClick={openBooking} className="relative inline-flex items-center font-mono text-[13px] font-bold bg-gradient-to-b from-white to-slate-50 border border-slate-200 hover:border-blue-400 hover:from-blue-50 hover:to-white px-2 py-0.5 rounded-md shadow-sm hover:shadow transition-all tracking-tight" title="Hap rezervimin"><span className="bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">{b.bookingRef}</span></button></div></div></td>
                    <td hidden={!shown.has("pnr")} className="w-px px-2 py-1 align-middle"><div className="flex flex-col gap-0.5 items-start">{b.pnr ? <span className="relative inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-emerald-800 bg-gradient-to-b from-emerald-50 to-emerald-100/70 border border-emerald-300 pl-1.5 pr-2 py-0.5 rounded-md shadow-sm tracking-wider" title="PNR e leshuar"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /><span>{b.pnr}</span></span> : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-gradient-to-b from-rose-50 to-rose-100/70 border border-rose-200 px-2 py-0.5 rounded-md shadow-sm tracking-wide"><span className="w-1 h-1 rounded-full bg-rose-400" />NOT ISSUED</span>}</div></td>
                    <td hidden={!shown.has("klienti")} className="px-2 py-1 align-middle"><div className="font-medium text-slate-900 text-[14px]">{b.customerName}</div></td>
                    <td hidden={!shown.has("agjencia")} className="px-2 py-1 align-middle"><div className="flex items-center gap-2"><span className="text-[14px] font-medium text-slate-700 truncate max-w-[140px]">{b.agentName}</span></div></td>
                    <td hidden={!shown.has("fluturimi")} className="px-2 py-1 align-middle"><div className="flex items-center gap-1.5"><span className="font-mono font-bold text-slate-900 text-[14px]">{b.flight.fromCity}-{b.flight.toCity}</span></div></td>
                    <td hidden={!shown.has("flightDate")} className="w-px px-2 py-1 align-middle text-[11px] text-slate-500">{format(new Date(b.flight.departureDate + "T00:00:00"), "dd.MM.yyyy")}</td>
                    <td hidden={!shown.has("flightTime")} className="w-px px-2 py-1 align-middle font-mono text-[11px] text-slate-500">{fmtAmPm(b.flight.departureTime)}</td>
                    <td hidden={!shown.has("pax")} className="w-px px-2 py-1 text-left align-middle"><div className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg"><span className="inline-block w-[3ch] shrink-0 text-right text-sm font-semibold text-slate-700 tabular-nums">{b.passengers.length}</span></div></td>
                    <td hidden={!shown.has("financa")} className="w-px px-2 py-1 align-middle text-right tabular-nums"><span className={`font-bold text-[14px] ${due <= 0 && paid > 0 && b.status !== "cancelled" ? "inline-flex items-center rounded-md bg-[#00b050] px-1 py-0 text-white" : "text-slate-900"}`}>€{fmt(total)}</span></td>
                    <td hidden={!shown.has("neto")} className="w-px px-2 py-1 align-middle text-right tabular-nums">{netoRaw > 0 ? <span className="font-semibold text-slate-700">€{fmt(netoRaw)}</span> : <span className="text-slate-400 italic">—</span>}</td>
                    <td hidden={!shown.has("commission")} className="w-px px-2 py-1 align-middle text-right tabular-nums">{comm !== 0 ? <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 ${comm > 0 ? "bg-emerald-100 text-emerald-700 ring-emerald-200" : "bg-rose-100 text-rose-700 ring-rose-200"}`} title="Komision">{comm > 0 ? "+" : "−"}€{fmt(Math.abs(comm))}</span> : <span className="text-slate-400">€0</span>}</td>
                    <td hidden={!shown.has("paid")} className="w-px px-2 py-1 align-middle text-right tabular-nums font-semibold text-emerald-600">€{fmt(paid)}</td>
                    <td hidden={!shown.has("due")} className="w-px px-2 py-1 align-middle text-right tabular-nums">{due > 0 ? <span className="text-rose-600 font-bold">€{fmt(due)}</span> : <span className="text-emerald-600 font-bold">€0 ✓</span>}</td>
                    <td hidden={!shown.has("credit")} className="w-px px-2 py-1 align-middle text-right tabular-nums"><span className="text-slate-400">—</span></td>
                    <td hidden={!shown.has("statusi")} className="px-2 py-1 align-middle"><div className="flex flex-col items-start gap-1"><div className="flex items-center gap-1.5"><Link href={`/bookings/${b.id}`}><span className={`cx-anuluar inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold cursor-pointer ${s.bg} ${s.text}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</span></Link></div><TicketDeadlineBadge createdAt={b.createdAt} status={b.status} /></div></td>
                    <td className="px-2 py-1 align-middle"><button onClick={openBooking} className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center"><MoreHorizontal className="w-4 h-4" /></button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          {!loadAll && <div className="flex items-center justify-between px-4 py-2 bg-slate-50/40 border-t border-slate-200/80"><div className="flex items-center gap-3 text-xs text-slate-500"><span>Faqe <span className="font-semibold text-slate-700">1</span> nga <span className="font-semibold text-slate-700">1</span></span><span className="text-slate-300">•</span><span><span className="font-semibold text-slate-700">{filteredCount}</span> rezervime (vetëm sot)</span></div><div className="flex items-center gap-1"><button onClick={() => setShowAll(true)} className="h-8 px-3 rounded-lg text-xs font-medium text-violet-700 hover:bg-white border border-violet-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">Shfaq të gjitha</button><button disabled className="h-8 px-3 rounded-lg text-xs font-medium text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"><ChevronLeft className="w-3.5 h-3.5" /> Më parë</button><span className="text-xs font-semibold text-slate-700 px-2 tabular-nums">1 / 1</span><button onClick={() => setShowAll(true)} className="h-8 px-3 rounded-lg text-xs font-medium text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">Më pas <ChevronRight className="w-3.5 h-3.5" /></button></div></div>}
        </div>
        {/* Source money summary footer lines 1249–1286, all source styles retained. */}
        {pagedBookings.length > 0 && <div className="hidden md:flex bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 rounded-2xl p-4 items-center justify-between text-white shadow-xl shadow-slate-900/10 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-blue-500/20 to-transparent" />
          <div className="flex items-center gap-6 relative">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center"><CircleDollarSign className="w-5 h-5" /></div>
            <div><div className="text-[10px] uppercase tracking-widest text-blue-200 font-semibold">Total i Faqes</div><div className="text-xl font-bold tabular-nums tracking-tight">€{fmt(pageSummary.total)}</div></div>
            <div className="w-px h-10 bg-white/10" />
            <div><div className="text-[10px] uppercase tracking-widest text-emerald-200 font-semibold">Paguar</div><div className="text-xl font-bold tabular-nums tracking-tight">€{fmt(pageSummary.paid)}</div></div>
            <div className="w-px h-10 bg-white/10" />
            <div><div className="text-[10px] uppercase tracking-widest text-rose-200 font-semibold">Detyrim</div><div className="text-xl font-bold tabular-nums tracking-tight">€{fmt(pageSummary.due)}</div></div>
            <div className="w-px h-10 bg-white/10" />
            <div><div className="text-[10px] uppercase tracking-widest text-violet-200 font-semibold">Komisioni</div><div className={`text-xl font-bold tabular-nums tracking-tight ${pageSummary.comm < 0 ? "text-rose-300" : ""}`}>{pageSummary.comm < 0 ? "−" : ""}€{fmt(Math.abs(pageSummary.comm))}</div></div>
          </div>
          <div className="relative text-right text-[11px] text-blue-200"><div>{activeRows.length} rezervime në faqe</div><div className="text-blue-300/70">nga {filteredCount} të filtruara</div></div>
        </div>}
      </div>
    </div>
  );
}
