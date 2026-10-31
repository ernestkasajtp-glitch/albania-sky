import "./_group.css";
import { useState } from "react";

export type Booking = {
  id: number;
  ref: string;
  pnr: string;
  agency: string;
  customer: string;
  from: string;
  to: string;
  cityFrom: string;
  cityTo: string;
  departure: string;
  time: string;
  created: string;
  pax: number;
  total: number;
  paid: number;
  due: number;
  status: "draft" | "pending" | "confirmed" | "ticketed" | "cancelled";
  commission: number;
  netManual: number | null;
};

/* Synthetic values. Column hierarchy and row details follow the current FMS
   booking table: REF/PNR, client, agency, route, PAX, departure, money, status. */
export const BOOKINGS: Booking[] = [
  { id:1, ref:"KTF4821", pnr:"Q7M2LX", agency:"Nesti Travel", customer:"Alda Berisha", from:"TIA", to:"FCO", cityFrom:"Tiranë", cityTo:"Romë", departure:"2026-06-18", time:"07:35", created:"2026-05-19 14:22", pax:3, total:1840, paid:1100, due:740, status:"pending", commission:120, netManual:1720 },
  { id:2, ref:"KTF4820", pnr:"WZ8K2L", agency:"Drita Tours", customer:"Marina Kola", from:"TIA", to:"MXP", cityFrom:"Tiranë", cityTo:"Milano", departure:"2026-06-21", time:"11:10", created:"2026-05-19 11:08", pax:2, total:620, paid:620, due:0, status:"ticketed", commission:65, netManual:555 },
  { id:3, ref:"KTF4819", pnr:"—", agency:"Fly Travel", customer:"Edmond Lika", from:"TIA", to:"IST", cityFrom:"Tiranë", cityTo:"Stamboll", departure:"2026-06-30", time:"15:45", created:"2026-05-18 17:45", pax:4, total:1280, paid:0, due:1280, status:"draft", commission:90, netManual:null },
  { id:4, ref:"KTF4818", pnr:"RY9PQM", agency:"Alba Tours", customer:"Lorenc Hyseni", from:"TIA", to:"BCN", cityFrom:"Tiranë", cityTo:"Barcelonë", departure:"2026-07-05", time:"08:20", created:"2026-05-18 09:12", pax:2, total:740, paid:740, due:0, status:"confirmed", commission:72, netManual:668 },
  { id:5, ref:"KTF4817", pnr:"AB23X9", agency:"Nesti Travel", customer:"Suela Bibaj", from:"TIA", to:"MUC", cityFrom:"Tiranë", cityTo:"Mynih", departure:"2026-07-12", time:"06:50", created:"2026-05-16 16:30", pax:1, total:310, paid:150, due:160, status:"confirmed", commission:-18, netManual:328 },
  { id:6, ref:"KTF4816", pnr:"QQ5MNP", agency:"Pegasus Travel", customer:"Drilon Berisha", from:"TIA", to:"SAW", cityFrom:"Tiranë", cityTo:"Stamboll", departure:"2026-06-09", time:"19:05", created:"2026-05-14 10:55", pax:5, total:1980, paid:0, due:1980, status:"cancelled", commission:140, netManual:1840 },
  { id:7, ref:"KTF4815", pnr:"LX7K2D", agency:"Fly Travel", customer:"Eralda Çela", from:"TIA", to:"ZRH", cityFrom:"Tiranë", cityTo:"Zyrih", departure:"2026-07-20", time:"09:40", created:"2026-05-12 13:40", pax:3, total:1110, paid:1110, due:0, status:"ticketed", commission:86, netManual:1024 },
  { id:8, ref:"KTF4814", pnr:"P4RD8T", agency:"Drita Tours", customer:"Besnik Gjoni", from:"TIA", to:"VIE", cityFrom:"Tiranë", cityTo:"Vjenë", departure:"2026-06-24", time:"12:15", created:"2026-05-11 12:18", pax:2, total:560, paid:300, due:260, status:"pending", commission:42, netManual:518 },
  { id:9, ref:"KTF4813", pnr:"N8CL5A", agency:"Alba Tours", customer:"Elira Mema", from:"TIA", to:"ATH", cityFrom:"Tiranë", cityTo:"Athinë", departure:"2026-06-28", time:"16:30", created:"2026-05-10 09:06", pax:1, total:285, paid:285, due:0, status:"confirmed", commission:25, netManual:260 },
  { id:10, ref:"KTF4812", pnr:"—", agency:"Nesti Travel", customer:"Ardit Shala", from:"TIA", to:"BUD", cityFrom:"Tiranë", cityTo:"Budapest", departure:"2026-07-02", time:"13:55", created:"2026-05-09 15:42", pax:2, total:490, paid:100, due:390, status:"pending", commission:34, netManual:null },
  { id:11, ref:"KTF4811", pnr:"T6YH3W", agency:"Fly Travel", customer:"Mira Dervishi", from:"TIA", to:"FRA", cityFrom:"Tiranë", cityTo:"Frankfurt", departure:"2026-07-08", time:"05:25", created:"2026-05-08 08:34", pax:4, total:1560, paid:900, due:660, status:"confirmed", commission:110, netManual:1450 },
  { id:12, ref:"KTF4810", pnr:"C9Q2VZ", agency:"Pegasus Travel", customer:"Ilir Kastrati", from:"TIA", to:"BLQ", cityFrom:"Tiranë", cityTo:"Bolonjë", departure:"2026-06-16", time:"10:05", created:"2026-05-07 17:01", pax:1, total:345, paid:345, due:0, status:"ticketed", commission:-12, netManual:357 },
];

export function formatEuro(value: number) {
  return `€${Math.round(value).toLocaleString("de-DE")}`;
}

export function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

const labels: Record<Booking["status"], string> = {
  draft: "Draft",
  pending: "Pritje",
  confirmed: "Konfirmuar",
  ticketed: "Biletuar",
  cancelled: "Anuluar",
};

/* Baseline is extracted from the FMS classic booking-list JSX structures:
   compact filter row, grouped total/paguar/detyrim figures, and status badges. */
export function Current() {
  const [query, setQuery] = useState("");
  const rows = BOOKINGS.filter(row =>
    `${row.ref} ${row.pnr} ${row.customer} ${row.agency}`.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div className="kj-bookings">
      <div className="kjb-main">
        <div className="kjb-heading">
          <div>
            <h1>Rezervimet</h1>
            <p>Administro rezervimet e klientëve, pagesat dhe statuset.</p>
          </div>
          <span className="kjb-demo">Pamje prove · të dhëna ilustruese</span>
        </div>
        <section className="kjb-filterbox">
          <div className="kjb-filter-row">
            <div className="kjb-input-wrap">
              <span aria-hidden="true">⌕</span>
              <input aria-label="Kërko rezervime" placeholder="Klienti, agjencia, Ref, PNR..." value={query} onChange={event => setQuery(event.target.value)} />
            </div>
            <select className="kjb-select" aria-label="Statusi"><option>Të gjitha statuset</option><option>Pritje</option></select>
            <select className="kjb-select" aria-label="Agjencia"><option>Të gjitha agjencitë</option><option>Nesti Travel</option></select>
          </div>
          <div className="kjb-filter-lower"><span>{rows.length} rezervime në listë</span><span>Kërkim lokal · pamje prove</span></div>
        </section>
        <section className="kjb-table-panel">
          <div className="kjb-table-scroll">
            <table className="kjb-table">
              <thead><tr><th>REF / PNR</th><th>Klienti</th><th>Agjencia</th><th>Fluturimi</th><th>PAX</th><th>Nisja</th><th style={{textAlign:"right"}}>Financa · Total / Paguar / Detyrim</th><th>Statusi</th></tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className={row.status === "cancelled" ? "row-cancelled" : ""}>
                    <td><span className="kjb-ref">{row.ref}</span><span className="kjb-sub">{row.pnr}</span></td>
                    <td><span className="kjb-name">{row.customer}</span><span className="kjb-created">Krijuar {row.created}</span></td>
                    <td><span className="kjb-agency">{row.agency}</span></td>
                    <td><span className="kjb-route">{row.from} → {row.to}<small>{row.cityFrom} – {row.cityTo}</small></span></td>
                    <td className="kjb-pax">{row.pax}</td>
                    <td className="kjb-depart">{formatDate(row.departure)}<small>{row.time}</small></td>
                    <td><div className="kjb-money"><strong>{formatEuro(row.total)}</strong><small><span className="paid">{formatEuro(row.paid)}</span> / <span className={row.due ? "due" : "settled"}>{formatEuro(row.due)}</span></small></div></td>
                    <td><span className={`status-badge status-${row.status}`}>{labels[row.status]}</span></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td className="kjb-no-results" colSpan={8}>Nuk ka rezervime që përputhen me kërkimin.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="kjb-footer"><span>Faqja 1 nga 1 · {rows.length} rezervime</span><span>Vlera financiare në euro</span></div>
        </section>
      </div>
    </div>
  );
}

export default Current;