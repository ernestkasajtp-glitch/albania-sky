import { useEffect, useState, type ReactNode } from "react";
import { Plane } from "lucide-react";
import { language, useLanguage } from "./_language";
import { calculate, demoFlights, emptyPassenger, type Passenger, type Flight } from "./_data";
import "./_group.css";

export type FlowState={flight:Flight;passengers:Passenger[];selected:boolean;completed:boolean};
const initial:FlowState={flight:demoFlights[0],passengers:[{...emptyPassenger(),firstName:"Elira",lastName:"Hoxha",gender:"F",nationality:"Albanian",passportNumber:"DEMO12345"}],selected:false,completed:false};
const key="albania-sky-proposal-v2";
function cleanState(value:unknown):FlowState{
 const clean={...initial};
 if(value&&typeof value==="object"){
  const saved=value as Record<string,unknown>;
  clean.selected=saved.selected===true;clean.completed=saved.completed===true;
  clean.flight=demoFlights.find(f=>f.id===(saved.flight as Flight)?.id)||initial.flight;
  if(Array.isArray(saved.passengers)&&saved.passengers.length)clean.passengers=saved.passengers.map(p=>({...emptyPassenger(),...p}));
 }
 return clean;
}
export function useFlow(){
 const [state,setState]=useState<FlowState>(()=>{try{return cleanState(JSON.parse(sessionStorage.getItem(key)||"{}"))}catch{return {...initial}}});
 useEffect(()=>{
  const sync=()=>{try{setState(cleanState(JSON.parse(sessionStorage.getItem(key)||"{}")))}catch{/* Keep local fixture. */}};
  window.addEventListener("storage",sync);window.addEventListener("as-flow-update",sync);
  return ()=>{window.removeEventListener("storage",sync);window.removeEventListener("as-flow-update",sync)};
 },[]);
 function update(patch:Partial<FlowState>){
  const next=cleanState({...state,...patch});setState(next);
  try{sessionStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event("as-flow-update"))}catch{/* No remote persistence. */}
 }
 return {state,update};
}
export const money=(n:number)=>`€${Math.round(n)}`;
export const route=(page:string)=>`/__mockup/preview/airtiketa-flow/${page}?lang=${language()}`;
export function go(page:string){window.location.assign(route(page))}
export const typeLabel=(type:Passenger["type"])=>{
 const key={adult:"I Rritur",child:"Fëmijë",infant:"Foshnjë"}[type];
 return language()==="en"?{adult:"Adult",child:"Child",infant:"Infant"}[type]:key;
};
export function Shell({children}:{children:ReactNode}){
 const {lang,t}=useLanguage();
 useEffect(()=>{document.documentElement.lang=lang==="en"?"en-GB":"sq"},[lang]);
 return <div className="as-flow as-source-parity" lang={lang==="en"?"en-GB":"sq"}>
  <aside className="as-prototype-banner" aria-label="Prototype">
   {lang==="en"?"Prototype / sample data — no booking, payment, ticket or PNR. Account, PDF and payment-provider actions are inactive.":"Prototip / të dhëna shembull — pa rezervim, pagesë, biletë ose PNR. Veprimet e llogarisë, PDF-së dhe ofruesit të pagesës janë joaktive."}
  </aside>
  <header className="as-header"><div className="as-container as-head-row">
   <img className="as-logo" src="/__mockup/images/travel-pro/albania-sky-logo.png" alt="Albania Sky"/>
   <nav className="as-source-nav"><a href={route("Results")}>{t("Fluturime")}</a><button type="button" disabled>{t("Rezervimet e Mia")}</button></nav>
   <nav className="as-source-language" aria-label="EN / SQ">{(["sq","en"] as const).map(l=><a key={l} href={`?lang=${l}`} aria-current={lang===l?"true":undefined}>{l.toUpperCase()}</a>)}</nav>
  </div></header>
  <main className="as-container as-main">{children}</main>
 </div>;
}
export function FlightDetails({state}:{state:FlowState}){
 const {t}=useLanguage();const f=state.flight;
 return <section className="as-ticket-banner as-source-flight">
  <div><strong>{f.airline} {f.flightNumber}</strong><p className="as-small">{f.departureDate} · {f.departureTime} → {f.arrivalTime}</p></div>
  <div className="as-source-route"><strong>{f.fromCity}</strong><Plane/><strong>{f.toCity}</strong></div>
  <div><strong>{money(f.agentAdultPrice)}</strong><p className="as-small">{t("për person")}</p></div>
 </section>;
}
export function PassengerDetails({state}:{state:FlowState}){
 return <div className="as-details-list">{state.passengers.map((p,i)=><div className="as-source-passenger" key={i}><strong>{p.firstName} {p.lastName}</strong><span>{p.passportNumber} <span className="as-pill">{typeLabel(p.type)}</span></span></div>)}</div>;
}
export function Summary({state,children}:{state:FlowState;children?:ReactNode}){
 const {t}=useLanguage();const amounts=calculate(state.flight,state.passengers);
 return <aside className="as-panel as-summary"><h2>{t("Përmbledhja e Çmimit")}</h2><div className="as-divider"/>
  <div className="as-summary-row"><span>{t("Bileta")} ×{state.passengers.length}</span><strong>{money(amounts.ticket)}</strong></div>
  {amounts.tax>0&&<div className="as-summary-row"><span>{t("Taksa & Tarifa")}</span><strong>{money(amounts.tax)}</strong></div>}
  {amounts.extras>0&&<div className="as-summary-row"><span>{t("Shërbime Shtesë")}</span><strong>{money(amounts.extras)}</strong></div>}
  {amounts.savings>0&&<div className="as-summary-row as-source-saving"><span>{t("Kursim")}</span><strong>−{money(amounts.savings)}</strong></div>}
  <div className="as-divider"/><div className="as-total"><strong>{t("Gjithsej")}</strong><strong aria-live="polite">{money(amounts.total)}</strong></div>{children}
 </aside>;
}
