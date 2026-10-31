import { sourceEnglish } from "./_copy";
// Language is carried by preview links, never by the real application.
// English is the default even when an older Albanian preview session exists.
export type Language = "en" | "sq";
export function language(): Language {
 return new URLSearchParams(window.location.search).get("lang")==="sq"?"sq":"en";
}
export function useLanguage(){
 const lang=language();
 return {lang,t:(sq:string,values:Record<string,string|number>={})=>{
  let text=lang==="en"?(sourceEnglish[sq]||sq):sq;
  for(const [key,value] of Object.entries(values))text=text.replaceAll(`{{${key}}}`,String(value));
  return text;
 }};
}
export function displayDate(value:string){
 if(!value) return language()==="en"?"Select date":"Zgjidhni datën";
 const date=new Date(`${value}T12:00:00`);
 if(Number.isNaN(date.getTime()))return value;
 // Some preview browsers ship without Albanian ICU data; never fall back to US dates.
 const months=language()==="en"?["January","February","March","April","May","June","July","August","September","October","November","December"]:["janar","shkurt","mars","prill","maj","qershor","korrik","gusht","shtator","tetor","nëntor","dhjetor"];
 return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
export function displayFlightDate(value:string){
 const date=new Date(`${value}T12:00:00`);
 const weekdays=language()==="en"?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]:["Die","Hën","Mar","Mër","Enj","Pre","Sht"];
 return `${weekdays[date.getDay()]} ${String(date.getDate()).padStart(2,"0")}.${String(date.getMonth()+1).padStart(2,"0")}`;
}
