import { useState, type FormEvent } from "react";
import { UserRound, Plus, Trash2, Luggage, CreditCard } from "lucide-react";
import { Shell, Summary, FlightDetails, useFlow, go, typeLabel, money } from "./_shared";
import { emptyPassenger, passengerIssue, type Passenger } from "./_data";
import { useLanguage } from "./_language";

export function Passengers({providerBoundary=false}:{providerBoundary?:boolean}={}){
 const {state,update}=useFlow();const {t}=useLanguage();const [error,setError]=useState("");
 function edit(index:number,patch:Partial<Passenger>){update({passengers:state.passengers.map((p,i)=>i===index?{...p,...patch}:p),completed:false});setError("")}
 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(providerBoundary)return;
  const issue=passengerIssue(state.flight,state.passengers);
  if(issue){setError(t(issue.key,{name:issue.name||t("pasagjeri")}));return}
  const action=(e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-action");
  update({selected:true,completed:action!=="pay"});go(action==="pay"?"Payment":"Confirmation");
 }
 return <Shell><FlightDetails state={state}/>
  <form className="as-layout" onSubmit={submit}><div className="as-stack">
   <div className="as-panel-top"><h2>{t("Pasagjerët")}</h2><button type="button" className="as-link" onClick={()=>update({passengers:[...state.passengers,emptyPassenger()],completed:false})}><Plus style={{display:"inline"}}/>{t("Shto Pasagjer")}</button></div>
   {state.passengers.map((p,i)=><section className="as-panel" key={i}><div className="as-panel-top"><div className="as-panel-title"><UserRound/><h2>{t("Pasagjeri")} {i+1}</h2></div>{i>0&&<button type="button" className="as-link" aria-label={`${t("Pasagjeri")} ${i+1} −`} onClick={()=>update({passengers:state.passengers.filter((_,n)=>n!==i),completed:false})}><Trash2/></button>}</div><div className="as-grid">
    <label className="as-field">{t("Lloji")}<select aria-label={`${t("Lloji")} ${i+1}`} value={p.type} onChange={e=>edit(i,{type:e.target.value as Passenger["type"]})}>{(["adult","child","infant"] as const).map(type=><option value={type} key={type}>{typeLabel(type)}</option>)}</select></label>
    <label className="as-field">{t("Gjinia")} *<select required value={p.gender} onChange={e=>edit(i,{gender:e.target.value})}><option value="">{t("Zgjidh")}</option><option value="M">{t("Mashkull")}</option><option value="F">{t("Femër")}</option></select></label>
    <label className="as-field">{t("Emri")} *<input required value={p.firstName} onChange={e=>edit(i,{firstName:e.target.value})}/></label>
    <label className="as-field">{t("Mbiemri")} *<input required value={p.lastName} onChange={e=>edit(i,{lastName:e.target.value})}/></label>
    <label className="as-field">{t("Nr. Pasaportës")}<input value={p.passportNumber} onChange={e=>edit(i,{passportNumber:e.target.value})}/></label>
    <label className="as-field">{t("Kombësia")}<input value={p.nationality} onChange={e=>edit(i,{nationality:e.target.value})}/></label>
    {p.type!=="adult"&&<label className="as-field">{t("Datëlindja")} *<input type="date" value={p.dateOfBirth} onChange={e=>edit(i,{dateOfBirth:e.target.value})}/></label>}
   </div>{state.flight.checkedBaggagePrice>0&&<><div className="as-divider"/><label className={`as-bag-option ${p.baggageOption==="checked"?"selected":""}`}><input type="checkbox" checked={p.baggageOption==="checked"} onChange={e=>edit(i,{baggageOption:e.target.checked?"checked":""})}/><Luggage/><span className="as-option-copy"><b>{t("Bagazh i Regjistruar")} (+{money(state.flight.checkedBaggagePrice)})</b></span></label></>}</section>)}
  </div><Summary state={state}>{error&&<p className="as-error" role="alert">{error}</p>}<div className="as-source-actions">
   <button type="submit" data-action="confirm" className="as-btn" disabled={providerBoundary}>{t("Konfirmo Rezervimin")}</button>
   <button type="submit" data-action="pay" className="as-btn secondary" disabled={providerBoundary}><CreditCard/>Pay and Book</button>
  </div></Summary></form>
 </Shell>;
}
