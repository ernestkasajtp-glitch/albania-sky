import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { activityLabel, activityValue, offlineText, technicalActivity } from "@/lib/flightActivityDisplay";

const ENTITIES: Record<string,string> = { flights:"Fluturimi", bookings:"Rezervimi", passengers:"Pasagjeri",
  payments:"Pagesa", tasks:"Task", flight_notes:"Shënimi", agency_groups:"Grupi", agency_group_rules:"Rregulli i grupit",
  settings:"Zbritja", booking_extras:"Shtesa", claims:"Claim", booking_change_logs:"Historiku i rezervimit",
  flight_change_history:"Ngjarje fluturimi", flight_price_history:"Çmimi", flight_seat_history:"Vendet",
  task_comments:"Komenti i Task-ut", booking_comments:"Komenti i rezervimit", payment_change_logs:"Historiku i pagesës" };
const ACTIONS: Record<string,string> = { INSERT:"Krijim", UPDATE:"Ndryshim", DELETE:"Fshirje", create:"Krijim", update:"Ndryshim", delete:"Fshirje", price:"Ndryshim çmimi", manual:"Ndryshim manual", import:"Import", "citizen-price":"Çmim Offline" };

export function FlightActivityHistory({flightId, apiBase, labels}: {flightId:number;apiBase:string;labels:Record<string,string>}) {
  const [offset,setOffset] = useState(0);
  const query = useQuery({
    queryKey:["flight-change-history",flightId,"activity",offset],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/flights/${flightId}/activity-history?offset=${offset}`,{credentials:"include"});
      if (!res.ok) throw new Error("Nuk u ngarkua historiku i plotë.");
      return res.json() as Promise<{data:Array<{id:string;entity:string;operation:string;changes:Array<{field:string;old:unknown;new:unknown}>;reference:string|null;user_name:string|null;user_role:string|null;origin:string;created_at:string}>;hasMore:boolean}>;
    },
  });
  if (query.isPending) return <p className="py-6 text-center">Po ngarkohet historiku…</p>;
  if (query.isError) return <div role="alert" className="text-red-600">{query.error.message} <button onClick={()=>query.refetch()}>Riprovo</button></div>;
  return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">Të gjitha burimet · Të dhënat e ndjeshme nuk kopjohen. Ngjarjet e vjetra shfaqen vetëm kur janë ruajtur.</p>
    {!query.data.data.length && <p className="py-4 text-center">Nuk ka ngjarje të regjistruara.</p>}
    {query.data.data.map(e=><article key={e.id} className="rounded-lg border bg-white p-3 text-xs">
      <div className="flex flex-wrap justify-between gap-2"><strong>{offlineText(technicalActivity(e.entity,e.changes) ?? `${ENTITIES[e.entity]??e.entity} · ${ACTIONS[e.operation]??e.operation}`)}{e.reference?` · ${offlineText(e.reference)}`:""}</strong>
        <span>{format(new Date(e.created_at),"dd MMM yyyy, h:mm:ss a")}</span></div>
      <p className="mt-1 text-muted-foreground">{offlineText(e.user_name??"Autori nuk është ruajtur")}{e.user_role?` (${activityValue("user_role",e.user_role)})`:""} · {offlineText(e.origin === "Proces serveri / DB — burimi i paregjistruar" ? "Regjistruar nga databaza; burimi i saktë nuk është ruajtur" : e.origin)}</p>
      {technicalActivity(e.entity,e.changes) && <p className="mt-2 text-slate-600">Ngjarje teknike e kontrollit. Nuk nënkupton vetvetiu shitje, ndryshim vendesh apo anulim.</p>}
      <div className="mt-2 space-y-1">{e.changes.map((c,i)=>{
        const protectedValue = c.old === "[E mbrojtur]" || c.new === "[E mbrojtur]";
        return <div key={i} className="break-words"><span className="text-muted-foreground">{activityLabel(c.field,labels)}: </span>
          {protectedValue ? <span className="text-slate-600">Ndryshim i regjistruar · vlera e mbrojtur nuk shfaqet.</span> :
          <><span className="text-red-600 line-through whitespace-pre-wrap">{activityValue(c.field,c.old)}</span> → <span className="text-emerald-700 whitespace-pre-wrap">{activityValue(c.field,c.new)}</span></>}</div>;
      })}</div>
    </article>)}
    <div className="flex justify-between py-2"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-100))}>Më të rejat</button>
      <button disabled={!query.data.hasMore} onClick={()=>setOffset(offset+100)}>Më të vjetrat</button></div>
  </div>;
}
