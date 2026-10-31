import { useRef, useState } from "react";
import {
  CheckCircle2, CheckSquare, ChevronDown, Circle, Clipboard, Copy, FileWarning,
  Globe, History, LayoutGrid, Pencil, PlaneTakeoff, Plus, Receipt,
  RefreshCw, Ticket, Trash2, Undo2, User, X, XCircle,
} from "lucide-react";
import { mockBooking, fmtM } from "./_mockData";
import "./_group.css";
import "./TwoColumn.css";

// Static copy of the extracted booking contract; no app contexts or API effects.
// Premium header/stepper and BookingDetailContent flight, pricing, passenger,
// Excel, extras and payment sections are regrouped into two working columns.
const booking = {
  ...mockBooking,
  bookingRef: "KTF2982", status: "ticketed", pnr: "WRDRRD",
  customerName: "SPAHIJAJ Rabe", agentName: "ONLINE TRAVEL", source: "Offline",
  customerEmail: null, customerPhone: null,
  totalAmount: 150, netPrice: 85, commissionAmount: 65,
  paidAmount: 0, dueAmount: 150, payments: [],
  createdAt: "30 Oct 2026 11:24 AM",
  flight: {
    airline: "WIZZ AIR", flightNumber: "W6 2975",
    fromAirport: "PRN", toAirport: "MMX", fromCity: "Prishtinë", toCity: "Malmö",
    departureDate: "05 Jan 2027", departureTime: "12:50", arrivalTime: "15:30",
    duration: "2h 40min", availableSeats: 30, totalSeats: 36, adultPrice: 200,
  },
  passengers: [{
    id: 1, firstName: "Rabe", lastName: "SPAHIJAJ", type: "I Rritur",
    ticketPrice: 150, seatNumber: "–", dateOfBirth: "11/06/1988",
    passportNumber: "–", nationality: "–", pnr: "WRDRRD",
  }],
};
const transitions = [
  { label: "Draft", date: "30.10.2026 11:24 AM", user: "System", note: "Pa të dhëna për emailin" },
  { label: "Pending", date: "30.10.2026 3:37 PM", user: "ERNEST KASAJ", note: "Emaili u anashkalua · Njoftimi për agjentin është çaktivizuar" },
  { label: "Confirmed", date: "30.10.2026 3:38 PM", user: "ERNEST KASAJ", note: "Emaili u anashkalua · Njoftimi për agjentin është çaktivizuar" },
  { label: "Ticketed", date: "30.10.2026 4:02 PM", user: "ERNEST KASAJ", note: "Emaili u dërgua te agjenti" },
];

export function TwoColumn() {
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDetailsElement>(null);
  const { flight, passengers } = booking;
  const demo = () => setNotice("Vetëm demonstrim — asnjë ndryshim nuk u ruajt.");
  const showHistory = () => {
    setHistoryOpen(true);
    requestAnimationFrame(() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const copy = async (whatsapp = false) => {
    const text = whatsapp
      ? `KTF2982 · Rabe SPAHIJAJ\nWIZZ AIR W6 2975 · PRN → MMX\n05 Jan 2027 · 12:50–15:30\nPNR: WRDRRD · €150`
      : "PASSANGER\tEXTRA\tCONFIRMED\t-1 SHITUR\tOPERATORI\tSHENIME\tNISJA 2\tORA\tDEST\tSTATUS 2\nRabe SPAHIJAJ\t\tCONFIRMED\t150 €\tONLINE TRAVEL\tWRDRRD\t5.1.2027\t12:50\tPRN-MMX\tCONFIRMED";
    try { await navigator.clipboard.writeText(text); setNotice("Të dhënat u kopjuan."); }
    catch { setNotice("Kopjimi nuk lejohet në këtë pamje demonstrimi."); }
  };

  return (
    <div className="booking-detail-scope kt-two">
      <div className="kt-dialog" role="dialog" aria-label="Detajet e rezervimit KTF2982">
        <header>
          <div className="kt-top">
            <div className="kt-inline">
              <span className="kt-muted">#</span><span className="kt-label">REF</span>
              <span className="kt-ref kt-mono">{booking.bookingRef}</span>
              <span className="kt-divider" /><Ticket style={{ color: "#ad7534" }} />
              <span className="kt-label">PNR</span><span className="kt-pnr kt-mono">{booking.pnr}</span>
            </div>
            <div className="kt-inline">
              <span className="kt-label">Kings Travel · Rezervime</span>
              <button className="kt-btn" aria-label="Mbyll dialogun" onClick={demo}><X /></button>
            </div>
          </div>
          <div className="kt-steps">
            {["Draft", "Pending", "Confirmed", "Ticketed"].map((step, index) => (
              <div key={step} style={{ display: "contents" }}>
                {index > 0 && <div className="kt-step-line" />}
                <div className="kt-step">{index < 3 ? <CheckCircle2 /> : <Circle />}<span>{step.toUpperCase()}</span></div>
              </div>
            ))}
          </div>
        </header>
        <div className="kt-body">
          <div className="kt-titlebar">
            <div>
              <div className="kt-inline">
                <h1>{booking.bookingRef}</h1>
                <span className="kt-badge ticketed">BILETA</span>
                <button className="kt-badge pdf" onClick={demo}><Ticket />Bileta Wizz (PDF)</button>
                <span className="kt-badge">{booking.source}</span>
              </div>
              <p className="kt-subtitle">Krijuar {booking.createdAt}</p>
            </div>
            <div className="kt-actions">
              <button className="kt-btn" onClick={showHistory}><History />Historiku</button>
              <button className="kt-btn blue" onClick={demo}><CheckSquare />Krijo Detyrë</button>
              <button className="kt-btn blue" onClick={demo}><FileWarning />Claim</button>
              <button className="kt-btn red" onClick={demo}><XCircle />Anulo</button>
              <button className="kt-btn red" onClick={demo}><Undo2 />Kthe në Konfirmuar</button>
            </div>
          </div>

          <section className="kt-summary" aria-label="Klienti dhe çmimet">
            <div className="kt-summary-cell">
              <div className="kt-label">Klienti</div>
              <div className="kt-client"><User />{booking.customerName}</div>
              <div className="kt-subtitle" style={{ marginLeft: 23 }}>{booking.agentName}</div>
            </div>
            <div className="kt-summary-cell">
              <div className="kt-label">PNR</div>
              <div className="kt-summary-value pnr kt-mono">{booking.pnr}</div>
              <div className="kt-subtitle">Nga pasagjerët</div>
            </div>
            <div className="kt-summary-cell">
              <div className="kt-label">Shuma e shitjes</div>
              <div className="kt-summary-value">€{fmtM(booking.totalAmount)}</div>
              <div className="kt-subtitle">Çmimi total i faturës</div>
            </div>
            <div className="kt-summary-cell">
              <div className="kt-label">Çmimi neto</div>
              <div className="kt-price"><span className="kt-muted">€</span><input aria-label="Çmimi neto" defaultValue="85" onBlur={demo} /><Pencil size={11} className="kt-muted" /></div>
              <div className="kt-subtitle">Blerja nga linja</div>
            </div>
            <div className="kt-summary-cell profit">
              <div className="kt-label">Komisioni</div>
              <div className="kt-summary-value">€{fmtM(booking.commissionAmount)}</div>
              <div className="kt-subtitle" style={{ color: "#159871" }}>43.3% marzh · €150 − €85</div>
            </div>
          </section>

          <div className="kt-columns">
            <main className="kt-main">
              <section className="kt-card">
                <div className="kt-card-head kt-flight-head">
                  <div className="kt-inline">
                    <span className="kt-flight-icon"><PlaneTakeoff /></span>
                    <h2>Informacion Fluturimi</h2><span className="kt-muted">·</span>
                    <button className="kt-link" onClick={demo}>{flight.airline} {flight.flightNumber}</button>
                  </div>
                  <span className="kt-open">● OPEN</span>
                </div>
                <div className="kt-flight-grid">
                  <div><span className="kt-label" style={{ color: "#4d8cce" }}>Rruga</span><strong>{flight.fromAirport} → {flight.toAirport}</strong><small>{flight.fromCity} → {flight.toCity}</small></div>
                  <div><span className="kt-label" style={{ color: "#9263cd" }}>Nisja</span><strong>{flight.departureTime}</strong><small>{flight.departureDate}</small></div>
                  <div><span className="kt-label" style={{ color: "#9263cd" }}>Mbërritja</span><strong>{flight.arrivalTime}</strong><small>{flight.departureDate}</small></div>
                  <div><span className="kt-label">Kohëzgjatja</span><strong style={{ color: "#6941a4", fontSize: 13 }}>{flight.duration}</strong><small>Direkt</small></div>
                  <div><span className="kt-label" style={{ color: "#159871" }}>Vendet</span><strong style={{ color: "#15816a" }}>30 <small>/ 36</small></strong><small>të lira</small></div>
                </div>
                <div className="kt-price-compare">
                  <span className="kt-muted">Çmimi Ynë:</span><span className="kt-pill">● €200</span>
                  <button className="kt-icon-btn" aria-label="Historiku i çmimit" onClick={demo}><History /></button>
                  <Globe className="kt-muted" /><span className="kt-muted">Google Flights:</span><span className="kt-pill expensive">● €317</span>
                </div>
                <div className="kt-admin">
                  <div className="kt-inline"><Globe /><strong>ÇMIMI I GOOGLE (ADMIN)</strong><span style={{ color: "#8e97ae" }}>Përditësuar së fundmi · €317</span></div>
                  <button className="kt-icon-btn" onClick={demo} aria-label="Përditëso çmimin e Google"><RefreshCw /></button>
                </div>
              </section>

              <details className="kt-card">
                <summary><span className="kt-inline"><User />Informacion Klienti</span><ChevronDown /></summary>
                <div className="kt-details">
                  <div className="kt-detail-row"><span>Emri</span><strong>{booking.customerName}</strong></div>
                  <div className="kt-detail-row"><span>Agjencia</span><strong>{booking.agentName}</strong></div>
                  <div className="kt-detail-row"><span>Email / Telefon</span><strong>– / –</strong></div>
                  <button className="kt-btn blue" style={{ marginTop: 12 }} onClick={demo}><Pencil />Ndrysho klientin</button>
                </div>
              </details>

              <section className="kt-card">
                <div className="kt-card-head">
                  <h2>Pasagjerët <span className="kt-muted">(1)</span>{selected && <span className="kt-subtitle"> · 1 i zgjedhur</span>}</h2>
                  <div className="kt-actions">
                    {selected && <button className="kt-btn blue" onClick={demo}><LayoutGrid />Cakto grupin</button>}
                    <button className="kt-btn" onClick={demo}><Plus />Shto Pasagjer</button>
                  </div>
                </div>
                <div className="kt-table-wrap">
                  <table className="kt-pax-table">
                    <thead><tr>
                      <th><input type="checkbox" aria-label="Zgjidh të gjithë pasagjerët" checked={selected} onChange={e => setSelected(e.target.checked)} /></th>
                      {["EMRI", "TIPI", "M/F", "ÇMIMI BILETËS", "SEAT", "DATËLINDJA", "SHTESA", "GRUPI", ""].map((h, i) => <th key={i}>{h}</th>)}
                    </tr></thead>
                    <tbody>{passengers.map((p: { id: number; firstName: string; lastName: string; type: string; ticketPrice: number; seatNumber: string; dateOfBirth: string }) => <tr key={p.id}>
                      <td><input type="checkbox" aria-label="Zgjidh Rabe SPAHIJAJ" checked={selected} onChange={e => setSelected(e.target.checked)} /></td>
                      <td><strong>{p.firstName} {p.lastName}</strong></td><td>{p.type}</td><td className="kt-muted">–</td>
                      <td>€{p.ticketPrice}</td><td className="kt-muted">{p.seatNumber}</td><td>{p.dateOfBirth}</td><td className="kt-muted">–</td><td className="kt-muted">–</td>
                      <td><div className="kt-inline" style={{ gap: 3 }}>
                        <button className="kt-icon-btn" aria-label="Ndrysho pasagjerin" onClick={demo}><Pencil /></button>
                        <button className="kt-icon-btn" aria-label="Fshi pasagjerin" onClick={demo} style={{ color: "#e04356" }}><Trash2 /></button>
                      </div></td>
                    </tr>)}</tbody>
                  </table>
                </div>
                <div className="kt-excel">
                  <div className="kt-excel-head">
                    <div className="kt-inline"><LayoutGrid /><strong style={{ fontSize: 11 }}>Kopjo për Excel</strong><span style={{ color: "#a7dfcb", fontSize: 9 }}>· 1 pasagjerë</span></div>
                    <div className="kt-actions">
                      <button className="kt-btn" onClick={demo}>RUAJ</button>
                      <button className="kt-btn" onClick={() => void copy(true)}><Clipboard />Kopjo për WhatsApp</button>
                      <button className="kt-btn" onClick={() => void copy()}><Copy />Kopjo</button>
                    </div>
                  </div>
                  <div className="kt-excel-table">
                    <table><thead><tr>{["PASSANGER", "EXTRA", "CONFIRMED", "-1 SHITUR", "OPERATORI", "SHENIME", "NISJA 2", "ORA", "DEST", "STATUS 2"].map(h => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody><tr><td>Rabe SPAHIJAJ</td><td>–</td><td className="confirmed">CONFIRMED</td><td>150 €</td><td>ONLINE TRAVEL</td><td><input aria-label="PNR për Excel" defaultValue={booking.pnr} onBlur={demo} /></td><td>5.1.2027</td><td>12:50</td><td>PRN-MMX</td><td className="confirmed">CONFIRMED</td></tr></tbody>
                    </table>
                  </div>
                </div>
                <div className="kt-extras">
                  <div style={{ display: "flex", justifyContent: "space-between" }}><h2>Extra Pasagjerëve</h2><span className="kt-subtitle">Total: €0</span></div>
                  <div className="kt-actions">{["Bagazh", "SEAT", "Prioritet", "Sigurim", "Tjetër"].map(e => <button className="kt-btn" onClick={demo} key={e}><Plus style={{ width: 11 }} />{e}</button>)}</div>
                  <div className="kt-empty-extra">Klikoni një opsion sipër për të shtuar extra</div>
                </div>
              </section>
            </main>

            <aside className="kt-payments">
              <section className="kt-card">
                <div className="kt-card-head"><h2 className="kt-inline"><Receipt />Pagesat</h2><span className="kt-badge">EUR</span></div>
                <div className="kt-money-body">
                  <div className="kt-money-total"><span className="kt-muted">Shuma totale</span><strong>€150</strong></div>
                  <div className="kt-money-grid">
                    <div><span>PAGUAR</span><strong>€0</strong></div>
                    <div><span>DETYRIM</span><strong>€150</strong></div>
                  </div>
                  <div className="kt-progress" /><div className="kt-progress-caption"><span>0% paguar</span><span>Mbetet €150</span></div>
                </div>
                <div className="kt-payment-history">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 style={{ fontSize: 11 }}>Historia e Pagesave <span className="kt-muted">0</span></h2><button className="kt-btn green" onClick={demo}><Plus />Shto</button></div>
                  <div className="kt-payment-empty"><Receipt /><span>Nuk ka pagesa</span><span style={{ fontSize: 10 }}>Pagesat e regjistruara shfaqen këtu.</span></div>
                </div>
              </section>

              <details className="kt-card" ref={historyRef} open={historyOpen} onToggle={e => setHistoryOpen(e.currentTarget.open)}>
                <summary><span className="kt-inline"><History />Historiku i rezervimit</span><ChevronDown /></summary>
                {!historyOpen && <div />}
                <div className="kt-history-body">
                  {transitions.map(t => <div className="kt-history-event" key={t.label}><strong>{t.label}</strong><p>{t.date} · {t.user}</p><p>{t.note}</p></div>)}
                </div>
              </details>
              <section className="kt-card kt-details">
                <div className="kt-label">Detaje</div>
                <div className="kt-detail-row"><span>Pasagjerë</span><strong>1</strong></div>
                <div className="kt-detail-row"><span>Krijuar</span><strong className="kt-mono">30.10.2026</strong></div>
                <div className="kt-detail-row"><span>Përditësuar</span><strong className="kt-mono">30.10.2026</strong></div>
              </section>
            </aside>
          </div>
        </div>
      </div>
      {notice && <div role="status" className="kt-toast">{notice}<button onClick={() => setNotice("")} aria-label="Mbyll njoftimin"><X /></button></div>}
    </div>
  );
}
