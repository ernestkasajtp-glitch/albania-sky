import { Check, Plane, Download } from "lucide-react";
import { Shell, useFlow, route, money, PassengerDetails } from "./_shared";
import { calculate } from "./_data";
import { useLanguage } from "./_language";

export function Confirmation(){
 const {state}=useFlow();const {t}=useLanguage();const f=state.flight;
 return <Shell><div className="as-confirm-body">
  <div className="as-success-top"><div className="as-checkcircle"><Check/></div><h1>{t("Rezervimi u Konfirmua!")}</h1><p className="as-muted">{t("Referenca jote e rezervimit:")}</p><div className="as-receipt-code">DEMO–SKY</div><p className="as-small as-muted">{t("Statusi:")} <strong>{t("Në Pritje")}</strong></p></div>
  <section className="as-ticket-banner as-source-flight"><div><p className="as-small">{f.airline} · {f.flightNumber}</p><strong>{f.departureDate} · {f.departureTime} → {f.arrivalTime}</strong></div><div className="as-source-route"><strong>{f.fromCity}</strong><Plane/><strong>{f.toCity}</strong></div><div><p className="as-small">{t("Gjithsej")}</p><strong>{money(calculate(f,state.passengers).total)}</strong></div></section>
  <section className="as-panel"><h2>{t("Pasagjerët")}</h2><PassengerDetails state={state}/></section>
  <div className="as-confirm-actions"><button type="button" className="as-btn" disabled><Download/>{t("Shkarko Biletën PDF")}</button><button type="button" className="as-btn secondary" disabled>{t("Rezervimet e Mia")}</button><a className="as-btn secondary" href={route("Results")}>{t("Kërko Fluturime")}</a></div>
 </div></Shell>;
}
