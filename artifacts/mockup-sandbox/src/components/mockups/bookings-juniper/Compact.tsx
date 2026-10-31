import "./_group.css";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Columns3, Filter, Plane, Search, X } from "lucide-react";
import { BOOKINGS, Booking, formatDate, formatEuro } from "./Current";

type SortKey = "created" | "ref" | "customer" | "agency" | "route" | "departure" | "pax" | "total" | "status";
const STATUS: Record<Booking["status"], string> = {
  draft: "Draft", pending: "Pritje", confirmed: "Konfirmuar", ticketed: "Biletuar", cancelled: "Anuluar",
};
const STATUS_RANK: Record<Booking["status"], number> = { draft:0, pending:1, confirmed:2, ticketed:3, cancelled:4 };
const PAGE_SIZE_OPTIONS = [5, 8, 12];

export function Compact() {
  const [search, setSearch] = useState("");
  const [agency, setAgency] = useState("");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [columnMenu, setColumnMenu] = useState(false);
  const [columns, setColumns] = useState({ created:true, commission:false, netManual:false });
  const [sortBy, setSortBy] = useState<SortKey | null>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [selected, setSelected] = useState<number[]>([]);
  const [detailsId, setDetailsId] = useState<number | null>(null);

  const filtered = useMemo(() => BOOKINGS.filter(row => {
    const needle = search.trim().toLocaleLowerCase();
    const textMatch = !needle || [row.ref, row.pnr, row.customer, row.agency].some(value => value.toLocaleLowerCase().includes(needle));
    if (!textMatch) return false;
    if (agency && row.agency !== agency) return false;
    if (status && row.status !== status) return false;
    if (fromDate && row.departure < fromDate) return false;
    if (toDate && row.departure > toDate) return false;
    if (payment === "paid" && !(row.paid > 0 && row.due === 0)) return false;
    if (payment === "partial" && !(row.paid > 0 && row.due > 0)) return false;
    if (payment === "unpaid" && row.paid !== 0) return false;
    return true;
  }), [search, agency, status, fromDate, toDate, payment]);

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const val = (row: Booking): string | number => {
      switch (sortBy) {
        case "created": return row.created;
        case "ref": return row.ref;
        case "customer": return row.customer.toLocaleLowerCase();
        case "agency": return row.agency.toLocaleLowerCase();
        case "route": return `${row.from}-${row.to}`;
        case "departure": return row.departure;
        case "pax": return row.pax;
        case "total": return row.total;
        case "status": return STATUS_RANK[row.status];
      }
    };
    return [...filtered].sort((a,b) => {
      const av = val(a), bv = val(b);
      const compare = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return compare * (sortDir === "asc" ? 1 : -1);
    });
  }, [filtered, sortBy, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const current = detailsId === null ? null : BOOKINGS.find(row => row.id === detailsId) ?? null;
  const totalSale = filtered.reduce((sum,row) => sum + row.total,0);
  const totalPaid = filtered.reduce((sum,row) => sum + row.paid,0);
  const totalDue = filtered.reduce((sum,row) => sum + row.due,0);
  const activeFilters = [agency && `Agjencia: ${agency}`, status && `Statusi: ${STATUS[status as Booking["status"]]}`, payment && `Pagesa: ${payment === "paid" ? "Paguar" : payment === "partial" ? "Pjesërisht" : "Pa paguar"}`, fromDate && `Nisja nga ${formatDate(fromDate)}`, toDate && `Nisja deri ${formatDate(toDate)}`].filter(Boolean) as string[];
  const allVisibleSelected = pageRows.length > 0 && pageRows.every(row => selected.includes(row.id));

  const resetPage = () => setPage(1);
  const clearFilters = () => {
    setSearch(""); setAgency(""); setStatus(""); setPayment(""); setFromDate(""); setToDate(""); resetPage();
  };
  const sort = (key: SortKey) => {
    resetPage();
    if (sortBy !== key) { setSortBy(key); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortBy(null);
  };
  const toggleColumn = (key: keyof typeof columns) => setColumns(value => ({ ...value, [key]:!value[key] }));
  const toggleSelection = (id: number) => setSelected(values => values.includes(id) ? values.filter(item => item !== id) : [...values,id]);
  const togglePageSelection = () => setSelected(values => allVisibleSelected ? values.filter(id => !pageRows.some(row => row.id === id)) : Array.from(new Set([...values,...pageRows.map(row => row.id)])));
  const headerSort = (key: SortKey, label: string) => (
    <button type="button" onClick={() => sort(key)} aria-label={`Rendit sipas ${label}`}>
      {label}{sortBy === key ? (sortDir === "asc" ? <ArrowUp /> : <ArrowDown />) : <ArrowUpDown />}
    </button>
  );

  return (
    <div className="kj-bookings">
      <div className="kjb-shell">
        <aside className="kjb-sidebar">
          <div className="kjb-brand">
            <div className="kjb-mark"><Plane /></div>
            <div><strong>KINGS TRAVEL</strong><small>FLIGHT MANAGEMENT</small></div>
          </div>
          <div className="kjb-nav-label">Punë</div>
          <div className="kjb-nav-item"><CalendarDays /> Përmbledhje</div>
          <div className="kjb-nav-item"><Plane /> Fluturimet</div>
          <div className="kjb-nav-item active"><Filter /> Rezervimet <small>12</small></div>
          <div className="kjb-nav-item"><Columns3 /> Agjencitë</div>
          <div className="kjb-nav-label">Administrim</div>
          <div className="kjb-nav-item"><CalendarDays /> Raportet</div>
          <div className="kjb-side-bottom"><div className="kjb-avatar">AH</div><div><strong>Arben Hoxha</strong><small>Administrator</small></div></div>
        </aside>
        <div className="kjb-work">
          <header className="kjb-topbar">
            <div><span>Menaxhimi i fluturimeve</span><span>›</span><span className="kjb-crumb">Rezervimet</span></div>
            <div><span className="kjb-demo">Pamje prove · të dhëna ilustruese</span><span>Shqip</span></div>
          </header>
          <main className="kjb-main">
            <div className="kjb-heading">
              <div><h1>Rezervimet</h1><p>Gjej shpejt rezervimin dhe kontrollo pagesën, udhëtarët dhe nisjen.</p></div>
              <div className="kjb-heading-meta"><span><strong>{filtered.length}</strong> nga {BOOKINGS.length} rezervime</span></div>
            </div>
            <section className="kjb-filterbox">
              <div className="kjb-filter-row">
                <div className="kjb-input-wrap"><Search /><input value={search} onChange={event => {setSearch(event.target.value);resetPage();}} placeholder="Kërko Ref, PNR, klient, agjenci…" aria-label="Kërko rezervime" />{search && <button className="kjb-close" type="button" onClick={() => setSearch("")} aria-label="Pastro kërkimin"><X /></button>}</div>
                <select className="kjb-select" value={status} onChange={event => {setStatus(event.target.value);resetPage();}} aria-label="Filtro sipas statusit">
                  <option value="">Të gjitha statuset</option><option value="draft">Draft</option><option value="pending">Pritje</option><option value="confirmed">Konfirmuar</option><option value="ticketed">Biletuar</option><option value="cancelled">Anuluar</option>
                </select>
                <select className="kjb-select" value={agency} onChange={event => {setAgency(event.target.value);resetPage();}} aria-label="Filtro sipas agjencisë">
                  <option value="">Të gjitha agjencitë</option>{Array.from(new Set(BOOKINGS.map(row => row.agency))).sort().map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                <label className="kjb-date" aria-label="Nisja nga"><input type="date" value={fromDate} onChange={event => {setFromDate(event.target.value);resetPage();}} /></label>
                <label className="kjb-date" aria-label="Nisja deri"><input type="date" value={toDate} onChange={event => {setToDate(event.target.value);resetPage();}} /></label>
              </div>
              <div className="kjb-filter-lower">
                <div><button type="button" className={advanced ? "active" : ""} onClick={() => setAdvanced(value => !value)}><Filter /> Filtra të avancuar <ChevronDown style={{transform:advanced ? "rotate(180deg)" : undefined}} /></button>{activeFilters.length > 0 && <span> · {activeFilters.length} filtra aktivë</span>}</div>
                <div><span>{sorted.length ? `${(currentPage-1)*pageSize+1}–${Math.min(currentPage*pageSize,sorted.length)} nga ${sorted.length} rezultate` : "Asnjë rezultat"}</span>{(search || activeFilters.length > 0) && <button type="button" onClick={clearFilters}>Pastro filtrat</button>}</div>
              </div>
              {advanced && <div className="kjb-advanced">
                <label>Gjendja e pagesës<select value={payment} onChange={event => {setPayment(event.target.value);resetPage();}}><option value="">Të gjitha pagesat</option><option value="paid">Paguar plotësisht</option><option value="partial">Pjesërisht paguar</option><option value="unpaid">Pa pagesë</option></select></label>
                <label>Data e nisjes nga<input type="date" value={fromDate} onChange={event => {setFromDate(event.target.value);resetPage();}} /></label>
                <label>Data e nisjes deri<input type="date" value={toDate} onChange={event => {setToDate(event.target.value);resetPage();}} /></label>
              </div>}
              {activeFilters.length > 0 && <div className="kjb-active-filters">{activeFilters.map(chip => <span className="kjb-chip" key={chip}>{chip}</span>)}</div>}
            </section>
            <section className="kjb-table-panel">
              <div className="kjb-table-toolbar">
                <div className="kjb-toolbar-left"><strong>Lista e rezervimeve</strong><small>· rendit sipas kolonës</small>{selected.length > 0 && <span className="kjb-selection-note">{selected.length} të zgjedhura · vetëm përzgjedhje lokale</span>}</div>
                <div className="kjb-toolbar-right">
                  <small>{filtered.length} në këtë pamje</small>
                  <div className="kjb-columns-wrap">
                    <button type="button" className="kjb-button" onClick={() => setColumnMenu(open => !open)} aria-expanded={columnMenu}><Columns3 /> Kolonat <ChevronDown /></button>
                    {columnMenu && <div className="kjb-columns-menu" role="group" aria-label="Kolona opsionale"><strong>Kolona opsionale</strong><label><input type="checkbox" checked={columns.created} onChange={() => toggleColumn("created")} /> Data e krijimit</label><label><input type="checkbox" checked={columns.commission} onChange={() => toggleColumn("commission")} /> Komisioni</label><label><input type="checkbox" checked={columns.netManual} onChange={() => toggleColumn("netManual")} /> Neto (manual)</label></div>}
                  </div>
                </div>
              </div>
              <div className="kjb-table-scroll">
                <table className="kjb-table">
                  <thead><tr>
                    <th className="kjb-checkcell"><input type="checkbox" checked={allVisibleSelected} onChange={togglePageSelection} aria-label="Zgjidh faqen" /></th>
                    {columns.created && <th>{headerSort("created","Krijuar / Ref")}</th>}
                    {!columns.created && <th>{headerSort("ref","Ref / PNR")}</th>}
                    <th>{headerSort("customer","Klienti")}</th>
                    <th>{headerSort("agency","Agjencia")}</th>
                    <th>{headerSort("route","Fluturimi")}</th>
                    <th>{headerSort("pax","PAX")}</th>
                    <th>{headerSort("departure","Nisja")}</th>
                    <th style={{textAlign:"right"}}>{headerSort("total","Total / Paguar / Detyrim")}</th>
                    {columns.commission && <th style={{textAlign:"right"}}>Komisioni</th>}
                    {columns.netManual && <th style={{textAlign:"right"}}>Neto*</th>}
                    <th>{headerSort("status","Statusi")}</th>
                    <th style={{textAlign:"right"}}>Detaje</th>
                  </tr></thead>
                  <tbody>
                    {pageRows.map(row => (
                      <tr key={row.id} className={`${row.status === "cancelled" ? "row-cancelled" : ""} ${selected.includes(row.id) ? "selected" : ""}`}>
                        <td className="kjb-checkcell"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelection(row.id)} aria-label={`Zgjidh ${row.ref}`} /></td>
                        <td>{columns.created && <span className="kjb-created">{row.created}</span>}<button className="kjb-ref" type="button" onClick={() => setDetailsId(row.id)}>{row.ref}</button><span className="kjb-sub">PNR {row.pnr}</span></td>
                        <td><span className="kjb-name">{row.customer}</span></td>
                        <td><span className="kjb-agency">{row.agency}</span></td>
                        <td><span className="kjb-route">{row.from} → {row.to}<small>{row.cityFrom} – {row.cityTo}</small></span></td>
                        <td className="kjb-pax">{row.pax}</td>
                        <td><span className="kjb-depart">{formatDate(row.departure)}<small>{row.time} · 24h</small></span></td>
                        <td><div className="kjb-money"><strong>{formatEuro(row.total)}</strong><small><span className="paid">{formatEuro(row.paid)}</span> · <span className={row.due ? "due" : "settled"}>{formatEuro(row.due)}</span></small></div></td>
                        {columns.commission && <td className={`kjb-commission ${row.commission < 0 ? "negative" : "positive"}`}>{row.commission < 0 ? "−" : ""}{formatEuro(Math.abs(row.commission))}</td>}
                        {columns.netManual && <td className="kjb-commission">{row.netManual === null ? "—" : formatEuro(row.netManual)}</td>}
                        <td><span className={`status-badge status-${row.status}`}>{STATUS[row.status]}</span></td>
                        <td style={{textAlign:"right"}}><button className="kjb-ref" type="button" style={{marginLeft:"auto"}} onClick={() => setDetailsId(row.id)} aria-label={`Detajet e ${row.ref}`}>Detaje ›</button></td>
                      </tr>
                    ))}
                    {pageRows.length === 0 && <tr><td colSpan={10 + Number(columns.commission) + Number(columns.netManual)} className="kjb-no-results"><strong>Nuk u gjet asnjë rezervim</strong><br />Ndrysho fjalët e kërkimit ose pastro filtrat.</td></tr>}
                  </tbody>
                </table>
              </div>
              {columns.netManual && <div style={{padding:"5px 12px",borderTop:"1px solid #edf0f5",color:"#8290a4",fontSize:9}}>* Neto është vlerë informative e regjistruar manualisht; nuk llogaritet nga shitja dhe komisioni.</div>}
              <footer className="kjb-footer">
                <div className="kjb-totals"><span>Total shitje<strong>{formatEuro(totalSale)}</strong></span><span>Paguar<strong className="green">{formatEuro(totalPaid)}</strong></span><span>Detyrim<strong>{formatEuro(totalDue)}</strong></span></div>
                <div className="kjb-pages"><span>Rreshta</span><select className="kjb-page-size" value={pageSize} onChange={event => {setPageSize(Number(event.target.value));resetPage();}} aria-label="Rreshta për faqe">{PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</select><span>Faqja {currentPage} / {pageCount}</span><button className="kjb-page" type="button" onClick={() => setPage(value => Math.max(1,value-1))} disabled={currentPage <= 1} aria-label="Faqja e mëparshme"><ChevronLeft /></button><button className="kjb-page" type="button" onClick={() => setPage(value => Math.min(pageCount,value+1))} disabled={currentPage >= pageCount} aria-label="Faqja tjetër"><ChevronRight /></button></div>
              </footer>
            </section>
          </main>
        </div>
      </div>
      {current && <div className="kjb-overlay" role="presentation" onMouseDown={event => {if (event.target === event.currentTarget) setDetailsId(null);}}>
        <aside className="kjb-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title">
          <div className="kjb-drawer-top"><h2 id="booking-detail-title">Detajet e rezervimit</h2><button className="kjb-close" type="button" onClick={() => setDetailsId(null)} aria-label="Mbyll detajet"><X /></button></div>
          <p className="kjb-drawer-intro">Pamje vetëm për lexim · pa ndryshime në rezervim ose pagesë.</p>
          <div className="kjb-drawer-route"><small>Itinerari</small><strong>{current.from} <span style={{fontSize:14,color:"#8a98aa"}}>→</span> {current.to}</strong><span>{current.cityFrom} — {current.cityTo} · {formatDate(current.departure)} · {current.time}</span></div>
          <section className="kjb-drawer-section"><h3>Rezervimi</h3><dl><dt>Referenca</dt><dd>{current.ref}</dd><dt>PNR</dt><dd>{current.pnr}</dd><dt>Statusi</dt><dd><span className={`status-badge status-${current.status}`}>{STATUS[current.status]}</span></dd><dt>Krijuar</dt><dd>{current.created}</dd></dl></section>
          <section className="kjb-drawer-section"><h3>Klienti dhe agjencia</h3><dl><dt>Pasagjeri kryesor</dt><dd>{current.customer}</dd><dt>Agjencia</dt><dd>{current.agency}</dd><dt>Pasagjerë</dt><dd>{current.pax}</dd></dl></section>
          <section className="kjb-drawer-section"><h3>Financat</h3><dl><dt>Shitja totale</dt><dd>{formatEuro(current.total)}</dd><dt>Paguar</dt><dd style={{color:"#16814c"}}>{formatEuro(current.paid)}</dd><dt>Detyrim</dt><dd style={{color:current.due ? "#b34a4a" : "#16814c"}}>{formatEuro(current.due)}</dd><dt>Komisioni</dt><dd style={{color:current.commission < 0 ? "#ad4949" : undefined}}>{current.commission < 0 ? "−" : ""}{formatEuro(Math.abs(current.commission))}</dd><dt>Neto i regjistruar</dt><dd>{current.netManual === null ? "Pa të dhënë" : formatEuro(current.netManual)}</dd></dl></section>
          <div className="kjb-readonly-note">Shumat janë të dhëna ilustruese. Vlerat neto dhe komisioni nuk përllogariten automatikisht në këtë prototip.</div>
        </aside>
      </div>}
    </div>
  );
}

export default Compact;