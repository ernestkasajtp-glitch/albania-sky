import { useEffect, useMemo, useState } from "react";
import { demoBookings, demoTransactions } from "./_services";
import { ArrowDownUp, ArrowRight, Banknote, CalendarDays, ChevronDown, ChevronRight, ChevronUp, CircleAlert, FileText, Plane, Search, ShieldCheck, Wallet, X } from "lucide-react";

type Booking = (typeof demoBookings)[number];
type Variant = "table" | "split" | "cards";
type Tab = "bookings" | "transactions";
const statuses = [
  ["all", "Të gjitha"], ["draft", "Dërguar"], ["confirmed", "Konfirmuar"], ["ticketed", "Ticketed"], ["cancelled", "Anuluar"],
];
const money = (n: number) => `€${Math.round(n).toLocaleString("de-DE")}`;
const date = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("sq-AL", { day: "2-digit", month: "short" });
const label: Record<string, string> = { draft: "Dërguar", confirmed: "Konfirmuar", ticketed: "Ticketed", cancelled: "Anuluar" };

function Header() {
  return <header className="myb-topbar"><div className="myb-shell myb-nav">
    <div className="myb-brand"><span className="myb-brand-mark"><Plane size={16}/></span>Albania Sky</div>
    <span className="myb-navlink">Fluturime</span><span className="myb-navlink active">Rezervimet e Mia</span>
    <div className="myb-account"><span className="myb-lang">SQ&nbsp; / &nbsp;EN</span><span className="myb-agent">AB</span><span className="myb-agency">AB TRAVEL</span></div>
  </div></header>;
}

function Reports() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("full");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const submit = () => setMessage("Demonstrim — nuk shkarkohet dokument dhe nuk dërgohet email.");
  return <section className="myb-reports">
    <button className="myb-report-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
      <FileText size={15}/><strong>Raporte pagesash</strong><small>PDF dhe email · vetëm demonstrim</small>{open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
    </button>
    {open && <div className="myb-report-form">
      <div className="myb-field"><label>Lloji i raportit</label><select value={kind} onChange={e => setKind(e.target.value)}><option value="full">Raport i Detajuar</option><option value="debt">Raport Detyrimet</option></select></div>
      <div className="myb-field"><label>Nga data e rezervimit</label><input aria-label="Nga data e rezervimit" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)}/></div>
      <div className="myb-field"><label>Deri më datë</label><input aria-label="Deri më datë" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)}/></div>
      <button className="myb-button" onClick={submit} disabled={!!(from && to && from > to)}><FileText size={14}/> Shkarko PDF + Email</button>
      {message && <p className="myb-report-message" role="status">{message}</p>}
    </div>}
  </section>;
}

function Status({ value }: { value: string }) {
  return <span className={`myb-status-pill ${value}`}><i/> {label[value] || value}</span>;
}

function Detail({ booking, onPreview, onNotice, dock = false }: { booking: Booking; onPreview: (b: Booking) => void; onNotice: (s: string) => void; dock?: boolean }) {
  const cancelled = booking.status === "cancelled";
  const paidPercent = booking.totalAmount ? Math.min(100, Math.round(booking.paidAmount / booking.totalAmount * 100)) : 0;
  return <div className={dock ? "myb-detail-dock" : "myb-inline-detail"}>
    {dock && <><p className="myb-eyebrow">Detajet e rezervimit</p><h2>{booking.fromCity} <ArrowRight size={15}/> {booking.toCity}</h2><div className="myb-secondary">{booking.bookingRef} · {booking.customerName}</div><div style={{marginTop:10}}><Status value={booking.status}/></div><div className="myb-secondary" style={{marginTop:8}}>Nisja: {date(booking.departureDate)} · {booking.airline} · {booking.flightNumber}</div></>}
    <div className="myb-detail-grid">
      <section className="myb-detail-card">
        <h3 className="myb-card-title"><Wallet size={14}/> Gjendja financiare</h3>
        {cancelled ? <div className="myb-empty" style={{padding:18}}><CircleAlert size={19}/><strong>Rezervimi u anulua</strong>Ky rezervim nuk llogaritet si detyrim.</div> : <>
          <div className="myb-amountline"><span>Paguar · {paidPercent}%</span><strong className="myb-paid">{money(booking.paidAmount)}</strong></div>
          <div className="myb-meter"><i style={{width:`${paidPercent}%`}}/></div>
          <div className="myb-amountline"><span>Shuma totale</span><strong>{money(booking.totalAmount)}</strong></div>
          <div className="myb-amountline"><span>Paguar</span><strong className="myb-paid">{money(booking.paidAmount)}</strong></div>
          <div className="myb-amountline"><span><b>Mbetet</b></span><strong className={booking.dueAmount ? "myb-due" : "myb-paid"}>{booking.dueAmount ? money(booking.dueAmount) : "Shlyer"}</strong></div>
        </>}
        {booking.pnr && <div className="myb-secondary" style={{marginTop:10}}>PNR: <span className="myb-mono">{booking.pnr}</span></div>}
      </section>
      <section className="myb-detail-card">
        <h3 className="myb-card-title"><Banknote size={14}/> Historia e pagesave</h3>
        {!booking.payments.length ? <div className="myb-empty" style={{padding:18}}>Asnjë pagesë e regjistruar</div> : <>
          <div className="myb-payment" style={{color:"#819099",fontWeight:700}}><span>Data / metoda</span><span>Ref</span><span>Shuma</span></div>
          {booking.payments.map(p => <div className="myb-payment" key={p.id}><span>{date(p.createdAt)}<small className="myb-secondary">{p.method}</small></span><span className="myb-mono">—</span><strong className="myb-paid">+{money(p.amount)}</strong></div>)}
          <div className="myb-amountline"><strong>Gjithsej paguar</strong><strong className="myb-paid">{money(booking.paidAmount)}</strong></div>
        </>}
      </section>
    </div>
    <div className="myb-detail-actions">
      <button className="myb-button secondary" onClick={() => onPreview(booking)}><FileText size={13}/> Shkarko PDF</button>
      <button className="myb-button" onClick={() => onNotice("Demonstrim — detaji i plotë nuk hapet në këtë pamje.")}>Shiko detajin e plotë <ArrowRight size={13}/></button>
    </div>
  </div>;
}

function TableRows({ list, expanded, setExpanded, selected, setSelected, variant, onPreview, onNotice }: {
  list: Booking[]; expanded: number | null; setExpanded: (n: number | null) => void;
  selected: number; setSelected: (n: number) => void; variant: Variant;
  onPreview: (b: Booking) => void; onNotice: (s: string) => void;
}) {
  return <div className="myb-table-wrap">
    <div className="myb-table-head"><span>Referenca</span><span>Pasagjeri</span><span>Rruga</span><span className={variant === "split" ? "hide-split" : ""}>Data nisjes</span><span className={variant === "split" ? "hide-split" : ""}>Statusi</span><span style={{textAlign:"right"}}>Shuma / mbetet</span><span/></div>
    {list.map(b => {
      const open = variant === "split" ? selected === b.id : expanded === b.id;
      return <div key={b.id}>
        <button className={`myb-table-row ${open && variant === "split" ? "selected" : ""}`} onClick={() => variant === "split" ? setSelected(b.id) : setExpanded(open ? null : b.id)} aria-expanded={open}>
          <span><span className="myb-mono myb-ref">{b.bookingRef}</span>{b.pnr && <small className="myb-secondary">PNR {b.pnr}</small>}</span>
          <span className="myb-person">{b.customerName}<small className="myb-secondary">AB TRAVEL</small></span>
          <span className="myb-route">{b.fromCity} <ArrowRight size={12}/> {b.toCity}<small className="myb-secondary">{b.airline} · {b.flightNumber}</small></span>
          <span className={`myb-date ${variant === "split" ? "hide-split" : ""}`}>{date(b.departureDate)}<small className="myb-secondary">Rezervuar: 09 tet</small></span>
          <span className={variant === "split" ? "hide-split" : ""}><Status value={b.status}/></span>
          <span className={`myb-money ${b.status === "cancelled" ? "myb-cancelled" : ""}`}>{money(b.totalAmount)}<small className={b.status === "cancelled" ? "" : b.dueAmount ? "myb-due" : "myb-paid"}>{b.status === "cancelled" ? "Anuluar" : b.dueAmount ? `Mbetet ${money(b.dueAmount)}` : "Paguar"}</small></span>
          <span>{open ? <ChevronUp size={15}/> : <ChevronRight size={15}/>}</span>
        </button>
        {open && variant === "table" && <Detail booking={b} onPreview={onPreview} onNotice={onNotice}/>}
      </div>;
    })}
  </div>;
}

function Cards({ list, expanded, setExpanded, onPreview, onNotice }: { list: Booking[]; expanded: number | null; setExpanded: (n: number | null) => void; onPreview: (b: Booking) => void; onNotice: (s: string) => void }) {
  return <div className="myb-card-grid">{list.map(b => <article key={b.id} className="myb-trip-card">
    <button className="myb-trip-main" onClick={() => setExpanded(expanded === b.id ? null : b.id)} aria-expanded={expanded === b.id}>
      <div className="myb-trip-top"><div><div className="myb-trip-route">{b.fromCity}<ArrowRight size={16}/>{b.toCity}</div><small className="myb-secondary myb-mono">{b.bookingRef}{b.pnr ? ` · ${b.pnr}` : ""}</small></div><div className="myb-trip-date"><CalendarDays size={12}/> {date(b.departureDate)}<br/>{b.airline} · {b.flightNumber}</div></div>
      <div className="myb-trip-person">{b.customerName} <span className="myb-secondary">AB TRAVEL</span></div>
      <div className="myb-trip-bottom"><Status value={b.status}/><div className="myb-trip-meta">{b.paidAmount ? `Paguar ${money(b.paidAmount)}` : "Pa pagesë"} <span>·</span> <span className={b.dueAmount ? "myb-due" : "myb-paid"}>{b.status === "cancelled" ? "Anuluar" : b.dueAmount ? `Mbetet ${money(b.dueAmount)}` : "Shlyer"}</span></div><strong className={`myb-money ${b.status === "cancelled" ? "myb-cancelled" : ""}`}>{money(b.totalAmount)}</strong></div>
    </button>
    {expanded === b.id && <div className="myb-card-detail"><Detail booking={b} onPreview={onPreview} onNotice={onNotice}/></div>}
  </article>)}</div>;
}

export function MyBookingsVariant({ variant }: { variant: Variant }) {
  const [tab, setTab] = useState<Tab>("bookings");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<number>(demoBookings[2].id);
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(""), 3200); return () => window.clearTimeout(id); }, [notice]);
  const filtered = useMemo(() => demoBookings.filter(b => (status === "all" || b.status === status) && (!search.trim() || [b.bookingRef,b.customerName,b.fromCity,b.toCity,b.flightNumber,b.pnr].some(v => v?.toLowerCase().includes(search.toLowerCase())))).sort((a,b) => sort === "amount" ? b.totalAmount-a.totalAmount : a.departureDate.localeCompare(b.departureDate)), [status,search,sort]);
  const stats = useMemo(() => {
    const active = demoBookings.filter(b => b.status !== "cancelled");
    return { total: active.reduce((s,b)=>s+b.totalAmount,0), paid: active.reduce((s,b)=>s+b.paidAmount,0), due: active.reduce((s,b)=>s+b.dueAmount,0) };
  }, []);
  const chosen = filtered.find(b => b.id === selected) || filtered[0] || demoBookings.find(b => b.id === selected) || demoBookings[0];
  const notify = (text: string) => setNotice(text);
  const preview = (_b: Booking) => notify("Demonstrim — PDF nuk shkarkohet dhe email nuk dërgohet.");
  const txSearch = search.toLowerCase();
  const txList = demoTransactions.filter(t => !txSearch || [t.bookingRef,t.customerName,t.route,t.description,t.reference].some(v => v?.toLowerCase().includes(txSearch)));
  const txTotal = txList.reduce((sum,t) => sum + t.amount * t.sign,0);

  return <div className={`myb ${variant}`}>
    <Header/>
    <main className="myb-shell myb-main">
      <div className="myb-heading"><div><p className="myb-eyebrow">Portali i agjencisë · Llogaria juaj</p><h1>Rezervimet e Mia</h1><p className="myb-subtitle">Shitjet, pagesat dhe detyrimet e AB TRAVEL.</p></div><span className="myb-demo"><ShieldCheck size={12}/> Demonstrim</span></div>
      <div className="myb-stats">
        <div className="myb-stat"><span className="myb-stat-label">Rezervime</span><strong className="myb-stat-value">{demoBookings.length}</strong><small className="myb-stat-note">në llogari</small></div>
        <div className="myb-stat"><span className="myb-stat-label">Shuma totale</span><strong className="myb-stat-value">{money(stats.total)}</strong><small className="myb-stat-note">pa anulimet</small></div>
        <div className="myb-stat is-paid"><span className="myb-stat-label">Paguar</span><strong className="myb-stat-value">{money(stats.paid)}</strong><small className="myb-stat-note">{Math.round(stats.paid/stats.total*100)}% e shumës</small></div>
        <div className="myb-stat is-due"><span className="myb-stat-label">Mbetet</span><strong className="myb-stat-value">{money(stats.due)}</strong><small className="myb-stat-note">detyrim i papaguar</small></div>
      </div>
      <Reports/>
      <div className="myb-tabs">
        <button className={`myb-tab ${tab === "bookings" ? "active" : ""}`} onClick={() => setTab("bookings")}><Plane size={14}/> Rezervimet <span>{demoBookings.length}</span></button>
        <button className={`myb-tab ${tab === "transactions" ? "active" : ""}`} onClick={() => setTab("transactions")}><ArrowDownUp size={14}/> Transaksionet <span>{demoTransactions.length}</span></button>
      </div>
      {tab === "bookings" && <>
        <div className="myb-toolbar"><div className="myb-search"><Search className="myb-search-icon" size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Kërko ref, emër, rrugë, PNR..." aria-label="Kërko rezervime"/>{search && <button className="myb-clear" onClick={()=>setSearch("")} aria-label="Pastro kërkimin"><X size={14}/></button>}</div>
          <select className="myb-sort" value={sort} onChange={e=>setSort(e.target.value)} aria-label="Rendit rezervimet"><option value="date">Rendit: Data</option><option value="amount">Rendit: Shuma</option></select>
        </div>
        <div className="myb-statusbar">{statuses.map(([key,text]) => <button key={key} className={`myb-status ${status === key ? "active" : ""}`} onClick={()=>setStatus(key)}>{text}<em>({key === "all" ? demoBookings.length : demoBookings.filter(b=>b.status===key).length})</em></button>)}</div>
        {filtered.length === 0 ? <div className="myb-empty"><Search size={21}/><strong>Asnjë rezultat</strong>Ndrysho kërkimin ose filtro sipas statusit.<br/><button className="myb-button secondary" style={{marginTop:12}} onClick={()=>{setSearch("");setStatus("all")}}>Pastro filtrat</button></div> : variant === "cards" ? <Cards list={filtered} expanded={expanded} setExpanded={setExpanded} onPreview={preview} onNotice={notify}/> : <div className={variant === "split" ? "myb-workspace" : undefined}>
          <TableRows list={filtered} expanded={expanded} setExpanded={setExpanded} selected={selected} setSelected={setSelected} variant={variant} onPreview={preview} onNotice={notify}/>
          {variant === "split" && <Detail booking={chosen} onPreview={preview} onNotice={notify} dock/>}
        </div>}
        {variant !== "cards" && <div className="myb-foot"><span>{filtered.length} rezervime · Totali nuk përfshin anulimet</span><div className="myb-foot-totals"><span>Gjithsej {money(filtered.filter(b=>b.status!=="cancelled").reduce((s,b)=>s+b.totalAmount,0))}</span><span className="myb-paid">Paguar {money(filtered.filter(b=>b.status!=="cancelled").reduce((s,b)=>s+b.paidAmount,0))}</span><span className="myb-due">Mbetet {money(filtered.filter(b=>b.status!=="cancelled").reduce((s,b)=>s+b.dueAmount,0))}</span></div></div>}
      </>}
      {tab === "transactions" && <><div className="myb-toolbar"><div className="myb-search"><Search className="myb-search-icon" size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Kërko sipas ref, rrugës..." aria-label="Kërko transaksione"/>{search && <button className="myb-clear" onClick={()=>setSearch("")} aria-label="Pastro kërkimin"><X size={14}/></button>}</div></div>
        {!txList.length ? <div className="myb-empty"><Banknote size={22}/><strong>Asnjë rezultat</strong>Nuk u gjetën transaksione për këtë kërkim.</div> : <div className="myb-tx-list"><div className="myb-tx-head"><span>Lloji</span><span>Data</span><span>Përshkrimi</span><span>Rezervimi / rruga</span><span style={{textAlign:"right"}}>Shuma</span></div>{txList.map(t=><div className="myb-tx-row" key={t.id}><Status value="ticketed"/><span>{date(t.createdAt)}<small className="myb-secondary">{t.method}</small></span><strong>{t.description}</strong><span className="myb-mono">{t.bookingRef}<small className="myb-secondary">{t.route} · {t.customerName}</small></span><span className="amount">+{money(t.amount)}</span></div>)}<div className="myb-foot"><span>{txList.length} transaksione</span><div className="myb-foot-totals"><span className="myb-paid">Neto +{money(txTotal)}</span></div></div></div>}
      </>}
      <footer className="myb-footer">© 2026 Albania Sky. Të gjitha të drejtat e rezervuara.</footer>
    </main>
    {notice && <div className="myb-notice" role="status">{notice}</div>}
  </div>;
}
