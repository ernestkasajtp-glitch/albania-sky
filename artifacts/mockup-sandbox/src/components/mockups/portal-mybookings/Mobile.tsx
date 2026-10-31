import { useEffect, useMemo, useState } from "react";
import { Plane, Search, X, Clock, CheckCircle2, Ticket, XCircle, ArrowRight, ChevronDown, ChevronUp, FileText, Download, Receipt, CreditCard } from "lucide-react";
import MyBookingsSource from "./_MobileSource";
import { api, useAuth, useTranslation } from "./_services";
import { PaymentReports } from "./_PaymentReports";
import "./Mobile.css";

// Mobile presentation of the current _MobileSource booking flow.
// The authoritative desktop component is rendered without layout changes.
const STATUS_MAP = {
  draft: { label: "Dërguar", icon: Clock },
  confirmed: { label: "Konfirmuar", icon: CheckCircle2 },
  ticketed: { label: "Ticketed", icon: Ticket },
  cancelled: { label: "Anuluar", icon: XCircle },
};
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n: number) {
  return Math.round(Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 0 });
}
type Booking = Awaited<ReturnType<typeof api.myBookings>>[number];

function MobileBookings() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBk, setLoadingBk] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [bookingPage, setBookingPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const bookingPageSize = 30;
  function loadBookings() {
    setLoadingBk(true);
    setError("");
    api.myBookings().then(setBookings).catch(err => setError(err.message)).finally(() => setLoadingBk(false));
  }
  useEffect(() => { loadBookings(); }, []);
  useEffect(() => { setBookingPage(1); setExpanded(null); }, [search, statusFilter, sortBy]);
  const filtered = useMemo(() => {
    let list = [...bookings];
    if (statusFilter !== "all") list = list.filter(b => b.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => [b.bookingRef, b.customerName, b.customerEmail, b.fromCity, b.toCity, b.flightNumber, b.pnr].some(v => v?.toLowerCase().includes(q)));
    }
    if (sortBy === "amount") list.sort((a, b) => b.totalAmount - a.totalAmount);
    else list.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || Number(b.id) - Number(a.id));
    return list;
  }, [bookings, search, statusFilter, sortBy]);
  const stats = useMemo(() => {
    const active = bookings.filter(b => b.status !== "cancelled");
    return {
      total: active.reduce((s, b) => s + b.totalAmount, 0),
      paid: active.reduce((s, b) => s + b.paidAmount, 0),
      due: active.reduce((s, b) => s + b.dueAmount, 0),
      byStatus: bookings.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {} as Record<string, number>),
      count: bookings.length,
    };
  }, [bookings]);
  const bookingPageCount = Math.max(1, Math.ceil(filtered.length / bookingPageSize));
  const currentBookingPage = Math.min(bookingPage, bookingPageCount);
  const visibleBookings = filtered.slice((currentBookingPage - 1) * bookingPageSize, currentBookingPage * bookingPageSize);
  const activeFiltered = filtered.filter(b => b.status !== "cancelled");
  const totalSum = activeFiltered.reduce((s, b) => s + b.totalAmount, 0);
  const paidSum = activeFiltered.reduce((s, b) => s + b.paidAmount, 0);
  const dueSum = activeFiltered.reduce((s, b) => s + b.dueAmount, 0);
  function previewOnly() { setMessage("Prototip vizual — të dhëna shembull. Nuk shkarkohet dokument dhe nuk dërgohet email."); }
  return <div className="as-phone">
    <header className="as-header">
      <div className="as-brand"><Plane strokeWidth={1.7} /><span>Albania Sky</span><small>{user.agencyName}</small></div>
      <p className="as-eyebrow">{t("Llogaria Juaj")}</p>
      <h1>{t("Rezervimet e Mia")}</h1>
      <p className="as-intro">{t("Të gjitha rezervimet dhe transaksionet e agjencisë suaj")}</p>
      <div className="as-stats" aria-label="Statistikat">
        {[
          { label: "Gjithsej", value: stats.count.toString(), sub: "rezervime", cls: "" },
          { label: "Shuma Totale", value: `€${fmtMoney(stats.total)}`, sub: "të gjitha", cls: "" },
          { label: "Paguar", value: `€${fmtMoney(stats.paid)}`, sub: `${stats.total > 0 ? Math.round(stats.paid / stats.total * 100) : 0}% e totalit`, cls: "as-paid" },
          { label: "Mbetet", value: `€${fmtMoney(stats.due)}`, sub: "borxh i papaguar", cls: "as-due" },
        ].map(s => <div className={`as-stat ${s.cls}`} key={s.label}><span>{t(s.label)}</span><strong>{s.value}</strong><small>{t(s.sub)}</small></div>)}
      </div>
      {user.role === "agent" && user.agentId && <details className="as-reports">
        <summary><FileText size={15} />{t("Raporte pagesash")}<ChevronDown size={15} /></summary>
        <PaymentReports />
      </details>}
      <button className="as-tab" onClick={() => { setStatusFilter("all"); setSearch(""); }}><Plane size={15} />{t("Rezervimet")}<span>{bookings.length}</span></button>
    </header>
    <main className="as-content">
      <div className="as-search">
        <Search size={17} />
        <input aria-label={t("Kërko sipas ref, emrit, rrugës, PNR...")} placeholder={t("Kërko sipas ref, emrit, rrugës, PNR...")} value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button aria-label="Pastro kërkimin" onClick={() => setSearch("")}><X size={15} /></button>}
      </div>
      <div className="as-filters" aria-label="Statusi">
        {[{ key: "all", label: "Të Gjitha", count: bookings.length }, ...Object.entries(STATUS_MAP).map(([key, status]) => ({ key, label: status.label, count: stats.byStatus[key] || 0 }))].map(st =>
          <button key={st.key} aria-pressed={statusFilter === st.key} onClick={() => setStatusFilter(st.key)}>{t(st.label)}<span>{st.count}</span></button>)}
      </div>
      <div className="as-list-heading">
        <h2>{t("{{count}} rezervime", { count: filtered.length })}</h2>
        <select aria-label="Rendit" value={sortBy} onChange={e => setSortBy(e.target.value as "date" | "amount")}>
          <option value="date">{t("Rendit: Data")}</option><option value="amount">{t("Rendit: Shuma")}</option>
        </select>
      </div>
      {message && <div className="as-message" role="status">{message}<button aria-label="Mbyll" onClick={() => setMessage("")}><X size={14} /></button></div>}
      {error && <div role="alert" className="as-message">{error}<button onClick={loadBookings}>Provo përsëri</button></div>}
      {loadingBk ? <div className="as-card animate-pulse p-5 space-y-5" aria-label={t("Duke ngarkuar...")}><div className="h-5 bg-slate-100 rounded" /><div className="h-24 bg-slate-100 rounded" /><div className="h-16 bg-slate-100 rounded" /></div>
        : !filtered.length ? <div className="as-empty"><Search size={26} /><h3>{t(bookings.length ? "Asnjë rezultat" : "Asnjë rezervim ende")}</h3><button onClick={() => { setSearch(""); setStatusFilter("all"); }}>{t("Pastro filtrat")}</button></div>
        : visibleBookings.map(b => {
          const st = STATUS_MAP[b.status as keyof typeof STATUS_MAP];
          const Icon = st?.icon || FileText;
          const isOpen = expanded === b.id;
          return <article key={b.id} className="as-card">
            <div className="as-card-head"><span className="as-reference">{b.bookingRef}</span><span className={`as-status as-status-${b.status}`}><Icon size={11} />{t(st?.label || b.status)}</span></div>
            <div className="as-card-body">
              <h3 className="as-name">{b.customerName}</h3>
              {b.customerEmail && <div className="as-email">{b.customerEmail}</div>}
              <div className="as-route"><span>{b.fromCity || "—"}</span><ArrowRight size={19} strokeWidth={1.5} /><span>{b.toCity || "—"}</span></div>
              <div className="as-flight"><span>{b.airline} · {b.flightNumber}</span><strong>{b.departureDate ? fmtDate(b.departureDate) : fmtDate(b.createdAt)}</strong></div>
              <div className="as-pnr"><code>PNR: {b.pnr || "—"}</code><span>{t("Rezervuar:")} {fmtDate(b.createdAt)}</span></div>
              <div className="as-money">
                <div><span>{t("Shuma Totale")}</span><strong style={b.status === "cancelled" ? { textDecoration: "line-through", opacity: .45 } : undefined}>€{fmtMoney(b.totalAmount)}</strong></div>
                <div className="as-paid"><span>{t("Paguar")}</span><strong>€{fmtMoney(b.paidAmount)}</strong></div>
                <div className={b.dueAmount > 0 ? "as-due" : "as-paid"}><span>{t("Mbetet")}</span><strong>€{fmtMoney(b.dueAmount)}</strong></div>
              </div>
            </div>
            <button className="as-expand" aria-expanded={isOpen} aria-controls={`booking-${b.id}`} onClick={() => setExpanded(isOpen ? null : b.id)}>{t("Shiko Detajin të Plotë")}{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
            {isOpen && <div className="as-expanded" id={`booking-${b.id}`}>
              <h3><Receipt size={14} />{t("Gjendja Financiare")}</h3>
              {b.status === "cancelled" ? <><p>{t("Rezervimi u anullua")}</p><p>{t("Ky rezervim nuk llogaritet si detyrim.")}</p></> : <>
                <div className="as-balance"><span>{t("Paguar")}</span><span>{b.totalAmount > 0 ? Math.round(b.paidAmount / b.totalAmount * 100) : 0}%</span></div>
                <progress style={{ width: "100%", accentColor: "#257961" }} value={b.paidAmount} max={Math.max(b.totalAmount, 1)} />
                <div className="as-balance"><span>{t("Shuma Totale")}</span><strong>€{fmtMoney(b.totalAmount)}</strong></div>
                <div className="as-balance"><span>{t("Paguar")}</span><strong>€{fmtMoney(b.paidAmount)}</strong></div>
                <div className="as-balance"><span>{t("Mbetet")}</span><strong>{b.dueAmount <= 0 ? t("Shlyer") : `€${fmtMoney(b.dueAmount)}`}</strong></div>
              </>}
              <div className="as-history"><h3><CreditCard size={14} />{t("Historia e Pagesave")}</h3>
                {!b.payments.length ? <p>{t("Asnjë pagesë e regjistruar")}</p> : b.payments.map((p: any) => <div className="as-payment" key={p.id}>
                  <div className="as-balance"><span>{fmtDate(p.createdAt)}</span><strong>{p.isRefund ? "−" : "+"}€{fmtMoney(p.amount)}</strong></div>
                  <small>{p.method}{p.notes ? ` · ${p.notes}` : ""} · Ref: {p.reference || "—"}</small>
                </div>)}
                {!!b.payments.length && <div className="as-balance"><span>{t("Gjithsej Paguar")}</span><strong>€{fmtMoney(b.paidAmount)}</strong></div>}
              </div>
              {b.notes && <p>{t("Shënime:")} {b.notes}</p>}
              <div className="as-actions">
                <button onClick={previewOnly}><Download size={14} />{t("Shkarko PDF")}</button>
                <button onClick={previewOnly}>{t("Shiko Detajin të Plotë")}<ArrowRight size={14} /></button>
              </div>
            </div>}
          </article>;
        })}
      {filtered.length > 1 && <section className="as-totals">
        <h3>{t("{{count}} rezervime", { count: filtered.length })}</h3>
        <div className="as-balance"><span>{t("Gjithsej:")}</span><strong>€{fmtMoney(totalSum)}</strong></div>
        <div className="as-balance"><span>{t("Paguar:")}</span><strong>€{fmtMoney(paidSum)}</strong></div>
        {dueSum > 0 && <div className="as-balance"><span>{t("Mbetet:")}</span><strong>€{fmtMoney(dueSum)}</strong></div>}
      </section>}
      {filtered.length > 0 && <nav className="as-pagination" aria-label="Faqet e rezervimeve">
        <button disabled={currentBookingPage <= 1} onClick={() => { setBookingPage(p => p - 1); setExpanded(null); }}>Para</button>
        <span>{currentBookingPage} / {bookingPageCount} · 30 / faqe</span>
        <button disabled={currentBookingPage >= bookingPageCount} onClick={() => { setBookingPage(p => p + 1); setExpanded(null); }}>Pas</button>
      </nav>}
      <p className="as-notice">Prototip vizual · Të dhëna shembull<br />PDF dhe email nuk dërgohen.</p>
      <p className="as-notice">© 2026 Albania Sky. {t("Të gjitha të drejtat e rezervuara.")}</p>
    </main>
  </div>;
}

export default function Mobile() {
  return <div className="as-mobile-proposal"><div className="as-desktop"><MyBookingsSource /></div><MobileBookings /></div>;
}
