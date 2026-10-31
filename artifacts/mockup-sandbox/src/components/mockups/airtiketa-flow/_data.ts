// Extracted contracts and presentation rules from booking-engine Flights.tsx
// (groupByRoute / visibleFlights / requestedSeats / lines 530–605) and
// BookFlight.tsx (Passenger / emptyPassenger / totals / conditional DOB).
// All remote/auth/payment boundaries are deliberately replaced with local fixtures.
export type Passenger = {
 type:"adult"|"child"|"infant"; firstName:string; lastName:string; gender:string;
 passportNumber:string; nationality:string; dateOfBirth:string; baggageOption:string;
};
export const emptyPassenger=(type:Passenger["type"]="adult"):Passenger=>({
 type,firstName:"",lastName:"",gender:"",passportNumber:"",nationality:"",dateOfBirth:"",baggageOption:""
});
export type Flight = {
 id:number; fromCity:string; toCity:string; departureDate:string; departureTime:string;
 arrivalTime:string; airline:string; flightNumber:string; adultPrice:number; childPrice:number;
 infantPrice:number; agentAdultPrice:number; agentChildPrice:number; agentInfantPrice:number;
 tax:number; availableSeats:number; checkedBaggageCount:number; checkedBaggageKg:number; checkedBaggagePrice:number;
};
const sample:Flight={id:1,fromCity:"TIA",toCity:"LTN",departureDate:"2026-11-15",departureTime:"10:30",arrivalTime:"12:50",airline:"Wizz Air",flightNumber:"W4 4501",adultPrice:180,childPrice:144,infantPrice:27,agentAdultPrice:180,agentChildPrice:144,agentInfantPrice:27,tax:0,availableSeats:7,checkedBaggageCount:1,checkedBaggageKg:20,checkedBaggagePrice:60};
export const demoFlights:Flight[]=[
 sample,
 {...sample,id:2,departureDate:"2026-11-18",departureTime:"16:10",arrivalTime:"18:30",adultPrice:196,agentAdultPrice:184,childPrice:156,agentChildPrice:148,infantPrice:29,agentInfantPrice:29,tax:8,availableSeats:4,checkedBaggagePrice:55},
 {...sample,id:3,departureDate:"2026-11-22",departureTime:"07:15",arrivalTime:"09:35",adultPrice:167,agentAdultPrice:167,childPrice:132,agentChildPrice:132,infantPrice:24,agentInfantPrice:24,availableSeats:0},
 {...sample,id:4,toCity:"FCO",departureDate:"2026-11-15",departureTime:"13:20",arrivalTime:"14:45",airline:"Ryanair",flightNumber:"FR 8421",adultPrice:87,agentAdultPrice:87,childPrice:69,agentChildPrice:69,infantPrice:22,agentInfantPrice:22,checkedBaggagePrice:38,availableSeats:12},
 {...sample,id:5,toCity:"FCO",departureDate:"2026-11-19",departureTime:"09:00",arrivalTime:"10:25",airline:"Ryanair",flightNumber:"FR 8421",adultPrice:94,agentAdultPrice:94,childPrice:75,agentChildPrice:75,infantPrice:22,agentInfantPrice:22,checkedBaggagePrice:41},
 {...sample,id:6,fromCity:"LTN",toCity:"TIA",departureDate:"2026-11-15",departureTime:"14:00",arrivalTime:"18:20",flightNumber:"W4 4502",adultPrice:173,agentAdultPrice:173,checkedBaggagePrice:52},
 {...sample,id:7,fromCity:"LTN",toCity:"TIA",departureDate:"2026-11-20",departureTime:"18:10",arrivalTime:"22:30",flightNumber:"W4 4502",adultPrice:201,agentAdultPrice:201,checkedBaggagePrice:58}
];
export const city=(code:string)=>({TIA:"Tirana",LTN:"London Luton",FCO:"Rome Fiumicino"}[code]||code);
export function groupByRoute(flights:Flight[]){
 const groups:Record<string,Flight[]>={};
 for(const f of flights){const key=`${f.fromCity}→${f.toCity}`;(groups[key] ||= []).push(f)}
 return groups;
}
export const filterFlights=(from:string,to:string,date?:string)=>demoFlights.filter(f=>(!from||f.fromCity===from)&&(!to||f.toCity===to)&&(!date||f.departureDate===date));
// Match BookFlight handleSubmit and lib/nameValidation, not invented form rules.
export function passengerIssue(flight:Flight,passengers:Passenger[]):{key:string;name:string}|null{
 const namePattern=/^(?=.*[A-Za-z])[A-Za-z\s'.-]+$/;
 const badName=passengers.find(p=>!namePattern.test(p.firstName.trim())||!namePattern.test(p.lastName.trim()));
 if(badName)return {key:"Emri dhe mbiemri duhet të përmbajnë vetëm shkronjat A–Z (pa ë/ç ose shkronja të tjera) ({{name}}).",name:badName.firstName};
 const missingGender=passengers.find(p=>p.gender!=="M"&&p.gender!=="F");
 if(missingGender)return {key:"Gjinia (M/F) është e detyrueshme për të gjithë pasagjerët ({{name}}).",name:missingGender.firstName};
 const missingBirth=passengers.find(p=>p.type!=="adult"&&!p.dateOfBirth);
 if(missingBirth)return {key:"Datëlindja është e detyrueshme për të gjithë fëmijët dhe foshnjat ({{name}}).",name:missingBirth.firstName};
 for(const p of passengers){
  if(p.type==="adult")continue;
  const birth=new Date(`${p.dateOfBirth}T00:00:00`);const departure=new Date(`${flight.departureDate}T00:00:00`);
  if(Number.isNaN(birth.getTime()))continue;
  if(birth>new Date())return {key:"Datëlindja s'mund të jetë në të ardhmen ({{name}}).",name:p.firstName};
  let age=departure.getFullYear()-birth.getFullYear();
  if(departure.getMonth()<birth.getMonth()||(departure.getMonth()===birth.getMonth()&&departure.getDate()<birth.getDate()))age--;
  if(p.type==="infant"&&age>=2)return {key:"Foshnja duhet të jetë nën 2 vjeç në datën e fluturimit ({{name}}).",name:p.firstName};
  if(p.type==="child"&&(age<2||age>11))return {key:"Fëmija duhet të jetë 2–11 vjeç në datën e fluturimit ({{name}}).",name:p.firstName};
 }
 return null;
}
export function calculate(flight:Flight,passengers:Passenger[]){
 let ticket=0,baseTicket=0,extras=0;
 for(const p of passengers){
  ticket+=Math.round(p.type==="adult"?flight.agentAdultPrice:p.type==="child"?flight.agentChildPrice:flight.agentInfantPrice);
  baseTicket+=Math.round(p.type==="adult"?flight.adultPrice:p.type==="child"?flight.childPrice:flight.infantPrice);
  if(p.baggageOption==="checked") extras+=Math.round(flight.checkedBaggagePrice);
 }
 const tax=Math.round(flight.tax)*passengers.length;
 return {ticket,baseTicket,extras,tax,savings:Math.max(0,baseTicket-ticket),total:ticket+tax+extras};
}
