import './_group.css';
import { useState } from "react";
import {
  Plane, PlaneTakeoff, PlaneLanding, History, X, Clock, RefreshCw, Globe,
} from "lucide-react";

/* ─── V1 "Cockpit Pro" — dense operations console.
   Fixed command strip (route / status / save), body = precise
   multi-column grid of flat compact panels. Zero scroll ambition,
   big numbers / small labels, single restrained cyan-slate accent. */

const bookings = [
  { ref: "KTF4493", status: "ticketed", name: "TRAVEL SHOP", amount: 170 },
  { ref: "KTF4471", status: "confirmed", name: "ARDIT HOXHA", amount: 180 },
  { ref: "KTF4462", status: "draft", name: "ONLINE TRAVEL", amount: 175 },
];

const bkDot: Record<string, string> = {
  ticketed: "bg-emerald-500",
  confirmed: "bg-sky-500",
  draft: "bg-slate-400",
};

function Panel({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-slate-200 bg-white ${className}`}>
      <header className="flex items-center justify-between px-3 h-8 border-b border-slate-100 bg-slate-50/70">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{title}</span>
        {right}
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

function Field({ label, value, unit, disabled = false, hint }: { label: string; value: string | number; unit?: string; disabled?: boolean; hint?: string }) {
  return (
    <div className={`flex items-center justify-between gap-2 py-[5px] border-b border-dotted border-slate-200 last:border-0 ${disabled ? "opacity-60" : ""}`}>
      <span className="text-[12px] text-slate-500">
        {label}
        {hint && <span className="text-[9px] uppercase tracking-wide text-slate-400"> {hint}</span>}
      </span>
      <span className="flex items-baseline gap-1 tabular-nums">
        <input readOnly value={value} className="w-14 bg-transparent outline-none text-right text-[14px] font-bold text-slate-800 font-mono" />
        {unit && <span className="text-[10px] text-slate-400 w-8">{unit}</span>}
      </span>
    </div>
  );
}

function Toggle({ on, onClick, tone, label, desc }: { on: boolean; onClick: () => void; tone: string; label: React.ReactNode; desc?: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none py-1" onClick={onClick}>
      <span className={`mt-0.5 w-8 h-4.5 h-[18px] rounded-full flex items-center px-0.5 transition-colors shrink-0 ${on ? tone : "bg-slate-300"}`}>
        <span className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[14px]" : ""}`} />
      </span>
      <span className="min-w-0">
        <span className="text-[12px] font-semibold text-slate-700 leading-tight block">{label}</span>
        {desc && <span className="text-[10.5px] text-slate-400 leading-snug block mt-0.5">{desc}</span>}
      </span>
    </label>
  );
}

export function CockpitPro() {
  const [excluded, setExcluded] = useState(true);
  const [confirmed, setConfirmed] = useState(true);
  const [blocked, setBlocked] = useState(false);

  return (
    <div className="flight-edit-mock min-h-screen bg-slate-900 flex items-start justify-center p-3" style={{ fontFeatureSettings: "'tnum'" }}>
      <div className="w-[1240px] max-w-[98vw] bg-slate-100 shadow-2xl flex flex-col overflow-hidden rounded-lg border border-slate-700">

        {/* ── COMMAND STRIP ── */}
        <div className="bg-slate-900 text-white px-4 h-14 flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono font-extrabold text-xl tracking-tight">TIA</span>
              <Plane className="h-3.5 w-3.5 text-cyan-400 rotate-90 self-center" />
              <span className="font-mono font-extrabold text-xl tracking-tight">BGY</span>
            </div>
            <span className="font-mono text-[11px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded px-1.5 py-0.5">#6632</span>
            <span className="font-mono text-[11px] text-slate-300 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">W45019</span>
            <span className="text-[12px] text-slate-400 hidden lg:block">Sunday, August 23, 2026</span>
          </div>
          <div className="flex-1" />
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider">Open</span>
          <button className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 px-2.5 py-1.5 rounded border border-white/15 hover:bg-white/5"><History className="h-3.5 w-3.5" />Historiku</button>
          <button className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-[13px] font-bold rounded px-5 py-2">Ruaj Ndryshimet</button>
          <button className="p-1.5 rounded text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        {/* ── BODY: 3-column console grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-slate-200 flex-1">

          {/* COL 1 — flight & inventory */}
          <div className="bg-slate-100 p-2 space-y-2">
            <Panel title="Fluturimi">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1"><PlaneTakeoff className="h-3.5 w-3.5 text-cyan-600" /><span className="text-[10px] uppercase tracking-wider">Nisja</span></div>
                  <input readOnly value="19:05" className="font-mono font-extrabold text-[28px] leading-none text-slate-900 w-full bg-transparent outline-none" />
                  <p className="font-mono text-[11px] text-slate-500 mt-1">TIA · 23/08/2026</p>
                </div>
                <div className="flex flex-col items-center gap-1 px-1">
                  <span className="text-[9px] text-slate-400 uppercase">1h 55m</span>
                  <div className="w-12 h-px bg-slate-300 relative"><Plane className="h-3 w-3 text-cyan-600 rotate-90 absolute -top-1.5 left-1/2 -translate-x-1/2 bg-white" /></div>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1.5 text-slate-400 mb-1"><span className="text-[10px] uppercase tracking-wider">Mbërritja</span><PlaneLanding className="h-3.5 w-3.5 text-cyan-600" /></div>
                  <input readOnly value="21:00" className="font-mono font-extrabold text-[28px] leading-none text-slate-900 w-full bg-transparent outline-none text-right" />
                  <p className="font-mono text-[11px] text-slate-500 mt-1">BGY · 23/08/2026</p>
                </div>
              </div>
            </Panel>

            <Panel title="Operatori i Fluturimit">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded bg-slate-900 text-cyan-400 flex items-center justify-center font-mono font-extrabold">W</div>
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <div className="col-span-1"><p className="text-[9px] uppercase tracking-wider text-slate-400">Linja ajrore</p><p className="text-[13px] font-bold text-slate-800">WIZZ AIR</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-slate-400">Nga</p><p className="text-[13px] font-bold font-mono text-slate-800">TIA</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-slate-400">Deri</p><p className="text-[13px] font-bold font-mono text-slate-800">BGY</p></div>
                </div>
              </div>
            </Panel>

            <Panel
              title="Volumi i Biletave"
              right={<button className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600"><History className="h-3 w-3" />Historiku</button>}
            >
              <div className="grid grid-cols-3 divide-x divide-slate-200 text-center">
                <div className="pr-2">
                  <p className="text-[10px] uppercase tracking-wider text-cyan-700 font-bold mb-1">Available</p>
                  <div className="flex items-center justify-center gap-1.5">
                    <button className="w-6 h-6 border border-slate-300 text-slate-500 font-mono leading-none hover:bg-slate-50">−</button>
                    <span className="font-mono font-extrabold text-[26px] text-slate-900 w-9">5</span>
                    <button className="w-6 h-6 border border-slate-300 text-slate-500 font-mono leading-none hover:bg-slate-50">+</button>
                  </div>
                </div>
                <div className="px-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Sold</p>
                  <p className="font-mono font-extrabold text-[26px] text-slate-900">17</p>
                </div>
                <div className="pl-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Total</p>
                  <p className="font-mono font-extrabold text-[26px] text-slate-900">22</p>
                </div>
              </div>
              <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden flex">
                <div className="bg-slate-800" style={{ width: `${(17 / 22) * 100}%` }} />
                <div className="bg-cyan-500" style={{ width: `${(5 / 22) * 100}%` }} />
              </div>
              <p className="text-[9.5px] text-slate-400 mt-1 font-mono">17 sold / 5 free · 77.3% load</p>
            </Panel>

            <Panel title="Statusi i fluturimit">
              <select className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-[12px] bg-white font-semibold text-slate-800 mb-1.5" defaultValue="open">
                <option value="open">Open — Hapur për rezervime</option>
                <option value="closed">Closed — Pezull</option>
                <option value="soldout">Sold Out — I shitur plotësisht</option>
              </select>
              <Toggle
                on={confirmed} onClick={() => setConfirmed(v => !v)} tone="bg-amber-500"
                label={<><span className="inline-flex items-center justify-center bg-black rounded w-4 h-4 text-[10px] leading-none align-text-bottom mr-1">⭐</span>Fluturim i Konfirmuar</>}
              />
              <Toggle
                on={blocked} onClick={() => setBlocked(v => !v)} tone="bg-orange-500"
                label="🔒 Blloko shitjet e jashtme"
                desc="Faqja publike, API e partnerëve dhe kanalet e jashtme e shohin fluturimin të mbyllur / pa vende. Rezervimet nga sistemi i brendshëm vazhdojnë normalisht."
              />
            </Panel>
          </div>

          {/* COL 2 — money */}
          <div className="bg-slate-100 p-2 space-y-2">
            <Panel
              title="Çmimet"
              right={<button className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600"><History className="h-3 w-3" />Historiku</button>}
            >
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-slate-400">Çmimi Adult (one-way)</p>
                  <p className="font-mono font-extrabold text-[24px] text-slate-900 leading-tight">180<span className="text-[12px] text-slate-400 font-bold"> €</span></p>
                </div>
                <div className="border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-slate-400">Çmimi Neto <span className="normal-case">(informativ)</span></p>
                  <p className="font-mono font-extrabold text-[24px] text-slate-900 leading-tight">150<span className="text-[12px] text-slate-400 font-bold"> €</span></p>
                </div>
              </div>
              <Field label="Çmimi Fëmijë" hint="(= Adult)" value={180} unit="€" disabled />
              <Field label="Çmimi Infant" value={35} unit="€" />
              <Field label="Taksa" value={0} unit="€" />
            </Panel>

            <Panel title="Çmimi i Google (Admin)" right={<Globe className="h-3.5 w-3.5 text-cyan-600" />}>
              <button className="w-full text-[12px] font-semibold text-cyan-800 border border-cyan-300 bg-cyan-50 rounded py-1.5 flex items-center justify-center gap-1.5 hover:bg-cyan-100">
                <RefreshCw className="h-3 w-3" />Kontrollo çmimin live nga Google
              </button>
              <div className="mt-2 border-t border-dotted border-slate-200 pt-2">
                <Toggle
                  on={excluded} onClick={() => setExcluded(v => !v)} tone="bg-rose-500"
                  label="Përjashto nga rregulli i çmimit të Google"
                  desc="Kur aktivizohet, çmimi i këtij fluturimi nuk ndryshohet automatikisht nga Google. Çmimi që vendos me dorë mbetet i pandryshuar."
                />
              </div>
            </Panel>

            <Panel title="Bagazhi i Kontrolluar">
              <Field label="Numri i çantave" value={1} unit="çanta" />
              <Field label="Kilogramët" value={20} unit="kg" />
              <Field label="Çmimi" value={60} unit="€" />
              <p className="text-[10px] text-slate-400 mt-1.5">Vendos numrin dhe kg për të dërguar bagazhin.</p>
            </Panel>

            <Panel title="Sales Ending" right={<Clock className="h-3.5 w-3.5 text-orange-500" />}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-500">Mbyllet para nisjes <span className="text-orange-600 font-bold">*</span></span>
                <span className="flex items-baseline gap-1">
                  <input readOnly value="13" className="font-mono font-extrabold text-[22px] text-slate-900 w-10 text-right bg-transparent outline-none" />
                  <span className="text-[11px] text-slate-400">orë</span>
                </span>
              </div>
              <p className="text-[10.5px] text-amber-700 font-medium mt-1.5 leading-snug">⭐ Fluturim i konfirmuar — vlen rregulli i konfirmuar (4 orë), jo kjo fushë · mbyllet <strong>Sunday, August 23, 2026 ora 3:05 PM</strong></p>
              <div className="mt-2 flex items-start gap-2 border-l-2 border-amber-500 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Shitja mbyllet — <strong>Sunday, August 23, 2026 ora 3:05 PM</strong> <span className="opacity-70">(ora e Shqipërisë)</span></span>
              </div>
              <button className="mt-2 w-full text-[12px] py-1.5 border border-slate-300 text-slate-400 rounded cursor-not-allowed bg-slate-50">Mbyll shitjet ×</button>
              <p className="text-[10px] text-slate-400 text-center mt-1">Fluturimet me rezervime nuk mund të ndryshohen</p>
            </Panel>
          </div>

          {/* COL 3 — bookings ledger */}
          <div className="bg-slate-100 p-2 space-y-2 flex flex-col">
            <Panel title="Rezervimet (9)" right={<span className="text-[10px] font-semibold text-cyan-700 cursor-pointer">Shih të gjitha</span>} className="flex-1">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] uppercase tracking-wider text-slate-400">
                    <th className="pb-1.5 font-bold">Ref</th>
                    <th className="pb-1.5 font-bold">Klienti</th>
                    <th className="pb-1.5 font-bold text-right">Shuma</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {bookings.map(b => (
                    <tr key={b.ref} className="border-t border-slate-100">
                      <td className="py-2 pr-2">
                        <span className="font-mono text-[11px] font-bold text-slate-800 block">{b.ref}</span>
                        <span className="flex items-center gap-1 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${bkDot[b.status]}`} />
                          <span className="text-[9.5px] text-slate-400 uppercase tracking-wide">{b.status}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-[11.5px] text-slate-600 font-medium">{b.name}</td>
                      <td className="py-2 text-right font-mono font-bold text-[13px] text-slate-900">${b.amount}.00</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 border-t border-slate-100 pt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>3 / 9 të shfaqura</span>
                <span>Σ $525.00</span>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
