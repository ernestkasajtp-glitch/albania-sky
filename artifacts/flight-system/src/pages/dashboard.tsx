import { useState, useEffect, useCallback, useRef } from "react";
import { format, parseISO } from "date-fns";
import { fmtM } from "@/lib/utils";
import { fmtFlightNum } from "@/lib/utils";
import { useGetUnpaidBookings, useListBookings, useGetPassengersToday } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Link } from "wouter";
import {
  AlertCircle, CheckCircle2, TrendingUp, Ticket, Wallet,
  MapPin, Users, Calendar, ArrowRight, Crown, Plane, Flame,
  DollarSign, ChevronUp, ChevronDown,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

const PIE_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", pending: "Pritje", confirmed: "Konfirmuar",
  ticketed: "Biletë", cancelled: "Anuluar",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "#6b7280", pending: "#f59e0b", confirmed: "#3b82f6",
  ticketed: "#10b981", cancelled: "#ef4444",
};

function fmt(n: number) { return "€" + fmtM(n); }

type Period = "today" | "week" | "month" | "3months" | "year" | "custom";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Sot",
  week: "Kjo Javë",
  month: "Ky Muaj",
  "3months": "3 Muajt",
  year: "Ky Vit",
  custom: "Personalizuar",
};

function getPeriodDates(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = fmt(now);

  if (period === "today") return { dateFrom: todayStr, dateTo: todayStr };
  if (period === "week") {
    const d = new Date(now); d.setDate(d.getDate() - 6);
    return { dateFrom: fmt(d), dateTo: todayStr };
  }
  if (period === "month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dateFrom: fmt(d), dateTo: todayStr };
  }
  if (period === "3months") {
    const d = new Date(now); d.setMonth(d.getMonth() - 3);
    return { dateFrom: fmt(d), dateTo: todayStr };
  }
  if (period === "year") {
    const d = new Date(now.getFullYear(), 0, 1);
    return { dateFrom: fmt(d), dateTo: todayStr };
  }
  return { dateFrom: todayStr, dateTo: todayStr };
}

function KpiCard({ title, value, sub, icon: Icon, color, loading }: any) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-0 opacity-5 ${color}`} />
      <CardContent className="p-3 md:p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5 md:mb-1 truncate">{title}</p>
            {loading ? <Skeleton className="h-6 md:h-8 w-20 md:w-28 mb-1" /> : (
              <p className="text-lg md:text-2xl font-bold text-foreground truncate">{value}</p>
            )}
            {sub && <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1 truncate hidden sm:block">{sub}</p>}
          </div>
          <div className={`p-2 md:p-2.5 rounded-xl ${color} bg-opacity-10 shrink-0 ml-1`}>
            <Icon className={`h-4 w-4 md:h-5 md:w-5 ${color.replace("bg-", "text-")}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name}: <span className="font-bold">{p.name === "Rezervime" ? p.value : fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

function PaxSearchPanel({ apiBase }: { apiBase: string }) {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    date: string;
    totalPax: number;
    totalCommission: number;
    flights: { title: string; pax: number; commission: number }[];
  } | null>(null);

  const qs = () => {
    const p = new URLSearchParams({ date });
    if (from.trim()) p.set("from", from.trim());
    if (to.trim()) p.set("to", to.trim());
    return p.toString();
  };

  const search = async () => {
    if (!date) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${apiBase}/dashboard/passengers-search?${qs()}`, { credentials: "include" });
      if (!r.ok) throw new Error();
      setResult(await r.json());
    } catch {
      setError("Kërkimi dështoi. Provo përsëri.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const dateLabel = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}.${m}.${y}`; };

  return (
    <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <Users className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Kërko Pasagjerët sipas Fluturimit</p>
          <p className="text-[11px] text-muted-foreground">Vetëm për administratorin — nisja, mbërritja dhe data</p>
        </div>
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Nisja</label>
          <input
            type="text" value={from} onChange={e => setFrom(e.target.value)} placeholder="p.sh. TIA"
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Mbërritja</label>
          <input
            type="text" value={to} onChange={e => setTo(e.target.value)} placeholder="p.sh. BER"
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Data</label>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          onClick={search}
          disabled={loading || !date}
          className="bg-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? "Duke kërkuar..." : "Kërko"}
        </button>
        {result && result.totalPax > 0 && (
          <a
            href={`${apiBase}/dashboard/passengers-search/pdf?${qs()}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-primary text-primary text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/5 transition-colors"
          >
            Shkarko PDF
          </a>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      {result && (
        <div className="mt-4">
          <div className="flex items-center gap-4 flex-wrap mb-2">
            <p className="text-sm">
              <span className="font-bold text-lg">{result.totalPax}</span>{" "}
              <span className="text-muted-foreground">pasagjerë më {dateLabel(result.date)}</span>
            </p>
            <p className="text-sm">
              <span className="font-bold text-lg text-emerald-600">€{fmtM(result.totalCommission)}</span>{" "}
              <span className="text-muted-foreground">komision total</span>
            </p>
            <p className="text-sm">
              <span className="font-bold text-lg">{result.flights.length}</span>{" "}
              <span className="text-muted-foreground">fluturime</span>
            </p>
          </div>
          {result.flights.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nuk u gjet asnjë pasagjer për këto kritere.</p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {result.flights.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-white hover:bg-muted/40">
                  <span className="font-medium truncate">{f.title}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-muted-foreground">{f.pax} pax</span>
                    <span className="font-semibold text-emerald-600">€{fmtM(f.commission)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UpcomingPaxChart({ apiBase, dateFrom, dateTo }: { apiBase: string; dateFrom: string; dateTo: string }) {
  const [days, setDays] = useState<{ date: string; label: string; count: number }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ dateFrom, dateTo });
    fetch(`${apiBase}/dashboard/passengers-upcoming?${params}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive) { setDays(d?.days ?? []); setLoading(false); } })
      .catch(() => { if (alive) { setDays([]); setLoading(false); } });
    return () => { alive = false; };
  }, [apiBase, dateFrom, dateTo]);

  const total = (days ?? []).reduce((s, d) => s + d.count, 0);
  const tickInterval = Math.max(0, Math.ceil((days?.length ?? 1) / 12) - 1);

  return (
    <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-sky-600 flex items-center justify-center shrink-0">
            <Plane className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Pasagjerë sipas Intervalit</p>
            <p className="text-[11px] text-muted-foreground">Numri i pasagjerëve me fluturim çdo ditë</p>
          </div>
        </div>
        {!loading && (
          <p className="text-sm">
            <span className="font-bold text-lg text-sky-600">{total}</span>{" "}
            <span className="text-muted-foreground">pasagjerë gjithsej</span>
          </p>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={days ?? []} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip
              formatter={(v: any) => [`${v} pasagjerë`, "Pasagjerë"]}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="count" name="Pasagjerë" fill="#0284c7" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { hasPermission, user } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const { data: unpaidBookings, isLoading: isLoadingUnpaid } = useGetUnpaidBookings();
  // "Sot" sipas orës së Shqipërisë (Europe/Tirane), jo sipas orës së shfletuesit.
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });
  const [paxFrom, setPaxFrom] = useState(todayStr);
  const [paxTo, setPaxTo] = useState(todayStr);
  const paxRangeValid = !!paxFrom && !!paxTo && paxFrom <= paxTo;
  // Interval i pavlefshëm ⇒ bie te "sot" (edhe etiketa reflekton këtë).
  const effPaxFrom = paxRangeValid ? paxFrom : todayStr;
  const effPaxTo   = paxRangeValid ? paxTo   : todayStr;
  const { data: paxToday, isLoading: isLoadingPaxToday } = useGetPassengersToday(
    { dateFrom: effPaxFrom, dateTo: effPaxTo },
  );
  const paxIsToday = effPaxFrom === todayStr && effPaxTo === todayStr;
  const { data: draftBookings = [], isLoading: isLoadingDraft } = useListBookings({ status: "draft" });
  const { data: pendingBookings = [], isLoading: isLoadingPending } = useListBookings({ status: "pending" });
  const { data: confirmedBookings = [], isLoading: isLoadingConfirmed } = useListBookings({ status: "confirmed" });
  const [analytics, setAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [chartView, setChartView] = useState<"30d" | "12m">("30d");
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const fetchAnalytics = useCallback((p: Period, from?: string, to?: string) => {
    setLoadingAnalytics(true);
    let dateFrom: string, dateTo: string;
    if (p === "custom" && from && to) {
      dateFrom = from; dateTo = to;
    } else if (p !== "custom") {
      ({ dateFrom, dateTo } = getPeriodDates(p));
    } else {
      setLoadingAnalytics(false);
      return;
    }
    fetch(`${API_BASE}/dashboard/analytics?dateFrom=${dateFrom}&dateTo=${dateTo}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setAnalytics(d); setLoadingAnalytics(false); })
      .catch(() => setLoadingAnalytics(false));
  }, []);

  useEffect(() => {
    fetchAnalytics(period);
  }, []);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    if (p !== "custom") fetchAnalytics(p);
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) fetchAnalytics("custom", customFrom, customTo);
  };

  const chartData = chartView === "30d"
    ? (analytics?.revenueByDay ?? [])
    : (analytics?.revenueByMonth ?? []);

  const pieData = analytics?.statusBreakdown
    ? Object.entries(analytics.statusBreakdown).map(([status, count]) => ({
        name: STATUS_LABELS[status] ?? status,
        value: count as number,
        fill: STATUS_COLORS[status] ?? "#6b7280",
      }))
    : [];

  const topDest = analytics?.topDestinations ?? [];
  const maxDestCount = Math.max(...topDest.map((d: any) => d.count), 1);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("sq-AL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        {hasPermission("can_use_dashboard_new_booking_button") && (
          <Link href="/bookings/new">
            <button className="flex items-center gap-2 bg-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
              <Ticket className="h-4 w-4" /> Rezervim i Ri
            </button>
          </Link>
        )}
      </div>

      {/* Pasagjerë për fluturim — kartë e vogël në fillim, me filtër datash */}
      <div className="inline-flex items-center gap-3 bg-white border border-border rounded-xl px-3.5 py-2 shadow-sm flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-sky-500 flex items-center justify-center shrink-0">
            <Plane className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {paxIsToday ? "Pasagjerë Sot" : "Pasagjerë në Interval"}
            </p>
            {isLoadingPaxToday ? (
              <Skeleton className="h-5 w-10 mt-0.5" />
            ) : (
              <p className="text-lg font-bold text-foreground">
                {paxToday?.count ?? 0}
                <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                  {paxIsToday ? "fluturojnë sot" : "pasagjerë me fluturim"}
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
          <input
            type="date" value={paxFrom} onChange={e => setPaxFrom(e.target.value)}
            className="border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Data e fillimit"
          />
          <span className="text-muted-foreground text-xs">—</span>
          <input
            type="date" value={paxTo} onChange={e => setPaxTo(e.target.value)}
            className="border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Data e mbarimit"
          />
          {!paxIsToday && (
            <button
              onClick={() => { setPaxFrom(todayStr); setPaxTo(todayStr); }}
              className="text-xs font-medium text-primary hover:underline px-1.5"
            >
              Sot
            </button>
          )}
        </div>
        {!paxRangeValid && (
          <p className="text-xs text-red-500">Data e fillimit s'mund të jetë pas asaj të mbarimit.</p>
        )}
      </div>

      {/* Grafik: pasagjerë për ditë në të njëjtin interval si kartela sipër */}
      <UpcomingPaxChart apiBase={API_BASE} dateFrom={effPaxFrom} dateTo={effPaxTo} />

      {/* Kërkim pasagjerësh sipas fluturimit — VETËM ADMIN */}
      {isAdmin && <PaxSearchPanel apiBase={API_BASE} />}

      {/* Period Filter Bar */}
      {hasPermission("can_use_dashboard_period_selector") && (
          <div className="page-filter-panel bg-white border border-border rounded-xl p-3 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">
            <Calendar className="h-3.5 w-3.5" />
            Periudha
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {(Object.keys(PERIOD_LABELS) as Period[]).filter(p => p !== "custom" || hasPermission("can_use_dashboard_custom_period")).map(p => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  period === p
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex items-center gap-2 ml-2 flex-wrap">
              <input
                type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-muted-foreground text-xs">—</span>
              <input
                type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={handleCustomApply}
                disabled={!customFrom || !customTo}
                className="bg-primary text-white text-sm px-4 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors font-medium"
              >
                Apliko
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {hasPermission("can_view_dashboard_kpi_sales") && (
        <KpiCard
          title="Shitjet Totale"
          value={analytics ? fmt(analytics.totalRevenue) : "€0.00"}
          sub={`${analytics?.activeBookings ?? 0} rezervime aktive`}
          icon={TrendingUp}
          color="bg-blue-500"
          loading={loadingAnalytics}
        />)}
        {hasPermission("can_view_dashboard_kpi_paid") && (
        <KpiCard
          title="Totali i Paguar"
          value={analytics ? fmt(analytics.totalPaid) : "€0.00"}
          sub="pagesa të konfirmuara"
          icon={Wallet}
          color="bg-emerald-500"
          loading={loadingAnalytics}
        />)}
        {hasPermission("can_view_dashboard_kpi_debt") && (
        <KpiCard
          title="Borxh Total"
          value={analytics ? fmt(analytics.totalDebt) : "€0.00"}
          sub={`${(unpaidBookings ?? []).length} pa paguar`}
          icon={AlertCircle}
          color="bg-red-500"
          loading={loadingAnalytics}
        />)}
        {hasPermission("can_view_dashboard_kpi_commission") && (
        <KpiCard
          title="Komisioni"
          value={analytics ? fmt(analytics.totalCommission ?? 0) : "€0.00"}
          sub="fitim neto"
          icon={DollarSign}
          color="bg-violet-500"
          loading={loadingAnalytics}
        />)}
        {hasPermission("can_view_dashboard_kpi_bookings") && (
        <KpiCard
          title="Rezervime"
          value={analytics ? String(analytics.activeBookings ?? 0) : "0"}
          sub={PERIOD_LABELS[period]}
          icon={Ticket}
          color="bg-amber-500"
          loading={loadingAnalytics}
        />)}
        {hasPermission("can_view_dashboard_kpi_passengers") && (
        <KpiCard
          title="Pasagjerë"
          value={analytics ? String((analytics as any).totalPassengers ?? 0) : "0"}
          sub={PERIOD_LABELS[period]}
          icon={Users}
          color="bg-sky-500"
          loading={loadingAnalytics}
        />)}
      </div>

      {/* Revenue Chart */}
      {hasPermission("can_view_dashboard_revenue_chart") && (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Të Ardhurat</CardTitle>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setChartView("30d")}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${chartView === "30d" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >30 Ditë</button>
              <button
                onClick={() => setChartView("12m")}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${chartView === "12m" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >12 Muaj</button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingAnalytics ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={chartView === "30d" ? 4 : 0} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `€${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="revenue" name="Të Ardhura"
                  stroke="#3b82f6" strokeWidth={2}
                  fill="url(#revGrad)" dot={false} activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      )}

      {/* Middle row: Top Destinations + Status Donut */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Top Destinations */}
        {hasPermission("can_view_dashboard_top_destinations") && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Top Destinacionet
              </CardTitle>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{PERIOD_LABELS[period]}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingAnalytics ? (
              [1,2,3,4,5].map(i => <Skeleton key={i} className="h-9 w-full" />)
            ) : topDest.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nuk ka të dhëna për periudhën</p>
            ) : topDest.map((d: any, i: number) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    {i === 0 && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    <span>{d.from}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span>{d.to}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{d.count} rez.</span>
                    <span>{fmt(d.revenue)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${i === 0 ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${(d.count / maxDestCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        )}

        {/* Status Donut */}
        {hasPermission("can_view_dashboard_status_donut") && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" /> Statuset
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAnalytics || pieData.length === 0 ? (
              <div className="flex items-center justify-center h-36">
                <Skeleton className="h-32 w-32 rounded-full" />
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                      dataKey="value" paddingAngle={2}>
                      {pieData.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-1">
                  {pieData.map((d: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />
                        <span className="text-muted-foreground">{d.name}</span>
                      </div>
                      <span className="font-semibold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {/* Almost Sold Out */}
      {hasPermission("can_view_dashboard_almost_sold_out") && (analytics?.almostSoldOut ?? []).length > 0 && (
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-orange-700">
              <Flame className="h-4 w-4 text-orange-500" /> Gati Sold Out
              <span className="text-xs font-normal text-orange-500 ml-1">— më pak se 10 vende të lira</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(analytics.almostSoldOut as any[]).map((f: any) => {
                const pct = Math.round((f.soldSeats / f.totalSeats) * 100);
                const isUrgent = f.availableSeats <= 3;
                return (
                  <Link key={f.id} href={`/flights/${f.id}`}>
                    <div className={`rounded-lg border p-3 bg-white hover:shadow-md transition-shadow cursor-pointer ${isUrgent ? "border-red-300" : "border-orange-200"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          <Plane className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>{f.fromCity}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span>{f.toCity}</span>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isUrgent ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                          {f.availableSeats} vende
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mb-2 flex justify-between">
                        <span className="font-mono">{fmtFlightNum(f.flightNumber)}</span>
                        {f.departureDate && (
                          <span>{new Date(f.departureDate).toLocaleDateString("sq-AL", { day: "2-digit", month: "short" })}</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{f.soldSeats}/{f.totalSeats} shitur</span>
                          <span className={`font-bold ${isUrgent ? "text-red-600" : "text-orange-600"}`}>{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isUrgent ? "bg-red-500" : "bg-orange-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bottom row: Top Agents + High Dates + status lists */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">

        {/* Top Agents */}
        {hasPermission("can_view_dashboard_top_agents") && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Top Agjentët
              </CardTitle>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{PERIOD_LABELS[period]}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingAnalytics ? (
              [1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full" />)
            ) : (analytics?.topAgents ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nuk ka të dhëna për periudhën</p>
            ) : (analytics.topAgents as any[]).map((a: any, i: number) => {
              const maxRev = analytics.topAgents[0].revenue || 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${
                    i === 0 ? "bg-amber-500" : i === 1 ? "bg-slate-400" : i === 2 ? "bg-orange-400" : "bg-muted-foreground/30"
                  }`}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-medium truncate">{a.name}</span>
                      <span className="text-muted-foreground ml-2 shrink-0">{fmt(a.revenue)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(a.revenue / maxRev) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        )}

        {/* High Dates */}
        {hasPermission("can_view_dashboard_high_dates") && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Datat me Fluturime
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingAnalytics ? (
              [1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-10 w-full" />)
            ) : (analytics?.highDates ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nuk ka të dhëna</p>
            ) : (analytics.highDates as any[]).map((d: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <Plane className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-sm font-medium">{d.label}</span>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                    {d.count} rez.
                  </Badge>
                  <span className="text-xs text-muted-foreground font-medium">{fmt(d.revenue)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        )}

        {/* Bookings by status: Draft / Pending / Confirmed */}
        {([
          { key: "draft",     title: "Draft",      data: draftBookings,     loading: isLoadingDraft,
            titleClass: "text-slate-600", icon: "bg-slate-100 text-slate-700",
            cardClass: "border-slate-200",       itemClass: "border-slate-200 bg-slate-50 hover:bg-slate-100",        labelClass: "text-slate-700" },
          { key: "pending",   title: "Pending",    data: pendingBookings,   loading: isLoadingPending,
            titleClass: "text-amber-600", icon: "bg-amber-100 text-amber-700",
            cardClass: "border-amber-200",       itemClass: "border-amber-200 bg-amber-50 hover:bg-amber-100",        labelClass: "text-amber-700" },
          { key: "confirmed", title: "Confirmed",  data: confirmedBookings, loading: isLoadingConfirmed,
            titleClass: "text-blue-600",  icon: "bg-blue-100 text-blue-700",
            cardClass: "border-blue-200",        itemClass: "border-blue-200 bg-blue-50 hover:bg-blue-100",           labelClass: "text-blue-700" },
        ] as const).map(s => (
          <StatusBookingsCard
            key={s.key}
            statusKey={s.key}
            title={s.title}
            data={s.data as any[]}
            loading={s.loading}
            titleClass={s.titleClass}
            iconClass={s.icon}
            cardClass={s.cardClass}
            itemClass={s.itemClass}
            labelClass={s.labelClass}
            onOpenBooking={(id) => setSelectedBookingId(id)}
          />
        ))}
      </div>

      {/* Booking Modal */}
      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle></DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBookingsCard({
  statusKey, title, data, loading, titleClass, iconClass, cardClass, itemClass, labelClass, onOpenBooking,
}: {
  statusKey: string;
  title: string;
  data: any[];
  loading: boolean;
  titleClass: string;
  iconClass: string;
  cardClass: string;
  itemClass: string;
  labelClass: string;
  onOpenBooking: (id: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) { setCanUp(false); setCanDown(false); return; }
    setCanUp(el.scrollTop > 4);
    setCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => { updateScrollState(); }, [data, updateScrollState]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ top: dir * (el.clientHeight - 40), behavior: "smooth" });
  };

  const fmtFlightDate = (iso?: string | null) => {
    if (!iso) return null;
    try { return format(parseISO(iso), "dd MMM"); } catch { return null; }
  };

  return (
    <Card className={cardClass}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className={`text-base flex items-center gap-2 ${titleClass}`}>
            <Ticket className="h-4 w-4" /> {title}
          </CardTitle>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${iconClass}`}>
            {data.length}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-green-500/40" />
            <p className="text-sm">S'ka rezervime</p>
          </div>
        ) : (
          <>
            <div className="relative">
              <div
                ref={scrollRef}
                onScroll={updateScrollState}
                className="space-y-2 max-h-[340px] overflow-y-auto pr-1 scroll-smooth"
              >
                {data.map((b: any) => {
                  const pax = Array.isArray(b.passengers) ? b.passengers.length : 0;
                  const route = b.flight ? `${b.flight.fromCity} → ${b.flight.toCity}` : null;
                  const agency = b.agentName ?? "Klient Direkt";
                  const fdate = fmtFlightDate(b.flight?.departureDate);
                  return (
                    <button
                      key={b.id}
                      onClick={() => onOpenBooking(b.id)}
                      className={`w-full flex flex-col gap-1 px-3 py-2 rounded-lg border transition-colors text-left ${itemClass}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-bold ${labelClass} truncate`}>{b.bookingRef}</p>
                        <span className={`text-xs font-bold ${labelClass} shrink-0`}>{fmt(Number(b.totalAmount ?? 0))}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{b.customerName}</p>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="truncate flex items-center gap-1">
                          <Users className="h-3 w-3 shrink-0" />
                          {pax} pers.
                          <span className="mx-1 opacity-50">·</span>
                          <span className="truncate">{agency}</span>
                        </span>
                        {route && (
                          <span className="flex items-center gap-1 shrink-0">
                            <Plane className="h-3 w-3" />
                            <span className="font-medium">{route}</span>
                          </span>
                        )}
                      </div>
                      {fdate && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="font-medium">{fdate}</span>
                          {b.flight?.flightNumber && (
                            <span className="opacity-70">· {b.flight.flightNumber}</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {(canUp || canDown) && (
                <div className="absolute -right-1 top-1/2 -translate-y-1/2 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => scrollBy(-1)}
                    disabled={!canUp}
                    className={`h-7 w-7 rounded-full border bg-white shadow-sm flex items-center justify-center transition ${canUp ? "text-foreground hover:bg-muted" : "text-muted-foreground/40 cursor-not-allowed"}`}
                    aria-label="Lart"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollBy(1)}
                    disabled={!canDown}
                    className={`h-7 w-7 rounded-full border bg-white shadow-sm flex items-center justify-center transition ${canDown ? "text-foreground hover:bg-muted" : "text-muted-foreground/40 cursor-not-allowed"}`}
                    aria-label="Poshtë"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <Link
              href={`/bookings?status=${statusKey}`}
              className={`mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg border ${itemClass}`}
            >
              <span className={labelClass}>Shiko më shumë</span>
              <ArrowRight className={`h-3.5 w-3.5 ${labelClass}`} />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
