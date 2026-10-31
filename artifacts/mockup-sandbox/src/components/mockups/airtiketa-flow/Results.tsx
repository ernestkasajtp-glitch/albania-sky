import { useState } from "react";
import { Plane, Search } from "lucide-react";
import { DateStrip } from "./_DateStrip";
import { Shell, useFlow, go, money, typeLabel } from "./_shared";
import { useLanguage, displayFlightDate } from "./_language";
import { city, emptyPassenger, filterFlights, groupByRoute, type Flight, type Passenger } from "./_data";

export function Results(){
 const {state,update}=useFlow();const {t}=useLanguage();
 const [from,setFrom]=useState(state.flight.fromCity);const [to,setTo]=useState(state.flight.toCity);
 const [date,setDate]=useState(state.flight.departureDate);
 const [query,setQuery]=useState({from:state.flight.fromCity,to:state.flight.toCity,date:state.flight.departureDate});
 const [mode,setMode]=useState<"cards"|"list">("cards");
 const [counts,setCounts]=useState({adult:state.passengers.filter(p=>p.type==="adult").length,child:state.passengers.filter(p=>p.type==="child").length,infant:state.passengers.filter(p=>p.type==="infant").length});
 // Independent date-filtered and route-wide collections, as in Flights.tsx.
 const flights=filterFlights(query.from,query.to,query.date);
 const allFlights=filterFlights(query.from,query.to);
 const visibleFlights=mode==="list"?allFlights:flights;
 const requestedSeats=Math.max(1,counts.adult+counts.child);
 function select(flight:Flight){
  const passengers:Passenger[]=[];
  for(const type of ["adult","child","infant"] as const)for(let i=0;i<counts[type];i++)passengers.push(state.passengers.filter(p=>p.type===type)[i]||emptyPassenger(type));
  update({flight,passengers,selected:true,completed:false});go("Passengers");
 }
 const routeLabel=(f:string,to:string)=>`${f} – ${city(f)} → ${to} – ${city(to)}`;
 function price(f:Flight){return f.availableSeats<requestedSeats?<strong>{t("E Shitur")}</strong>:<>{f.agentAdultPrice<f.adultPrice&&<del className="as-small as-muted">{money(f.adultPrice)}</del>}<strong>{money(f.agentAdultPrice)}</strong></>}
 return <Shell>
  <form className="as-panel as-search" onSubmit={e=>{e.preventDefault();setQuery({from,to,date})}}>
   <label className="as-field">{t("Nga")}<select aria-label={t("Nga")} value={from} onChange={e=>setFrom(e.target.value)}>{["TIA","LTN"].map(c=><option value={c} key={c}>{city(c)} ({c})</option>)}</select></label>
   <label className="as-field">{t("Për")}<select aria-label={t("Për")} value={to} onChange={e=>setTo(e.target.value)}>{["LTN","FCO","TIA"].map(c=><option value={c} key={c}>{city(c)} ({c})</option>)}</select></label>
   <label className="as-field">{t("Data")}<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>
   <fieldset className="as-counts"><legend className="as-small">{t("Pasagjerët")}</legend>{(["adult","child","infant"] as const).map(type=><label key={type} className="as-field">{typeLabel(type)}<input type="number" min={type==="adult"?1:0} value={counts[type]} onChange={e=>setCounts({...counts,[type]:Math.max(type==="adult"?1:0,Number(e.target.value))})}/></label>)}</fieldset>
   <button className="as-btn" type="submit"><Search/>{t("Kërko")}</button>
  </form>
  <DateStrip key={`${query.from}-${query.to}`} date={date} from={query.from} to={query.to} flights={allFlights} seats={requestedSeats} onSelect={value=>{setDate(value);setQuery({...query,date:value});setMode("cards")}}/>
  <div className="as-stack">
   <div className="as-panel-top">{visibleFlights.length>0?<h2>{t("{{count}} fluturime u gjetën",{count:visibleFlights.length})}</h2>:<span/>}<div className="as-view-switch" role="group" aria-label={`${t("Karta")} / ${t("Listë")}`}><button className={`as-btn ${mode==="cards"?"":"secondary"}`} onClick={()=>setMode("cards")} aria-pressed={mode==="cards"}>{t("Karta")}</button><button className={`as-btn ${mode==="list"?"":"secondary"}`} onClick={()=>setMode("list")} aria-pressed={mode==="list"}>{t("Listë")}</button></div></div>
   {!visibleFlights.length?<div className="as-panel as-source-empty"><h2>{t("Nuk u gjetën fluturime")}</h2><p>{t("Nuk ka fluturime për këtë kombinim. Provo data ose destinacione të tjera.")}</p></div>:mode==="list"?
    Object.entries(groupByRoute(visibleFlights)).map(([route,routeFlights])=><section className="as-route-table" key={route}><div className="as-route-table-title"><strong>{routeLabel(routeFlights[0].fromCity,routeFlights[0].toCity)}</strong><small>{t("{{count}} fluturime",{count:routeFlights.length})}</small></div><div className="as-table-scroll"><table><thead><tr><th>{t("Data")}</th><th>{t("Orari")}</th><th>{t("Nr. Fluturimit")}</th><th>{t("Çmimi")}</th><th/></tr></thead><tbody>{routeFlights.map(f=><tr key={f.id} className={f.availableSeats<requestedSeats?"as-sold":""}><td>{displayFlightDate(f.departureDate)}</td><td>{f.departureTime} → {f.arrivalTime}</td><td><code>{f.flightNumber}</code></td><td>{price(f)}</td><td>{f.availableSeats>=requestedSeats&&<button className="as-btn" onClick={()=>select(f)}>{t("Rezervo")}</button>}</td></tr>)}</tbody></table></div></section>):
    visibleFlights.map(f=><article className="as-result-card" key={f.id}><div className="as-result-main"><div className="as-carrier"><span className="as-carrier-mark"><Plane/></span><div><strong>{f.airline}</strong><p className="as-micro as-muted">{f.flightNumber}</p></div></div><div className="as-timing"><div><strong>{f.departureTime}</strong><small>{f.fromCity} · {city(f.fromCity)}</small></div><div className="as-duration"><div className="as-route-line"><Plane/></div>{f.departureDate}</div><div><strong>{f.arrivalTime}</strong><small>{f.toCity} · {city(f.toCity)}</small></div></div><div className="as-fare"><div>{price(f)}{f.availableSeats>=requestedSeats&&<p className="as-small as-muted">{t("për person")}</p>}</div>{f.availableSeats>=requestedSeats&&<button className="as-btn" onClick={()=>select(f)}>{t("Rezervo")}</button>}</div></div><div className="as-result-bottom">{f.availableSeats>=requestedSeats&&f.availableSeats>0&&f.availableSeats<=10&&<span className="as-pill">{t("Vetëm {{count}} vende të mbetura",{count:f.availableSeats})}</span>}<span className="as-small as-muted">{f.checkedBaggageCount}× {f.checkedBaggageKg}kg {t("bagazh")} +{money(f.checkedBaggagePrice)}</span></div></article>)}
  </div>
 </Shell>;
}
