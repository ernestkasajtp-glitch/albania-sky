import { useState } from "react";
import "./_dates.css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Flight, city } from "./_data";
import { useLanguage, displayDate } from "./_language";

export function fullFlightDate(value: string, lang: "en" | "sq") {
 const d = new Date(`${value}T12:00:00Z`);
 const names = lang === "en" ? ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] : ["E diel","E hënë","E martë","E mërkurë","E enjte","E premte","E shtunë"];
 const day = d.getUTCDate();
 const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : ({1:"st",2:"nd",3:"rd"} as Record<number,string>)[day % 10] || "th";
 return `${names[d.getUTCDay()]}, ${lang === "en" ? displayDate(value).replace(/^\d+/, `${day}${suffix}`) : displayDate(value)}`;
}

export function DateStrip({date, flights, seats, from, to, onSelect}: {date:string; flights:Flight[]; seats:number; from:string; to:string; onSelect:(date:string)=>void}) {
 const {lang,t}=useLanguage();
 const [offset,setOffset]=useState(0);
 const days = Array.from({length:5},(_,i)=>{
  const d=new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+offset+i-2);
  const value=d.toISOString().slice(0,10);
  const available=flights.filter(f=>f.departureDate===value&&f.availableSeats>=seats);
  return {value, price:available.length ? Math.min(...available.map(f=>f.agentAdultPrice)) : null, sold:flights.some(f=>f.departureDate===value)&&!available.length};
 });
 return <section className="as-date-selector" aria-label={t("Data")}>
  <h2>{t("Nga")}: {city(from)} → {city(to)}</h2>
  <div className="as-date-rail">
   <button type="button" className="as-date-arrow" aria-label={lang==="en"?"Previous dates":"Datat e mëparshme"} onClick={()=>setOffset(n=>n-5)}><ChevronLeft/></button>
   <div className="as-date-options">{days.map(day=><button type="button" key={day.value} className={`as-date-choice ${date===day.value?"selected":""}`} aria-pressed={date===day.value} onClick={()=>{onSelect(day.value);setOffset(0)}}>
    <span>{fullFlightDate(day.value,lang)}</span>
    <strong>{day.price!==null?`€${day.price.toFixed(0)}`:day.sold?t("E Shitur"):"—"}</strong>
   </button>)}</div>
   <button type="button" className="as-date-arrow" aria-label={lang==="en"?"Next dates":"Datat e ardhshme"} onClick={()=>setOffset(n=>n+5)}><ChevronRight/></button>
  </div>
 </section>;
}
