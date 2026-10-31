import {useState,useRef} from 'react';
import {Plane,Plus,Trash2,ArrowRight,Loader2,AlertCircle,CreditCard,Luggage} from 'lucide-react';
import './_group.css';
const t=(s:string)=>s; const fmtM=(n:number)=>String(Math.round(n)); const fmtAmPm=(s?:string)=>s;
const Link=({href,children,...props}:any)=><a {...props}>{children}</a>;
const emptyPassenger=()=>({type:'adult',gender:'',firstName:'',lastName:'',passportNumber:'',nationality:'',dateOfBirth:'',baggageOption:'',hasSeatSelection:false,hasPriorityBoarding:false,hasInsurance:false});
export function Current(){
const airline=true, i18n={language:'sq'};
const flight={airline:'WIZZ AIR',flightNumber:'W45018',departureDate:'2026-12-19',departureTime:'13:00',arrivalTime:'14:45',fromCity:'BGY',toCity:'TIA',checkedBaggagePrice:60,seatSelectionPrice:null,priorityBoardingPrice:null,insurancePrice:null};
const [passengers,setPassengers]=useState([emptyPassenger()]);
const updatePassenger=(i:number,key:string,value:any)=>setPassengers(ps=>ps.map((p,j)=>j===i?{...p,[key]:value}:p));
const totals={fd:{type:'percent',value:5},baseAdult:150,effAdult:143,savings:7,flightSavings:7,ticketGroups:{adult:{count:1,amount:143},child:{count:0,amount:0},infant:{count:0,amount:0}},ticket:143,tax:0,extras:0,total:143};
const user=true, submitting=false,error='',flightId='demo', customerEmail='',customerPhone='',notes='';
const [submitAction] = useState<"" | "confirm" | "pay">("");
const actionRef=useRef(''); const handleSubmit=(e:any)=>{e.preventDefault();};
  const flightSummary = (
      <div className={`${airline ? "air-itinerary" : ""} text-white rounded-2xl p-5 mb-6`} style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Plane className="h-5 w-5" />
            <div>
              <div className="font-semibold">{flight?.airline} {flight?.flightNumber}</div>
              <div className="text-blue-100 text-sm">{airline && flight?.departureDate ? new Date(`${flight.departureDate}T12:00:00`).toLocaleDateString(i18n.language === "en" ? "en-GB" : "sq-AL", { day: "numeric", month: "long", year: "numeric" }) : flight?.departureDate} {t("në")} {fmtAmPm(flight?.departureTime)}{airline && <> → {fmtAmPm(flight?.arrivalTime)}</>}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-lg font-bold">
            <span>{flight?.fromCity}</span>
            <ArrowRight className="h-4 w-4" />
            <span>{flight?.toCity}</span>
          </div>
          <div className="text-right">
            {(totals.fd ? totals.baseAdult > totals.effAdult : totals.savings > 0) && (
              <div className="text-blue-200 text-xs line-through">€{fmtM(totals.baseAdult)}</div>
            )}
            {totals.fd && (
              <div className="inline-block text-[10px] font-bold bg-emerald-500 text-white rounded-full px-2 py-0.5 mb-0.5">
                {t("Zbritje fluturimi")} {totals.fd.type === "percent" ? `−${totals.fd.value}%` : `−€${fmtM(totals.fd.value)}`}
              </div>
            )}
            <div className="text-2xl font-bold">€{fmtM(totals.effAdult)}</div>
            <div className="text-blue-100 text-xs">{t("për person")}</div>
          </div>
        </div>
      </div>
  );

  return (
    <div className={`${airline ? "air-portal air-booking" : ""} max-w-5xl mx-auto px-4 py-8`}>
      {!airline && flightSummary}
      <form onSubmit={handleSubmit} className="grid md:grid-cols-3 gap-6">
        <div className={`${airline ? "air-passengers" : ""} md:col-span-2 space-y-6`}>
          {/* Passengers */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{t("Pasagjerët")}</h2>
              <button
                type="button"
                onClick={() => setPassengers(prev => [...prev, emptyPassenger()])}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="h-4 w-4" /> {t("Shto Pasagjer")}
              </button>
            </div>
            <div className="space-y-4">
              {passengers.map((p, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4 relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">{t("Pasagjeri")} {i + 1}</span>
                    {i > 0 && (
                      <button type="button" onClick={() => setPassengers(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t("Lloji")}</label>
                      <select value={p.type} onChange={e => updatePassenger(i, "type", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="adult">{t("I Rritur")}</option>
                        <option value="child">{t("Fëmijë")}</option>
                        <option value="infant">{t("Foshnjë")}</option>
                      </select>
                    </div>
                    <div>
                      <label id={`gender-label-${i}`} className="block text-xs font-medium text-gray-500 mb-1">{t("Gjinia")} *</label>
                      {airline ? <div className="air-gender-options" role="radiogroup" aria-labelledby={`gender-label-${i}`} aria-required="true">
                        {(["M", "F"] as const).map(gender => <label key={gender} className={`air-gender-choice ${p.gender === gender ? "is-selected" : ""}`}>
                          <input type="radio" name={`passenger-gender-${i}`} value={gender} required checked={p.gender === gender} onChange={() => updatePassenger(i, "gender", gender)} />
                          <span>{gender === "M" ? t("Mashkull") : t("Femër")}</span>
                        </label>)}
                      </div> : <select required value={p.gender} onChange={e => updatePassenger(i, "gender", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">{t("Zgjidh")}</option>
                        <option value="M">{t("Mashkull")}</option>
                        <option value="F">{t("Femër")}</option>
                      </select>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t("Emri")} *</label>
                      <input required value={p.firstName} onChange={e => updatePassenger(i, "firstName", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t("Mbiemri")} *</label>
                      <input required value={p.lastName} onChange={e => updatePassenger(i, "lastName", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t("Nr. Pasaportës")}</label>
                      <input value={p.passportNumber} onChange={e => updatePassenger(i, "passportNumber", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t("Kombësia")}</label>
                      <input value={p.nationality} onChange={e => updatePassenger(i, "nationality", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    {(p.type === "child" || p.type === "infant") && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {t("Datëlindja")} <span className="text-red-500">*</span>
                      </label>
                      <input type="date" value={p.dateOfBirth} onChange={e => updatePassenger(i, "dateOfBirth", e.target.value)}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${!p.dateOfBirth ? "border-red-400" : "border-gray-200"}`} />
                    </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
                    {flight?.checkedBaggagePrice && (
                      <label className={airline ? `air-baggage-option ${p.baggageOption === "checked" ? "is-selected" : ""}` : "flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer"}>
                        <input type="checkbox" checked={p.baggageOption === "checked"} onChange={e => updatePassenger(i, "baggageOption", e.target.checked ? "checked" : "")} className="rounded" />
                        {airline && <Luggage aria-hidden="true" />}
                        <span>{t("Bagazh i Regjistruar")} (+€{fmtM(flight.checkedBaggagePrice)})</span>
                      </label>
                    )}
                    {flight?.seatSelectionPrice && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={p.hasSeatSelection} onChange={e => updatePassenger(i, "hasSeatSelection", e.target.checked)} className="rounded" />
                        {t("Zgjedhje Vendi")} (+€{fmtM(flight.seatSelectionPrice)})
                      </label>
                    )}
                    {!airline && flight?.priorityBoardingPrice && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={p.hasPriorityBoarding} onChange={e => updatePassenger(i, "hasPriorityBoarding", e.target.checked)} className="rounded" />
                        {t("Hipje me Përparësi")} (+€{fmtM(flight.priorityBoardingPrice)})
                      </label>
                    )}
                    {flight?.insurancePrice && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={p.hasInsurance} onChange={e => updatePassenger(i, "hasInsurance", e.target.checked)} className="rounded" />
                        {t("Sigurim")} (+€{fmtM(flight.insurancePrice)})
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div>
          {airline && flightSummary}
          <div className={`${airline ? "air-fare-summary" : ""} bg-white border border-gray-200 rounded-2xl p-5 shadow-sm sticky top-4`}>
            <h2 className="font-semibold text-gray-900 mb-4">{t("Përmbledhja e Çmimit")}</h2>
            <div className="space-y-2 text-sm">
              {airline ? (["adult", "child", "infant"] as const).map(type => {
                const group = totals.ticketGroups[type];
                if (!group.count) return null;
                return <div key={type} className="flex justify-between gap-3 text-gray-600">
                  <span>{group.count} × {type === "adult" ? t("I Rritur") : type === "child" ? t("Fëmijë") : t("Foshnjë")}</span>
                  <span className="font-semibold tabular-nums">€{fmtM(group.amount)}</span>
                </div>;
              }) : <div className="flex justify-between text-gray-600">
                <span>{t("Bileta")} ×{passengers.length}</span>
                <span>€{fmtM(totals.ticket)}</span>
              </div>}
              {totals.tax > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("Taksa & Tarifa")}</span>
                  <span>€{fmtM(totals.tax)}</span>
                </div>
              )}
              {totals.extras > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("Shërbime Shtesë")}</span>
                  <span>€{fmtM(totals.extras)}</span>
                </div>
              )}
              {totals.fd && totals.flightSavings > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>{t("Zbritje fluturimi")} ({totals.fd.type === "percent" ? `−${totals.fd.value}%` : `−€${fmtM(totals.fd.value)}`})</span>
                  <span>−€{fmtM(totals.flightSavings)}</span>
                </div>
              )}
              {!totals.fd && totals.savings > 0 && (
                <div className="flex justify-between text-green-600 font-medium">
                  <span>{t("Kursim")}</span>
                  <span>−€{fmtM(totals.savings)}</span>
                </div>
              )}
              <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900 text-base">
                <span>{t("Gjithsej")}</span>
                <span className="text-blue-600">€{fmtM(totals.total)}</span>
              </div>
            </div>
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}
            {!user ? (
              <Link
                href={`/login?redirect=/flights/${flightId}`}
                onClick={() => {
                  localStorage.setItem("bookflight_draft", JSON.stringify({ flightId, passengers, customerEmail, customerPhone, notes }));
                  localStorage.setItem("bookflight_redirect", "/flights/" + flightId);
                }}
                className="w-full mt-4 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" }}
              >
                {t("Hyr për të Rezervuar")}
              </Link>
            ) : (
              <div className="mt-4 space-y-2.5">
                <button
                  type="submit"
                  onClick={() => { actionRef.current = "confirm"; }}
                  disabled={submitting}
                  className="w-full disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5"
                  style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" }}
                >
                  {submitting && submitAction === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting && submitAction === "confirm" ? t("Duke procesuar...") : t("Konfirmo Rezervimin")}
                </button>
                <button
                  type="submit"
                  onClick={() => { actionRef.current = "pay"; }}
                  disabled={submitting}
                  className="w-full disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
                >
                  {submitting && submitAction === "pay" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {submitting && submitAction === "pay" ? t("Duke procesuar...") : "Pay and Book"}
                </button>
              </div>
            )}
            {!user && (
              <p className="text-center text-xs text-gray-400 mt-2">
                <Link href={`/login?redirect=/flights/${flightId}`} onClick={() => { localStorage.setItem("bookflight_draft", JSON.stringify({ flightId, passengers, customerEmail, customerPhone, notes })); localStorage.setItem("bookflight_redirect", "/flights/" + flightId); }} className="text-blue-600 underline">{t("Hyr")}</Link> {t("ose")} <Link href={`/register?redirect=${encodeURIComponent("/flights/" + flightId)}`} onClick={() => { localStorage.setItem("bookflight_draft", JSON.stringify({ flightId, passengers, customerEmail, customerPhone, notes })); localStorage.setItem("bookflight_redirect", "/flights/" + flightId); }} className="text-blue-600 underline">{t("Regjistrohu")}</Link> {t("së pari")}
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
