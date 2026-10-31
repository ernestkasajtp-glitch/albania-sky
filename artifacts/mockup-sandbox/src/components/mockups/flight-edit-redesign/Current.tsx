import './_group.css';
import { useState } from "react";
import {
  Plane, PlaneTakeoff, PlaneLanding, History, X, Clock, Calendar, RefreshCw, Globe,
} from "lucide-react";

/* ─── Static replica of the current FlightSidePanel (flight-system) ───
   Mock data mirrors the screenshot: TIA → BGY #6632, W45019, 23/08/2026. */

const bookings = [
  { ref: "KTF4493", status: "ticketed", name: "TRAVEL SHOP", amount: 170 },
  { ref: "KTF4471", status: "confirmed", name: "ARDIT HOXHA", amount: 180 },
  { ref: "KTF4462", status: "draft", name: "ONLINE TRAVEL", amount: 175 },
];

const bkStatusStyle: Record<string, string> = {
  ticketed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  draft: "bg-slate-50 text-slate-600 border-slate-200",
};

function PriceRow({ label, hint, value, unit = "€", disabled = false }: { label: string; hint?: string; value: string | number; unit?: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}{hint && <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60"> {hint}</span>}</span>
      <div className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-muted/30 w-32 ${disabled ? "opacity-70" : ""}`}>
        <span className="text-muted-foreground">→</span>
        <input readOnly value={value} className="bg-transparent outline-none text-sm font-semibold w-full text-right" />
        <span className="text-muted-foreground text-xs">{unit}</span>
      </div>
    </div>
  );
}

function Check({ on, color }: { on: boolean; color: string }) {
  return (
    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${on ? color : "bg-white border-slate-300"}`}>
      {on && <span className="text-white text-xs font-bold leading-none">✓</span>}
    </div>
  );
}

export function Current() {
  const [excluded, setExcluded] = useState(true);
  const [confirmed, setConfirmed] = useState(true);
  const [blocked, setBlocked] = useState(false);

  return (
    <div className="flight-edit-mock min-h-screen bg-slate-400/60 flex items-start justify-center p-4">
      <div className="w-[960px] max-w-[95vw] bg-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2.5 border-b bg-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-lg leading-tight flex items-center gap-2">
                TIA → BGY
                <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5">#6632</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">Sunday, August 23, 2026</p>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded-lg border border-dashed border-slate-300"><History className="h-3.5 w-3.5" />Historiku</button>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-green-50 text-green-700 border-green-200">Open</span>
              <button className="p-1 rounded text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        {/* Body — 2 columns */}
        <div className="flex-1 p-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
            {/* LEFT */}
            <div className="space-y-2 min-w-0">
              {/* Timing */}
              <div className="bg-white rounded-xl border shadow-sm px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center"><PlaneTakeoff className="h-4 w-4 text-blue-600" /></div>
                    <span className="font-semibold text-xs text-slate-700">TIA</span>
                    <input readOnly value="19:05" className="w-full text-center text-sm font-mono border border-dashed border-slate-300 rounded px-1 py-0.5 bg-transparent" />
                    <div className="h-7 text-[11px] border border-dashed border-slate-300 rounded w-full flex items-center justify-center gap-1 text-slate-600"><Calendar className="h-3 w-3" />23 / 08 / 2026</div>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0 px-1">
                    <div className="h-px w-7 bg-slate-200" />
                    <span className="font-mono text-[11px] font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded w-20 text-center">W45019</span>
                    <Plane className="h-3 w-3 text-blue-400 rotate-90" />
                    <div className="h-px w-7 bg-slate-200" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                    <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center"><PlaneLanding className="h-4 w-4 text-purple-600" /></div>
                    <span className="font-semibold text-xs text-slate-700">BGY</span>
                    <input readOnly value="21:00" className="w-full text-center text-sm font-mono border border-dashed border-slate-300 rounded px-1 py-0.5 bg-transparent" />
                    <div className="h-7 text-[11px] border border-dashed border-slate-300 rounded w-full flex items-center justify-center gap-1 text-slate-600"><Calendar className="h-3 w-3" />23 / 08 / 2026</div>
                  </div>
                </div>
              </div>

              {/* Operator */}
              <div className="bg-white rounded-xl border shadow-sm px-3 py-2.5 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Operatori i Fluturimit</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">W</div>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div><p className="text-[10px] text-muted-foreground mb-0.5">Linja ajrore</p><p className="font-medium text-sm border-b border-dashed border-muted-foreground/40">WIZZ AIR</p></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-[10px] text-muted-foreground mb-0.5">Nga</p><p className="font-medium text-sm border-b border-dashed border-muted-foreground/40">TIA</p></div>
                      <div><p className="text-[10px] text-muted-foreground mb-0.5">Deri</p><p className="font-medium text-sm border-b border-dashed border-muted-foreground/40">BGY</p></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Toggle sales */}
              <div className="bg-white rounded-xl border shadow-sm px-3 py-2">
                <button className="w-full text-center text-sm py-2 rounded-lg border text-muted-foreground border-muted cursor-not-allowed">Mbyll shitjet ×</button>
                <p className="text-xs text-muted-foreground text-center mt-1">Fluturimet me rezervime nuk mund të ndryshohen</p>
              </div>

              {/* Sales ending */}
              <div className="bg-white rounded-xl border shadow-sm px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-orange-500" /><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales Ending</p></div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Mbyllet para nisjes <span className="text-orange-600 font-semibold">*</span></span>
                  <div className="flex items-center gap-1"><input readOnly value="13" className="font-semibold text-sm w-16 text-right border-b border-dashed border-muted-foreground/40 bg-transparent" /><span className="text-sm text-muted-foreground">orë</span></div>
                </div>
                <p className="text-[11px] text-amber-600 font-medium">⭐ Fluturim i konfirmuar — vlen rregulli i konfirmuar (4 orë), jo kjo fushë · mbyllet <strong>Sunday, August 23, 2026 ora 3:05 PM</strong></p>
                <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs border bg-amber-50 border-amber-200 text-amber-700">
                  <Clock className="h-3.5 w-3.5 mt-0.5" />
                  <span>Shitja mbyllet — <strong>Sunday, August 23, 2026 ora 3:05 PM</strong> <span className="opacity-70">(ora e Shqipërisë)</span></span>
                </div>
              </div>

              {/* Seats */}
              <div className="bg-white rounded-xl border shadow-sm px-3 py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Volumi i Biletave</p>
                  <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded-lg"><History className="h-3.5 w-3.5" />Historiku</button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1.5">Available</p>
                    <div className="flex items-center justify-center gap-1">
                      <button className="w-6 h-6 rounded border text-muted-foreground text-sm leading-none">−</button>
                      <span className="font-bold text-xl w-8 text-center">5</span>
                      <button className="w-6 h-6 rounded border text-muted-foreground text-sm leading-none">+</button>
                    </div>
                    <div className="h-0.5 bg-blue-600 mt-2 mx-2 rounded" />
                  </div>
                  <div className="text-center"><p className="text-xs text-muted-foreground mb-1.5">Sold</p><p className="font-bold text-xl">17</p><div className="h-0.5 bg-muted mt-2 mx-2 rounded" /></div>
                  <div className="text-center"><p className="text-xs text-muted-foreground mb-1.5">Total</p><p className="font-bold text-xl">22</p><div className="h-0.5 bg-muted mt-2 mx-2 rounded" /></div>
                </div>
              </div>
            </div>

            {/* RIGHT */}
            <div className="space-y-2 min-w-0">
              {/* Prices */}
              <div className="bg-white rounded-xl border shadow-sm px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Çmimet</p>
                  <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded-lg"><History className="h-3.5 w-3.5" />Historiku</button>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-blue-700"><span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />ÇMIMI I GOOGLE (ADMIN)</span><RefreshCw className="h-3.5 w-3.5" /></div>
                  <button className="w-full text-xs text-blue-700 border border-blue-300 rounded-lg py-1.5 flex items-center justify-center gap-1.5 bg-white"><RefreshCw className="h-3 w-3" />Kontrollo çmimin live nga Google</button>
                </div>
                <div className="space-y-2">
                  <PriceRow label="Çmimi Adult (one-way)" value={180} />
                  <PriceRow label="Çmimi Fëmijë" hint="(= Adult)" value={180} disabled />
                  <PriceRow label="Çmimi Infant" value={35} />
                  <PriceRow label="Taksa" value={0} />
                  <PriceRow label="Çmimi Neto" hint="(informativ)" value={150} />
                </div>
              </div>

              {/* Google exclusion */}
              <div className="bg-white rounded-xl border shadow-sm px-3 py-2.5">
                <label className="flex items-start gap-3 cursor-pointer select-none" onClick={() => setExcluded(v => !v)}>
                  <Check on={excluded} color="bg-rose-500 border-rose-600" />
                  <div>
                    <span className="text-sm font-medium">Përjashto nga rregulli i çmimit të Google</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Kur aktivizohet, çmimi i këtij fluturimi nuk ndryshohet automatikisht nga Google. Çmimi që vendos me dorë mbetet i pandryshuar.</p>
                  </div>
                </label>
              </div>

              {/* Baggage */}
              <div className="bg-white rounded-xl border shadow-sm px-3 py-2.5 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bagazhi i Kontrolluar</p>
                <div className="space-y-2">
                  <PriceRow label="Numri i çantave" value={1} unit="çanta" />
                  <PriceRow label="Kilogramët" value={20} unit="kg" />
                  <PriceRow label="Çmimi" value={60} />
                </div>
                <p className="text-[11px] text-muted-foreground/70">Vendos numrin dhe kg për të dërguar bagazhin.</p>
              </div>

              {/* Status */}
              <div className="bg-white rounded-xl border shadow-sm px-3 py-2.5 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statusi i fluturimit</p>
                <select className="w-full border rounded-lg px-3 py-2 text-sm bg-white" defaultValue="open">
                  <option value="open">Open — Hapur për rezervime</option>
                  <option value="closed">Closed — Pezull</option>
                  <option value="soldout">Sold Out — I shitur plotësisht</option>
                </select>
                <label className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setConfirmed(v => !v)}>
                  <Check on={confirmed} color="bg-amber-400 border-amber-500" />
                  <span className="text-sm font-medium flex items-center gap-1.5"><span className="inline-flex items-center justify-center bg-black rounded w-4 h-4 text-xs leading-none">⭐</span> Fluturim i Konfirmuar</span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer select-none" onClick={() => setBlocked(v => !v)}>
                  <Check on={blocked} color="bg-orange-500 border-orange-600" />
                  <div>
                    <span className="text-sm font-medium">🔒 Blloko shitjet e jashtme</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Faqja publike, API e partnerëve dhe kanalet e jashtme e shohin fluturimin të mbyllur / pa vende. Rezervimet nga sistemi i brendshëm vazhdojnë normalisht.</p>
                  </div>
                </label>
              </div>

              {/* Bookings */}
              <div className="bg-white rounded-xl border shadow-sm px-3 py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rezervimet (9)</p>
                  <span className="text-xs text-blue-600">Shih të gjitha</span>
                </div>
                <div className="space-y-2">
                  {bookings.map(b => (
                    <div key={b.ref} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-blue-600">{b.ref}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${bkStatusStyle[b.status]}`}>{b.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{b.name}</p>
                      </div>
                      <span className="font-semibold text-sm">${b.amount}.00</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-white">
          <button className="w-full bg-blue-600 text-white text-sm font-medium rounded-lg py-2.5">Ruaj Ndryshimet</button>
        </div>
      </div>
    </div>
  );
}
