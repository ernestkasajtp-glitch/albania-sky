import { useEffect } from "react";
import { ArrowRight, Download, Mail, X } from "lucide-react";
import { date, money, statusNames, city, type Portal } from "./_state";

export default function Details({p}:{p:Portal}) {
 useEffect(()=>{const listener=(e:KeyboardEvent)=>{if(e.key==="Escape"){p.setSelected(null);p.setReport(false);}};window.addEventListener("keydown",listener);return()=>window.removeEventListener("keydown",listener);},[p.setSelected,p.setReport]);
 const b=p.selected;
 if(!b&&!p.report)return null;
 const close=()=>{p.setSelected(null);p.setReport(false);p.setNotice("");};
 return <div className="tp-modal-backdrop" onClick={close}><section className="tp-modal" role="dialog" aria-modal="true" aria-label={b?"Detajet e rezervimit":"Raportet e agjencisë"} onClick={e=>e.stopPropagation()}>
 <div className="tp-modal-head"><div><div className="tp-kicker">Albania Sky · AB TRAVEL</div><h2>{b?b.bookingRef:"Raportet e agjencisë"}</h2><small>Demonstrim lokal · të dhëna dhe pasagjerë fiktivë</small></div><button aria-label="Mbyll" onClick={close}><X/></button></div>
 {b?<><strong>{b.customerName}</strong><small>{b.customerEmail} · Pasagjer fiktiv</small><div className="tp-detail-route"><div><strong>{b.fromCity}</strong><small>{city[b.fromCity]} · {b.departureTime}</small></div><ArrowRight/><div><strong>{b.toCity}</strong><small>{city[b.toCity]} · {b.arrivalTime}</small></div></div>
 <div className="tp-detail-grid"><div><small>Nisja</small><strong>{date(b.departureDate)}</strong></div><div><small>Fluturimi</small><strong>{b.airline}</strong><small>{b.flightNumber}</small></div><div><small>PNR</small><strong className="tp-mono">{b.pnr||"—"}</strong><small>{statusNames[b.status]}</small></div></div>
 <small>Rezervuar më {date(b.createdAt)}</small><div className="tp-detail-grid"><div><small>Shitje</small><h2>{money(b.totalAmount)}</h2></div><div><small>Paguar</small><h2>{money(b.paidAmount)}</h2></div><div><small>Mbetet</small><h2 className="tp-due">{money(b.dueAmount)}</h2></div></div>
 {b.status==="cancelled"&&<div className="tp-notice">Rezervim i anuluar. Nuk përfshihet në totalet financiare.</div>}<h3>Historia e pagesave</h3>
 {b.payments.length?b.payments.map(pay=><div key={pay.id} className="tp-history"><div>{date(pay.createdAt)}<small>CASH · {b.bookingRef}</small></div><strong>{money(pay.amount)}</strong></div>):<div className="tp-history"><small>Asnjë pagesë e regjistruar.</small></div>}
 <div className="tp-modal-actions"><button className="tp-btn" onClick={()=>p.setNotice("Vetëm demonstrim — nuk krijohet dhe nuk shkarkohet PDF.")}><Download/>Parapamje bilete PDF</button></div>
 </>:<><p>Pasqyrë e rezervimeve dhe pagesave të agjencisë. Filtrimi sipas datës së krijimit të rezervimit.</p><div className="tp-report-controls"><label><small>Lloji i raportit</small><select value={p.reportType} onChange={e=>p.setReportType(e.target.value)}><option value="full">Raport i plotë</option><option value="debt">Raport i detyrimeve</option></select></label><label><small>Nga data</small><input type="date" value={p.from} onChange={e=>p.setFrom(e.target.value)}/></label><label><small>Deri më</small><input type="date" value={p.to} onChange={e=>p.setTo(e.target.value)}/></label></div>
 {p.from&&p.to&&p.from>p.to?<div className="tp-notice">Data e fillimit duhet të jetë përpara datës së përfundimit.</div>:<><div className="tp-report-line"><strong>Rezervimi</strong><strong>Shitje</strong><strong>Mbetet</strong></div>{p.reportRows.map(r=><div className="tp-report-line" key={r.id}><div className="tp-mono">{r.bookingRef}<small>{r.customerName}</small></div><span>{money(r.totalAmount)}</span><strong>{money(r.dueAmount)}</strong></div>)}{!p.reportRows.length&&<p className="tp-notice">Nuk ka rezervime në këtë periudhë.</p>}<div className="tp-report-line"><strong>Gjithsej</strong><strong>{money(p.reportRows.reduce((s,r)=>s+r.totalAmount,0))}</strong><strong>{money(p.reportRows.reduce((s,r)=>s+r.dueAmount,0))}</strong></div></>}
 <div className="tp-modal-actions"><button className="tp-btn tp-btn-primary" onClick={()=>p.setNotice("Vetëm demonstrim — raporti shfaqet këtu. Nuk krijohet PDF.")}><Download/>Parapamje PDF</button><button className="tp-btn" onClick={()=>p.setNotice("Vetëm demonstrim — asnjë email nuk u dërgua.")}><Mail/>Dërgo me email</button><button className="tp-btn" onClick={()=>{p.setFrom("");p.setTo("");}}>Pastro datat</button></div></>}
 {p.notice&&<div className="tp-notice" role="status">{p.notice}</div>}
 </section></div>;
}
