import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowDownUp, ArrowRight, Calendar, ChevronDown, ChevronLeft, ChevronRight, Columns3, Globe, Home, Layers, Lock, Plane, PlaneLanding, PlaneTakeoff, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Ticket, Users, X } from "lucide-react";
import { columnDefs, dateLabel, flights, matchesTab, statusLabels, tabs, useLocalFlights, type Flight } from "./_data";
import "./_group.css";

/**
 * Juniper organization applied to the extracted Current.tsx baseline.
 * Retains source filter bindings (airlineFlightNo, startDate, statusFilter,
 * minPrice...), colVisible/handleSort, paginatedFlights, row selection,
 * available = totalSeats - soldSeats and openDetail. The changes are spatial:
 * progressive filters, separate 24h time, optional columns and one detail action.
 * API/auth/prefetch/route dependencies replaced at the local _data.ts boundary.
 */
export function Compact() {
  const m = useLocalFlights();
  const [advanced, setAdvanced] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [detail, setDetail] = useState<Flight | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const { paginatedFlights, colVisible, handleSort, selectedIds, toggleSelect, toggleSelectAll } = m;
  const activeColumns = columnDefs.filter(c => colVisible(c.key));
  const activeCount = [m.toCity, m.airlineFlightNo, m.startDate, m.endDate, m.statusFilter !== "all", m.minPrice, m.maxPrice, m.minGooglePrice, m.maxGooglePrice, m.externalFilter !== "all", m.beFilter !== "all", m.alertFilter !== "all", m.seatBooking, m.group].filter(Boolean).length;
  const availableTotal = m.filtered.reduce((sum, f) => sum + f.totalSeats - f.soldSeats, 0);
  const soldTotal = m.filtered.reduce((sum, f) => sum + f.soldSeats, 0);
  function closeDetail() { setDetail(null); detailTrigger.current?.focus(); }
  function openDetail(f: Flight) { detailTrigger.current = document.activeElement as HTMLElement; setDetail(f); }
  useEffect(() => {
    if (!detail) return;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDetail(null); detailTrigger.current?.focus(); }
      // Only the close button is focusable in this informational drawer.
      if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [detail]);
  useEffect(() => {
    if (!columnsOpen) return;
    const outside = (event: MouseEvent) => { if (!columnRef.current?.contains(event.target as Node)) setColumnsOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setColumnsOpen(false); };
    document.addEventListener("mousedown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [columnsOpen]);
  const numericFilter = (label: string, value: string, setter: (value: string) => void) => <label>{label}<input type="number" min="0" value={value} placeholder="Pa kufi" onChange={e => { setter(e.target.value); m.setPage(1); }} /></label>;
  return <div className="kj-flights kj-shell">
    <aside className="kj-sidebar" aria-label="Konteksti i aplikacionit">
      <div className="kj-brand"><div className="kj-brand-mark"><Plane /></div><div><strong>Kings Travel</strong><small>FLIGHT MANAGEMENT</small></div></div>
      <div className="kj-nav-label">HAPËSIRA E PUNËS</div>
      <div className="kj-nav-item"><Home /> Përmbledhja</div>
      <div className="kj-nav-item active" aria-current="page"><Plane /> Fluturimet <small>37</small></div>
      <div className="kj-nav-item"><Ticket /> Rezervimet</div>
      <div className="kj-nav-item"><Users /> Pasagjerët</div>
      <div className="kj-nav-label">MENAXHIMI</div>
      <div className="kj-nav-item"><Layers /> Grupet e fluturimeve</div>
      <div className="kj-nav-item"><Globe /> Shitjet online</div>
      <div className="kj-nav-item"><Activity /> Raportet</div>
      <div className="kj-sidebar-bottom"><div><span className="kj-avatar">KT</span><div>Agjent demonstrues<small>Mjedis prove · pa lidhje API</small></div></div></div>
    </aside>
    <div>
      <header className="kj-topbar"><div>Menaxhimi <ChevronRight /><strong style={{ color: "#3b4e6a" }}>Fluturimet</strong></div><div><span className="kj-demo">Pamje prove · të dhëna ilustruese</span></div></header>
      <main className="kj-main">
        <div className="kj-heading">
          <div><h1>Fluturimet</h1><p>Inventari, çmimet dhe disponueshmëria në një vend.</p></div>
          <div className="kj-heading-actions"><span className="kj-demo" style={{ background: "#edf3ff", borderColor: "#d6e3fc", color: "#4b6ba4" }}>TIA · Itali & Gjermani</span></div>
        </div>
        <section className="kj-panel" aria-label="Inventari i fluturimeve">
          <nav className="kj-tabs" aria-label="Kategoritë e fluturimeve">
            {tabs.map(t => <button key={t.key} className={`${m.tab === t.key ? "active" : ""} ${t.key === "alerts" ? "alert" : ""}`} aria-pressed={m.tab === t.key} onClick={() => { m.setTab(t.key); m.setPage(1); m.setSelectedIds(new Set()); }}>{t.key === "alerts" && <AlertTriangle style={{ width: 13, height: 13 }} />}{t.label}<small>{flights.filter(f => matchesTab(f, t.key)).length}</small></button>)}
          </nav>
          <div className="kj-filters">
            <div className="kj-inline">
              {/* Source airlineFlightNo input, promoted to broad local inventory search. */}
              <label className="kj-field search"><Search /><input aria-label="Kërko fluturime" placeholder="Kërko fluturim, kompani ose destinacion…" value={m.airlineFlightNo} onChange={e => { m.setAirlineFlightNo(e.target.value); m.setPage(1); }} /></label>
              <label className="kj-field origin" title="Të gjitha të dhënat e provës nisen nga Tirana"><PlaneTakeoff /><select aria-label="Aeroporti i nisjes" value="TIA" onChange={() => undefined}><option value="TIA">TIA · Tiranë</option></select></label>
              <label className="kj-field destination"><PlaneLanding /><select aria-label="Destinacioni" value={m.toCity} onChange={e => { m.setToCity(e.target.value); m.setPage(1); }}><option value="">Çdo destinacion</option>{Array.from(new Map(flights.map(f => [f.toCity, f.destination]))).map(([code, city]) => <option key={code} value={code}>{code} · {city}</option>)}</select></label>
              <label className="kj-field date" title="Data e nisjes, nga"><Calendar /><input aria-label="Nga data" type="date" value={m.startDate} onChange={e => { m.setStartDate(e.target.value); if (m.endDate && e.target.value > m.endDate) m.setEndDate(e.target.value); m.setPage(1); }} /></label>
              <label className="kj-field status"><Activity /><select aria-label="Statusi" value={m.statusFilter} onChange={e => { m.setStatusFilter(e.target.value); m.setPage(1); }}><option value="all">Çdo status</option><option value="open">Hapur</option><option value="closed">Mbyllur</option><option value="soldout">Pa vende</option></select></label>
              <button className="kj-btn primary" onClick={() => m.setPage(1)}><Search /> Kërko</button>
            </div>
            <div className="kj-secondary">
              <div style={{ display: "flex", gap: 18 }}>
                <button className={advanced ? "active" : ""} aria-expanded={advanced} aria-controls="kj-advanced" onClick={() => setAdvanced(v => !v)}><SlidersHorizontal /> Kërkim i avancuar <ChevronDown style={{ transform: advanced ? "rotate(180deg)" : undefined }} /></button>
                {activeCount > 0 && <button onClick={m.clearFilters}><RotateCcw /> Hiq filtrat ({activeCount})</button>}
              </div>
              <span>Filtrat zbatohen në të gjitha rezultatet</span>
            </div>
            {advanced && <div className="kj-advanced" id="kj-advanced">
              <label>Deri më<input type="date" aria-label="Deri më" min={m.startDate || undefined} value={m.endDate} onChange={e => { m.setEndDate(e.target.value); m.setPage(1); }} /></label>
              {numericFilter("Çmimi ynë · min €", m.minPrice, m.setMinPrice)}
              {numericFilter("Çmimi ynë · max €", m.maxPrice, m.setMaxPrice)}
              {numericFilter("Google · min €", m.minGooglePrice, m.setMinGooglePrice)}
              {numericFilter("Google · max €", m.maxGooglePrice, m.setMaxGooglePrice)}
              <label>Vendet & rezervimet<select value={m.seatBooking} onChange={e => { m.setSeatBooking(e.target.value); m.setPage(1); }}><option value="">Të gjitha</option><option value="with">Me rezervim</option><option value="without">Pa rezervim</option><option value="withseat">Me vende</option><option value="noseat">Pa vende</option></select></label>
              <label>Njoftimet<select value={m.alertFilter} onChange={e => { m.setAlertFilter(e.target.value); m.setPage(1); }}><option value="all">Të gjitha</option><option value="any">Me njoftim</option><option value="time_changed">Orari ndryshoi</option><option value="low_seats">Pak vende</option><option value="none">Pa njoftim</option></select></label>
              <label>Shitjet e jashtme<select value={m.externalFilter} onChange={e => { m.setExternalFilter(e.target.value); m.setPage(1); }}><option value="all">Të gjitha</option><option value="open">Hapur jashtë</option><option value="blocked">Bllokuar jashtë</option></select></label>
              <label>Motori i rezervimeve<select value={m.beFilter} onChange={e => { m.setBeFilter(e.target.value); m.setPage(1); }}><option value="all">Të gjitha</option><option value="visible">Të dukshme</option><option value="hidden">Të fshehura</option></select></label>
              <label>Grupet<select value={m.group} onChange={e => { m.setGroup(e.target.value); m.setPage(1); }}><option value="">Të gjitha grupet</option><option>Itali · Verë</option><option>Gjermani · Verë</option></select></label>
            </div>}
          </div>
          <div className="kj-table-toolbar">
            <div><strong>{m.filtered.length} fluturime</strong><span>·</span><span>{selectedIds.size ? `${selectedIds.size} të zgjedhura` : "Nisjet 18–24 qershor 2026"}</span>{selectedIds.size > 0 && <button className="kj-btn text" onClick={() => m.setSelectedIds(new Set())}>Hiq zgjedhjen</button>}</div>
            <div className="kj-columns-wrap" ref={columnRef}><button className="kj-btn" aria-expanded={columnsOpen} onClick={() => setColumnsOpen(v => !v)}><Columns3 /> Kolonat <ChevronDown /></button>
              {columnsOpen && <div className="kj-columns"><strong>Shfaq kolonat</strong>{columnDefs.map(col => <label key={col.key}><input type="checkbox" checked={m.visibleCols[col.key]} disabled={col.key === "route"} onChange={() => m.setVisibleCols(prev => ({ ...prev, [col.key]: !prev[col.key] }))} />{col.label}</label>)}</div>}
            </div>
          </div>
          {/* Modified source table: same selectable-column map and row calculations. */}
          <div className="kj-table-scroll">
            <table className="kj-table">
              <thead><tr><th className="check"><input type="checkbox" aria-label="Zgjidh faqen" checked={paginatedFlights.length > 0 && paginatedFlights.every(f => selectedIds.has(f.id))} onChange={toggleSelectAll} /></th>
                {activeColumns.map(col => <th key={col.key} className={["price", "google", "net"].includes(col.key) ? "right" : ""}><button onClick={() => handleSort(col.key)}>{col.label}<ArrowDownUp style={{ color: m.sortKey === col.key ? "hsl(var(--primary))" : undefined }} /></button></th>)}
                <th className="right">Detaje</th>
              </tr></thead>
              <tbody>{paginatedFlights.length === 0 ? <tr><td colSpan={activeColumns.length + 2} className="kj-empty"><Search /><strong>Nuk u gjet asnjë fluturim</strong><p>Provo një destinacion tjetër ose hiq filtrat e kërkimit.</p><button className="kj-btn" onClick={m.clearFilters}><RotateCcw /> Hiq filtrat</button></td></tr> : paginatedFlights.map(f => {
                const available = f.totalSeats - f.soldSeats;
                const sold = f.soldSeats || 0;
                const total = f.totalSeats;
                const isSelected = selectedIds.has(f.id);
                return <tr key={f.id} className={isSelected ? "selected" : ""}>
                  <td className="check"><input type="checkbox" aria-label={`Zgjidh ${f.flightNumber}, ${dateLabel(f.departureDate)}`} checked={isSelected} onChange={() => toggleSelect(f.id)} /></td>
                  {colVisible("route") && <td><span className="kj-route" title={f.destination}>{f.fromCity}<ArrowRight />{f.toCity}</span></td>}
                  {colVisible("date") && <td>{dateLabel(f.departureDate)}</td>}
                  {colVisible("time") && <td><span className="kj-time">{f.departureTime} <span style={{ color: "#a7b3c5", padding: "0 2px" }}>–</span> {f.arrivalTime}</span></td>}
                  {colVisible("flightNo") && <td><button onClick={() => openDetail(f)} className="kj-flightno">{f.flightNumber}</button><span className="kj-airline">{f.airline === "Ryanair" ? "Ryanair" : "Wizz"}</span></td>}
                  {colVisible("seats") && <td><span className="kj-seats" title={`${available} të lira · ${sold} të shitura · ${total} gjithsej`}><strong className={available < 4 ? "low" : ""}>{available}</strong><small>/ {total}</small></span></td>}
                  {colVisible("price") && <td className="right"><span className="kj-price">€{Math.round(f.adultPrice)}</span></td>}
                  {colVisible("google") && <td className="right" title="Çmim Google ilustrues, pa kërkim në rrjet">€{Math.round(f.googlePrice)}</td>}
                  {colVisible("baggage") && <td>{f.checkedBaggageKg} kg <span style={{ color: "#8a98ac", fontSize: 10 }}>+€{f.checkedBaggagePrice}</span></td>}
                  {colVisible("status") && <td><span className={`kj-badge ${f.status}`}>{statusLabels[f.status]}</span></td>}
                  {colVisible("alert") && <td>{f.scheduleAlert ? <span className="kj-notice">{f.scheduleAlert === "time_changed" ? <Calendar /> : <AlertTriangle />}{f.scheduleAlert === "time_changed" ? "Orari ndryshoi" : "Pak vende"}</span> : f.externalSalesBlocked ? <span className="kj-notice" style={{ color: "#8390a5" }}><Lock /> Jashtë bllokuar</span> : <span className="kj-muted-dash">—</span>}</td>}
                  {colVisible("groups") && <td>{f.group}</td>}
                  {colVisible("net") && <td className="right">€{f.netPrice}</td>}
                  <td className="right"><button className="kj-detail-btn" onClick={() => openDetail(f)} aria-label={`Detaje ${f.flightNumber}`}>Detaje <ChevronRight /></button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <footer className="kj-footer">
            <div><span>Gjithsej</span><strong>{m.filtered.length} fluturime</strong><span>·</span><strong>{availableTotal} vende të lira</strong><span>·</span><span>{soldTotal} të shitura</span></div>
            <div><span>Rreshta</span><select aria-label="Rreshta për faqe" value={m.perPage} onChange={e => { m.setPerPage(Number(e.target.value)); m.setPage(1); }}><option value="12">12</option><option value="24">24</option><option value="50">50</option></select><span>{m.filtered.length ? (m.page - 1) * m.perPage + 1 : 0}–{Math.min(m.page * m.perPage, m.filtered.length)} nga {m.filtered.length}</span><button className="kj-page" aria-label="Faqja e mëparshme" disabled={m.page === 1} onClick={() => m.setPage(m.page - 1)}><ChevronLeft /></button>{Array.from({ length: m.totalPages }, (_, i) => <button key={i} className={`kj-page ${m.page === i + 1 ? "active" : ""}`} aria-label={`Faqja ${i + 1}`} aria-current={m.page === i + 1 ? "page" : undefined} onClick={() => m.setPage(i + 1)}>{i + 1}</button>)}<button className="kj-page" aria-label="Faqja tjetër" disabled={m.page === m.totalPages} onClick={() => m.setPage(m.page + 1)}><ChevronRight /></button></div>
          </footer>
        </section>
        <div className="kj-footnote"><span><ShieldCheck /> Pamje prove · të dhëna ilustruese. Asnjë ndryshim në sistemin real.</span><span>Ora lokale · Tiranë (24h) &nbsp; / &nbsp; Çmimet në EUR</span></div>
      </main>
    </div>
    {detail && <div className="kj-overlay" onClick={closeDetail}><section className="kj-drawer" role="dialog" aria-modal="true" aria-labelledby="kj-detail-title" onClick={e => e.stopPropagation()}>
      <div className="kj-drawer-head"><h2 id="kj-detail-title">Detajet e fluturimit</h2><button ref={closeRef} className="kj-btn text" onClick={closeDetail} aria-label="Mbyll detajet"><X /></button></div>
      <p>{detail.flightNumber} · {detail.airline} · {dateLabel(detail.departureDate)}</p>
      <div className="kj-drawer-route"><div><strong>TIA</strong><small>Tiranë</small><b>{detail.departureTime}</b></div><Plane /><div style={{ textAlign: "right" }}><strong>{detail.toCity}</strong><small>{detail.destination}</small><b>{detail.arrivalTime}</b></div></div>
      <span className={`kj-badge ${detail.status}`}>{statusLabels[detail.status]}</span>
      <dl><dt>Çmimi ynë · i rritur</dt><dd>€{detail.adultPrice}</dd><dt>Çmimi Google · ilustrues</dt><dd>€{detail.googlePrice}</dd><dt>Çmimi neto</dt><dd>€{detail.netPrice}</dd><dt>Vende të lira</dt><dd>{detail.totalSeats - detail.soldSeats} / {detail.totalSeats}</dd><dt>Vende të shitura</dt><dd>{detail.soldSeats}</dd><dt>Bagazh i regjistruar</dt><dd>{detail.checkedBaggageKg} kg · +€{detail.checkedBaggagePrice}</dd><dt>Grupi</dt><dd>{detail.group}</dd><dt>Shitjet e jashtme</dt><dd>{detail.externalSalesBlocked ? "Bllokuar" : "Hapur"}</dd><dt>Motori i rezervimeve</dt><dd>{detail.showInBookingEngine ? "I dukshëm" : "I fshehur"}</dd></dl>
      {detail.scheduleAlert && <div className="kj-drawer-note">{detail.scheduleAlert === "time_changed" ? "Njoftim ilustrues: orari ka ndryshuar. Verifiko me kompaninë përpara rezervimit." : "Njoftim ilustrues: kanë mbetur pak vende në këtë fluturim."}</div>}
      <p style={{ marginTop: 28 }}>Pamje prove · të dhëna ilustruese. Rezervimi dhe ndryshimet operative nuk kryhen në këtë pamje.</p>
    </section></div>}
  </div>;
}