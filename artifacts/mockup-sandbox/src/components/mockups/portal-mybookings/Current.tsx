import "./_group.css";
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "./_services";
import { api } from "./_services";
import { PaymentReports } from "./_PaymentReports";
import { useAuth } from "./_services";
import { useTranslation } from "./_services";
import {
  Plane, AlertCircle, Search, X,
  CheckCircle2, Clock, XCircle, Ticket, FileText,
  ArrowRight, ChevronDown, ChevronUp,
  CreditCard, Banknote, RefreshCw, Receipt,
  TrendingUp, TrendingDown, ArrowUpDown, Tag, Wallet,
  Download, Loader2,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; text: string; bg: string }> = {
  draft:     { label: "Dërguar",    text: "text-amber-700",  bg: "bg-amber-50" },
  confirmed: { label: "Konfirmuar", text: "text-blue-700",   bg: "bg-blue-50" },
  ticketed:  { label: "Ticketed",   text: "text-emerald-700",bg: "bg-emerald-50" },
  cancelled: { label: "Anuluar",    text: "text-red-600",    bg: "bg-red-50" },
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft:     <Clock className="h-3 w-3" />,
  confirmed: <CheckCircle2 className="h-3 w-3" />,
  ticketed:  <Ticket className="h-3 w-3" />,
  cancelled: <XCircle className="h-3 w-3" />,
};
const TX_TYPE: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  payment:          { label: "Pagesë",        icon: <Banknote className="h-4 w-4"/>,     color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  refund:           { label: "Rimbursim",     icon: <RefreshCw className="h-4 w-4"/>,    color: "text-orange-600 bg-orange-50 border-orange-200" },
  credit:           { label: "Kredi",         icon: <TrendingUp className="h-4 w-4"/>,   color: "text-blue-600 bg-blue-50 border-blue-200" },
  debit:            { label: "Debi",          icon: <TrendingDown className="h-4 w-4"/>, color: "text-red-600 bg-red-50 border-red-200" },
  charge:           { label: "Tarifë",        icon: <TrendingDown className="h-4 w-4"/>, color: "text-red-600 bg-red-50 border-red-200" },
  price_change:     { label: "Ndryshim Çmimi",icon: <Tag className="h-4 w-4"/>,          color: "text-purple-600 bg-purple-50 border-purple-200" },
  refund_overpayment: { label: "Mbipagesë",   icon: <RefreshCw className="h-4 w-4"/>,    color: "text-orange-600 bg-orange-50 border-orange-200" },
  ticket_deduction: { label: "Pagesë Bilete", icon: <Ticket className="h-4 w-4"/>,       color: "text-rose-600 bg-rose-50 border-rose-200" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    "  " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtMoney(n: number) {
  return Math.round(Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

// ─── Main Component ─────────────────────────────────────────────
type TabKey = "bookings" | "transactions";

export default function MyBookings() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const [bookings, setBookings]       = useState<any[]>([]);
  const [transactions, setTx]         = useState<any[]>([]);
  const [loadingBk, setLoadingBk]     = useState(true);
  const [loadingTx, setLoadingTx]     = useState(false);
  const [txLoaded, setTxLoaded]       = useState(false);
  const [error, setError]             = useState("");

  const [tab, setTab]                 = useState<TabKey>("bookings");
  const [expanded, setExpanded]       = useState<number | null>(null);
  const [pdfRef, setPdfRef]           = useState<string | null>(null);

  // Booking filters
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy]           = useState<"date" | "amount">("date");

  // Transaction filters
  const [txSearch, setTxSearch]       = useState("");

  useEffect(() => {
    if (!authLoading && !user) { setLocation("/login"); return; }
    if (user) {
      api.myBookings()
        .then(setBookings)
        .catch(err => setError(err.message))
        .finally(() => setLoadingBk(false));
    }
  }, [user, authLoading]);

  // Load transactions lazily when tab is first opened
  useEffect(() => {
    if (tab === "transactions" && !txLoaded && user) {
      setLoadingTx(true);
      api.myTransactions()
        .then(setTx)
        .catch(() => {})
        .finally(() => { setLoadingTx(false); setTxLoaded(true); });
    }
  }, [tab, txLoaded, user]);

  const filtered = useMemo(() => {
    let list = [...bookings];
    if (statusFilter !== "all") list = list.filter(b => b.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.bookingRef?.toLowerCase().includes(q) ||
        b.customerName?.toLowerCase().includes(q) ||
        b.customerEmail?.toLowerCase().includes(q) ||
        b.fromCity?.toLowerCase().includes(q) ||
        b.toCity?.toLowerCase().includes(q) ||
        b.flightNumber?.toLowerCase().includes(q) ||
        b.pnr?.toLowerCase().includes(q)
      );
    }
    if (sortBy === "amount") list.sort((a, b) => b.totalAmount - a.totalAmount);
    return list;
  }, [bookings, search, statusFilter, sortBy]);

  const filteredTx = useMemo(() => {
    let list = [...transactions];
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      list = list.filter(t =>
        t.bookingRef?.toLowerCase().includes(q) ||
        t.customerName?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.route?.toLowerCase().includes(q) ||
        t.reference?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, txSearch]);

  const stats = useMemo(() => {
    const active = bookings.filter(b => b.status !== "cancelled");
    const total = active.reduce((s, b) => s + b.totalAmount, 0);
    const paid  = active.reduce((s, b) => s + b.paidAmount, 0);
    const due   = active.reduce((s, b) => s + b.dueAmount, 0);
    const byStatus = bookings.reduce((acc, b) => {
      acc[b.status] = (acc[b.status] || 0) + 1; return acc;
    }, {} as Record<string, number>);
    return { total, paid, due, byStatus, count: bookings.length };
  }, [bookings]);

  const txStats = useMemo(() => {
    const increases = transactions.filter(t => t.sign > 0).reduce((s, t) => s + t.amount, 0);
    const decreases = transactions.filter(t => t.sign < 0).reduce((s, t) => s + t.amount, 0);
    return { increases, decreases, net: increases - decreases, count: transactions.length };
  }, [transactions]);

  async function handleDownloadPdf(bookingRef: string) {
    if (pdfRef) return;
    setPdfRef(bookingRef);
    try {
      const blob = await api.downloadBookingPdf(bookingRef);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bookingRef}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silent — non-blocking
    } finally {
      setPdfRef(null);
    }
  }

  if (authLoading || loadingBk) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
          <Plane className="absolute inset-0 m-auto h-4 w-4 text-blue-600" />
        </div>
        <p className="text-gray-400 text-sm">{t("Duke ngarkuar...")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fc]">

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg, #0b1f3a 0%, #1a3a6b 100%)" }} className="pt-8 pb-0">
        <div className="max-w-6xl mx-auto px-6">

          <div className="mb-5">
            <div className="text-amber-400/80 text-[10px] font-bold tracking-widest uppercase mb-1">{t("Llogaria Juaj")}</div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{t("Rezervimet e Mia")}</h1>
            <p className="text-blue-300/60 text-xs mt-0.5">
              {user?.role === "agent" ? t("Të gjitha rezervimet dhe transaksionet e agjencisë suaj") : t("Historiku juaj i fluturimeve")}
            </p>
          </div>

          {user?.role === "agent" && user.agentId && <PaymentReports />}

          {/* Stats — show different stats per tab */}
          {tab === "bookings" ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-5">
              {[
                { label: t("Gjithsej"),     value: stats.count.toString(), sub: t("rezervime"), color: "text-white" },
                { label: t("Shuma Totale"), value: `€${fmtMoney(stats.total)}`, sub: t("të gjitha"), color: "text-white" },
                { label: t("Paguar"),       value: `€${fmtMoney(stats.paid)}`, sub: stats.total > 0 ? t("{{percent}}% e totalit", { percent: Math.round(stats.paid/stats.total*100) }) : "0%", color: "text-emerald-400" },
                { label: t("Mbetet"),       value: `€${fmtMoney(stats.due)}`, sub: t("borxh i papaguar"), color: stats.due > 0 ? "text-red-400" : "text-white/40" },
              ].map(s => (
                <div key={s.label} className="bg-white/5 backdrop-blur rounded-xl px-4 py-3 border border-white/10">
                  <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{s.label}</div>
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-white/30 text-[10px]">{s.sub}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 pb-5">
              <div className="bg-white/5 backdrop-blur rounded-xl px-4 py-3 border border-white/10">
                <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> {t("Rritje Çmimi")}
                </div>
                <div className="text-xl font-bold text-emerald-400">+€{fmtMoney(txStats.increases)}</div>
                <div className="text-white/30 text-[10px]">{t("çmimi u rrit")}</div>
              </div>
              <div className="bg-white/5 backdrop-blur rounded-xl px-4 py-3 border border-white/10">
                <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" /> {t("Ulje Çmimi")}
                </div>
                <div className="text-xl font-bold text-red-400">−€{fmtMoney(txStats.decreases)}</div>
                <div className="text-white/30 text-[10px]">{t("çmimi u ul")}</div>
              </div>
              <div className="bg-white/5 backdrop-blur rounded-xl px-4 py-3 border border-white/10">
                <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{t("Gjithsej Ndryshime")}</div>
                <div className="text-xl font-bold text-white">{txStats.count}</div>
                <div className="text-white/30 text-[10px]">{t("ndryshime çmimi")}</div>
              </div>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-0 border-b border-white/10">
            <button onClick={() => setTab("bookings")}
              className={`px-5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                tab === "bookings" ? "border-amber-400 text-amber-400" : "border-transparent text-white/40 hover:text-white/70"
              }`}>
              <Plane className="h-3.5 w-3.5" /> {t("Rezervimet")}
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${tab === "bookings" ? "bg-amber-400/20 text-amber-300" : "bg-white/10 text-white/40"}`}>
                {bookings.length}
              </span>
            </button>
            {/* "Ndryshime Çmimi" tab fshehur nga portali i agjentit (kërkesë e klientit).
                Përmbajtja/statistikat e transaksioneve mbeten në kod por nuk arrihen dot. */}

            {/* Status sub-tabs (only for bookings tab) */}
            {tab === "bookings" && (
              <div className="flex gap-0 ml-4 border-l border-white/10 pl-4">
                {[
                  { key: "all", label: t("Të Gjitha"), count: bookings.length },
                  { key: "draft",     label: t("Dërguar"),   count: stats.byStatus.draft     || 0 },
                  { key: "confirmed", label: t("Konfirmuar"),count: stats.byStatus.confirmed || 0 },
                  { key: "ticketed",  label: t("Ticketed"),  count: stats.byStatus.ticketed  || 0 },
                  { key: "cancelled", label: t("Anuluar"),   count: stats.byStatus.cancelled || 0 },
                ].map(st => (
                  <button key={st.key} onClick={() => setStatusFilter(st.key)}
                    className={`px-3 py-2.5 text-[11px] font-semibold border-b-2 transition-all flex items-center gap-1 ${
                      statusFilter === st.key ? "border-amber-400/60 text-amber-400/80" : "border-transparent text-white/30 hover:text-white/50"
                    }`}>
                    {st.label}
                    {st.count > 0 && <span className="text-[9px] opacity-70">({st.count})</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-6xl mx-auto px-6 py-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-red-700 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* ═══ BOOKINGS TAB ═══ */}
        {tab === "bookings" && (
          <>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={t("Kërko sipas ref, emrit, rrugës, PNR...")}
                  className="w-full pl-9 pr-8 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                className="text-xs border border-gray-200 rounded-lg bg-white px-3 py-2 focus:outline-none text-gray-600 cursor-pointer">
                <option value="date">{t("Rendit: Data")}</option>
                <option value="amount">{t("Rendit: Shuma")}</option>
              </select>
            </div>

            {bookings.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plane className="h-7 w-7 text-blue-300" />
                </div>
                <h3 className="text-base font-bold text-gray-800 mb-1">{t("Asnjë rezervim ende")}</h3>
                <p className="text-gray-400 text-xs max-w-xs mx-auto mb-5">{t("Rezervo fluturimin tënd të parë dhe historiku do të shfaqet këtu.")}</p>
                <button onClick={() => setLocation("/flights")}
                  className="inline-flex items-center gap-2 font-semibold px-5 py-2.5 rounded-xl text-sm text-white"
                  style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" }}>
                  <Plane className="h-4 w-4" /> {t("Kërko Fluturime")}
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                <Search className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">{t("Asnjë rezultat")}</p>
                <button onClick={() => { setSearch(""); setStatusFilter("all"); }}
                  className="mt-3 text-xs text-blue-600 hover:underline">{t("Pastro filtrat")}</button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1.2fr_28px] gap-2 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <div>{t("Referenca")}</div><div>{t("Pasagjeri")}</div><div>{t("Rruga")}</div><div>{t("Data")}</div><div>{t("Statusi")}</div>
                  <div className="text-right">{t("Shuma / Mbetet")}</div><div />
                </div>

                <div className="divide-y divide-gray-50">
                  {filtered.map((b: any) => {
                    const st = STATUS_MAP[b.status] || { label: b.status, text: "text-gray-500", bg: "bg-gray-50" };
                    const icon = STATUS_ICONS[b.status] ?? <FileText className="h-3 w-3" />;
                    const paid = b.dueAmount <= 0;
                    const isOpen = expanded === b.id;
                    const payments: any[] = b.payments || [];

                    return (
                      <div key={b.id}>
                        <div onClick={() => setExpanded(isOpen ? null : b.id)}
                          className={`grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1.2fr_28px] gap-2 items-center px-5 py-3 cursor-pointer transition-colors ${isOpen ? "bg-blue-50/60" : "hover:bg-gray-50/80"}`}>

                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isOpen ? "bg-[#0b1f3a]" : "bg-[#0b1f3a]/5"}`}>
                              <Plane className={`h-3.5 w-3.5 transition-colors ${isOpen ? "text-white" : "text-[#0b1f3a]/50"}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-mono font-bold text-gray-900 text-xs">{b.bookingRef}</div>
                              {b.pnr && <div className="text-[10px] text-gray-400 font-mono">PNR: {b.pnr}</div>}
                            </div>
                          </div>

                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-gray-800 truncate">{b.customerName}</div>
                            {b.customerEmail && <div className="text-[10px] text-gray-400 truncate">{b.customerEmail}</div>}
                          </div>

                          <div className="min-w-0">
                            {b.fromCity && b.toCity ? (
                              <div className="flex items-center gap-1 text-xs font-bold text-gray-700">
                                <span className="font-mono">{b.fromCity}</span>
                                <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
                                <span className="font-mono">{b.toCity}</span>
                              </div>
                            ) : <span className="text-[10px] text-gray-300">—</span>}
                            {b.airline && <div className="text-[10px] text-gray-400">{b.airline} · {b.flightNumber}</div>}
                          </div>

                          <div>
                            {b.departureDate
                              ? <><div className="text-xs text-gray-700 font-medium">{b.departureDate}</div>
                                  <div className="text-[10px] text-gray-400">{t("Rezervuar:")} {fmtDate(b.createdAt)}</div></>
                              : <div className="text-xs text-gray-500">{fmtDate(b.createdAt)}</div>}
                          </div>

                          <div>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                              {icon}{t(st.label)}
                            </span>
                          </div>

                          <div className="text-right">
                            <div className={`text-sm font-bold ${b.status === "cancelled" ? "text-gray-400 line-through" : "text-gray-900"}`}>€{fmtMoney(b.totalAmount)}</div>
                            {b.status === "cancelled"
                              ? <div className="text-[10px] text-red-400 font-semibold flex items-center justify-end gap-0.5"><XCircle className="h-2.5 w-2.5" /> {t("Anuluar")}</div>
                              : paid
                                ? <div className="text-[10px] text-emerald-600 font-semibold flex items-center justify-end gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" /> {t("Paguar")}</div>
                                : <div className="text-[10px] text-red-500 font-bold">{t("Mbetet:")} €{fmtMoney(b.dueAmount)}</div>}
                          </div>

                          <div className="flex items-center justify-center">
                            {isOpen ? <ChevronUp className="h-4 w-4 text-blue-500" /> : <ChevronDown className="h-4 w-4 text-gray-300" />}
                          </div>
                        </div>

                        {/* Expand panel */}
                        {isOpen && (
                          <div className="border-t border-blue-100 bg-blue-50/30 px-5 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                              {/* Balance card */}
                              <div className="bg-white rounded-xl border border-gray-100 p-4">
                                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                  <Receipt className="h-3.5 w-3.5" /> {t("Gjendja Financiare")}
                                </div>
                                {b.status === "cancelled" ? (
                                  <div className="flex flex-col items-center justify-center py-4 gap-2">
                                    <XCircle className="h-8 w-8 text-red-300" />
                                    <p className="text-sm font-semibold text-red-400">{t("Rezervimi u anullua")}</p>
                                    <p className="text-[11px] text-gray-400 text-center">{t("Ky rezervim nuk llogaritet si detyrim.")}</p>
                                  </div>
                                ) : (
                                  <>
                                    <div className="mb-4">
                                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                        <span>{t("Paguar")}</span>
                                        <span>{b.totalAmount > 0 ? Math.round(b.paidAmount / b.totalAmount * 100) : 0}%</span>
                                      </div>
                                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{
                                          width: `${b.totalAmount > 0 ? Math.min(100, b.paidAmount / b.totalAmount * 100) : 0}%`,
                                          background: b.dueAmount <= 0 ? "#10b981" : "linear-gradient(90deg,#10b981,#f59e0b)"
                                        }} />
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      {[
                                        { label: t("Shuma Totale"), val: `€${fmtMoney(b.totalAmount)}`, cls: "text-gray-900 font-bold" },
                                        { label: t("Paguar"),       val: `€${fmtMoney(b.paidAmount)}`,  cls: "text-emerald-600 font-bold" },
                                      ].map(r => (
                                        <div key={r.label} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                                          <span className="text-xs text-gray-500">{r.label}</span>
                                          <span className={`text-sm ${r.cls}`}>{r.val}</span>
                                        </div>
                                      ))}
                                      <div className="flex justify-between items-center pt-1">
                                        <span className="text-xs font-semibold text-gray-700">{t("Mbetet")}</span>
                                        <span className={`text-base font-bold ${b.dueAmount <= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                          {b.dueAmount <= 0 ? "✓ " + t("Shlyer") : `€${fmtMoney(b.dueAmount)}`}
                                        </span>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Payments history */}
                              <div className="bg-white rounded-xl border border-gray-100 p-4">
                                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                  <CreditCard className="h-3.5 w-3.5" /> {t("Historia e Pagesave")}
                                </div>
                                {payments.length === 0 ? (
                                  <div className="text-center py-6">
                                    <Banknote className="h-7 w-7 text-gray-200 mx-auto mb-2" />
                                    <p className="text-xs text-gray-400">{t("Asnjë pagesë e regjistruar")}</p>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] font-bold text-gray-400 uppercase pb-2 border-b border-gray-50">
                                      <div>{t("Data / Metoda")}</div><div>Ref</div><div className="text-right">{t("Shuma")}</div>
                                    </div>
                                    {payments.map((p: any) => (
                                      <div key={p.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center py-1">
                                        <div>
                                          <div className="text-xs text-gray-700 font-medium flex items-center gap-1">
                                            {p.isRefund && <RefreshCw className="h-3 w-3 text-orange-400" />}
                                            {fmtDate(p.createdAt)}
                                          </div>
                                          <div className="text-[10px] text-gray-400">{p.method}{p.notes ? ` · ${p.notes}` : ""}</div>
                                        </div>
                                        <div className="text-[10px] font-mono text-gray-400">{p.reference || "—"}</div>
                                        <div className={`text-xs font-bold text-right ${p.isRefund ? "text-orange-500" : "text-emerald-600"}`}>
                                          {p.isRefund ? "−" : "+"}€{fmtMoney(p.amount)}
                                        </div>
                                      </div>
                                    ))}
                                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 pt-2 border-t border-gray-100">
                                      <div className="text-[10px] font-bold text-gray-500 uppercase">{t("Gjithsej Paguar")}</div>
                                      <div />
                                      <div className="text-sm font-bold text-emerald-600 text-right">€{fmtMoney(b.paidAmount)}</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {b.notes && (
                              <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 text-xs text-amber-800">
                                <span className="font-semibold">{t("Shënime:")} </span>{b.notes}
                              </div>
                            )}
                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                onClick={e => { e.stopPropagation(); handleDownloadPdf(b.bookingRef); }}
                                disabled={pdfRef === b.bookingRef}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b1f3a] px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60 transition-colors">
                                {pdfRef === b.bookingRef
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Download className="h-3.5 w-3.5" />}
                                {t("Shkarko PDF")}
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setLocation(`/my-bookings/${b.bookingRef}`); }}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-lg transition-opacity hover:opacity-90"
                                style={{ background: "linear-gradient(135deg,#0b1f3a,#1a3a6b)" }}>
                                {t("Shiko Detajin të Plotë")} <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {filtered.length > 1 && (() => {
                  // Biletat e anulluara nuk llogariten fare në totalet e footer-it.
                  const active = filtered.filter((b: any) => b.status !== "cancelled");
                  const totalSum = active.reduce((s: number, b: any) => s + b.totalAmount, 0);
                  const paidSum  = active.reduce((s: number, b: any) => s + b.paidAmount, 0);
                  const dueSum   = active.reduce((s: number, b: any) => s + b.dueAmount, 0);
                  return (
                  <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <div className="text-[10px] text-gray-400">{t("{{count}} rezervime", { count: filtered.length })}</div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="font-bold text-gray-800">{t("Gjithsej:")} €{fmtMoney(totalSum)}</span>
                      <span className="text-emerald-600 font-semibold">{t("Paguar:")} €{fmtMoney(paidSum)}</span>
                      {dueSum > 0 && (
                        <span className="text-red-500 font-bold">{t("Mbetet:")} €{fmtMoney(dueSum)}</span>
                      )}
                    </div>
                  </div>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {/* ═══ TRANSACTIONS TAB ═══ */}
        {tab === "transactions" && (
          <>
            {loadingTx ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <div className="w-10 h-10 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
                <p className="text-gray-400 text-sm">{t("Duke ngarkuar transaksionet...")}</p>
              </div>
            ) : (
              <>
                {/* Search */}
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input type="text" value={txSearch} onChange={e => setTxSearch(e.target.value)}
                      placeholder={t("Kërko sipas ref, rrugës...")}
                      className="w-full pl-9 pr-8 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
                    {txSearch && (
                      <button onClick={() => setTxSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {transactions.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
                    <Tag className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm font-medium">{t("Asnjë ndryshim çmimi ende")}</p>
                    <p className="text-gray-400 text-xs mt-1">{t("Ndryshimet e çmimit shfaqen këtu pasi admini t'i aprovojë")}</p>
                  </div>
                ) : filteredTx.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                    <Search className="h-7 w-7 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">{t("Asnjë rezultat")}</p>
                    <button onClick={() => setTxSearch("")}
                      className="mt-3 text-xs text-blue-600 hover:underline">{t("Pastro kërkimin")}</button>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-[auto_1fr_1.5fr_1.2fr_auto_1fr] gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      <div>{t("Lloji")}</div>
                      <div>{t("Data")}</div>
                      <div>{t("Përshkrimi")}</div>
                      <div>{t("Rezervimi / Rruga")}</div>
                      <div>Ref</div>
                      <div className="text-right">{t("Shuma")}</div>
                    </div>

                    <div className="divide-y divide-gray-50">
                      {filteredTx.map((tx: any) => {
                        const txMeta = TX_TYPE[tx.type] ?? TX_TYPE["credit"];
                        const isPos = tx.sign >= 0;

                        return (
                          <div key={tx.id} className="grid grid-cols-[auto_1fr_1.5fr_1.2fr_auto_1fr] gap-3 items-center px-5 py-3 hover:bg-gray-50/70 transition-colors">

                            {/* Type badge */}
                            <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border ${txMeta.color} whitespace-nowrap`}>
                              {txMeta.icon}
                              <span className="hidden sm:inline">{t(txMeta.label)}</span>
                            </div>

                            {/* Date */}
                            <div>
                              <div className="text-xs text-gray-700 font-medium whitespace-nowrap">{fmtDate(tx.date)}</div>
                              <div className="text-[10px] text-gray-400">
                                {new Date(tx.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                              </div>
                            </div>

                            {/* Description */}
                            <div>
                              <div className="text-xs text-gray-800 font-semibold">{tx.description}</div>
                              {tx.notes && tx.notes !== tx.description && (
                                <div className="text-[10px] text-gray-400 truncate max-w-[200px]">{tx.notes}</div>
                              )}
                              {tx.type === "price_change" && tx.oldAmount != null && (
                                <div className="text-[10px] text-gray-400">
                                  €{fmtMoney(tx.oldAmount)} → €{fmtMoney(tx.newAmount)}
                                </div>
                              )}
                            </div>

                            {/* Booking / Route */}
                            <div>
                              {tx.bookingRef && (
                                <div className="text-xs font-mono font-bold text-gray-700">{tx.bookingRef}</div>
                              )}
                              {tx.route && (
                                <div className="text-[10px] text-gray-400 font-mono">{tx.route}</div>
                              )}
                              {tx.customerName && (
                                <div className="text-[10px] text-gray-400 truncate">{tx.customerName}</div>
                              )}
                            </div>

                            {/* Reference */}
                            <div className="text-[10px] font-mono text-gray-400 whitespace-nowrap">
                              {tx.reference || "—"}
                            </div>

                            {/* Amount */}
                            <div className="text-right">
                              <div className={`text-sm font-bold ${isPos ? "text-emerald-600" : "text-red-500"}`}>
                                {isPos ? "+" : "−"}€{fmtMoney(tx.amount)}
                              </div>
                              <div className="text-[10px] text-gray-400">{tx.method}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer totals */}
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                      <div className="text-[10px] text-gray-400">{t("{{count}} ndryshime çmimi", { count: filteredTx.length })}</div>
                      <div className="flex items-center gap-5 text-xs">
                        <span className="text-emerald-600 font-bold">
                          {t("Rritje:")} +€{fmtMoney(filteredTx.filter((tx: any) => tx.sign > 0).reduce((s: number, tx: any) => s + tx.amount, 0))}
                        </span>
                        <span className="text-red-500 font-bold">
                          {t("Ulje:")} −€{fmtMoney(filteredTx.filter((tx: any) => tx.sign < 0).reduce((s: number, tx: any) => s + tx.amount, 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <footer className="bg-[#0b1f3a] text-white/40 text-[10px] py-5 mt-10">
        <div className="max-w-6xl mx-auto px-6 text-center">© 2026 Albania Sky. {t("Të gjitha të drejtat e rezervuara.")}</div>
      </footer>
    </div>
  );
}
