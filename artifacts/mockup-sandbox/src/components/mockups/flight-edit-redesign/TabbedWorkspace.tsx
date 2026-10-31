import './_group.css';
import { useState } from "react";
import {
  Plane, PlaneTakeoff, PlaneLanding, History, X, Clock, Calendar, RefreshCw, Globe,
  Armchair, Euro, ListChecks, Luggage,
} from "lucide-react";

/* ─── V4 "Tabbed Workspace" ───
   Persistent left rail = flight identity + live vitals.
   Right side = three tabs, one concern at a time. */

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

type TabId = "orari" | "cmimet" | "statusi";

const tabs: { id: TabId; label: string; icon: any }[] = [
  { id: "orari", label: "Orari & Operatori", icon: Plane },
  { id: "cmimet", label: "Çmimet & Bagazhi", icon: Euro },
  { id: "statusi", label: "Statusi & Rezervimet", icon: ListChecks },
];

function Field({ label, value, unit, disabled, hint }: { label: string; value: string | number; unit?: string; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">
        {label}
        {hint && <span className="text-[10px] uppercase tracking-wide text-slate-400 ml-1">{hint}</span>}
      </span>
      <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-slate-50 border border-slate-200 w-32 ${disabled ? "opacity-60" : ""}`}>
        <input readOnly value={value} className="bg-transparent outline-none text-sm font-semibold w-full text-right text-slate-800" />
        {unit && <span className="text-slate-400 text-xs shrink-0">{unit}</span>}
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">{children}</p>;
}

export function TabbedWorkspace() {
  const [tab, setTab] = useState<TabId>("orari");
  const [excluded, setExcluded] = useState(true);
  const [confirmed, setConfirmed] = useState(true);
  const [blocked, setBlocked] = useState(false);

  return (
    <div className="flight-edit-mock min-h-screen bg-[#0f1f33] flex items-start justify-center p-6" style={{ backgroundImage: "radial-gradient(circle at 20% 0%, #1a3352 0%, #0f1f33 55%)" }}>
      <div className="w-[1060px] max-w-[96vw] rounded-2xl shadow-2xl overflow-hidden flex flex-col bg-white">
        <div className="flex flex-1 min-h-[620px]">

          {/* ───── LEFT RAIL ───── */}
          <aside className="w-[300px] shrink-0 bg-[#122a45] text-white flex flex-col">
            {/* Identity */}
            <div className="px-5 pt-5 pb-4 border-b border-white/10">
              <div className="flex items-start justify-between">
                <span className="font-mono text-[11px] font-semibold text-sky-300/80 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5">#6632</span>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-300/30">Open</span>
              </div>
              <h2 className="font-extrabold text-[26px] tracking-tight mt-3 flex items-center gap-2">
                TIA <Plane className="h-4 w-4 text-sky-400 rotate-90" /> BGY
              </h2>
              <p className="text-[13px] text-slate-300/80 mt-1 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Sunday, August 23, 2026</p>
              <div className="flex items-center gap-3 mt-2 text-[13px] text-slate-300/90">
                <span className="font-mono font-bold text-sky-300">W45019</span>
                <span className="text-white/30">·</span>
                <span>WIZZ AIR</span>
                <span className="text-white/30">·</span>
                <span className="font-mono">19:05 → 21:00</span>
              </div>
            </div>

            {/* Live vitals */}
            <div className="px-5 py-4 space-y-4 border-b border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Gjendja live</p>

              {/* Seats */}
              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-1.5 text-slate-300"><Armchair className="h-3.5 w-3.5 text-sky-400" />Vende</span>
                  <span className="font-mono font-bold text-white">17<span className="text-slate-400 font-medium"> / 22</span></span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: `${(17 / 22) * 100}%` }} />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">5 të lira · 17 të shitura</p>
              </div>

              {/* Price */}
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-1.5 text-slate-300"><Euro className="h-3.5 w-3.5 text-sky-400" />Adult</span>
                <span className="font-mono font-bold text-white">180 €<span className="text-slate-400 font-medium text-[11px]"> · neto 150</span></span>
              </div>

              {/* Closing */}
              <div className="rounded-lg bg-amber-400/10 border border-amber-300/25 px-3 py-2 text-[11px] text-amber-200 leading-relaxed">
                <span className="flex items-center gap-1.5 font-semibold text-amber-300 mb-0.5"><Clock className="h-3 w-3" />Shitja mbyllet</span>
                Sunday, August 23, 2026 ora 3:05 PM <span className="opacity-60">(ora e Shqipërisë)</span>
              </div>

              {/* Flags */}
              <div className="flex flex-wrap gap-1.5">
                {confirmed && <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-400/15 text-amber-300 border border-amber-300/25">⭐ I Konfirmuar</span>}
                {excluded && <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-rose-400/15 text-rose-300 border border-rose-300/25">Pa Google</span>}
                {blocked && <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-orange-400/15 text-orange-300 border border-orange-300/25">🔒 Të jashtme</span>}
              </div>
            </div>

            {/* Tab nav */}
            <nav className="px-3 py-4 space-y-1 flex-1">
              {tabs.map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`w-full flex items-center gap-2.5 text-left text-[13px] font-medium rounded-lg px-3 py-2.5 transition-colors ${active ? "bg-sky-500/20 text-white border border-sky-400/30" : "text-slate-300/80 hover:bg-white/5 border border-transparent"}`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-sky-300" : "text-slate-400"}`} />
                    {t.label}
                    {t.id === "statusi" && <span className="ml-auto text-[10px] font-mono bg-white/10 rounded px-1.5 py-0.5">9</span>}
                  </button>
                );
              })}
            </nav>

            <div className="px-5 pb-5">
              <button className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-slate-300/80 px-2 py-2 rounded-lg border border-dashed border-white/20 hover:bg-white/5">
                <History className="h-3.5 w-3.5" />Historiku
              </button>
            </div>
          </aside>

          {/* ───── RIGHT PANEL ───── */}
          <main className="flex-1 min-w-0 flex flex-col bg-slate-50">
            {/* Top bar */}
            <div className="px-6 py-3.5 border-b bg-white flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">{tabs.find(t => t.id === tab)!.label}</h3>
              <button className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-5 space-y-5">

              {/* ─── TAB 1: Orari & Operatori ─── */}
              {tab === "orari" && (
                <>
                  <div className="bg-white rounded-xl border shadow-sm p-5">
                    <SectionTitle>Orari i fluturimit</SectionTitle>
                    <div className="flex items-center gap-4 mt-4">
                      <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><PlaneTakeoff className="h-4.5 w-4.5 text-blue-600" /></div>
                        <span className="font-bold text-sm text-slate-800">TIA</span>
                        <input readOnly value="19:05" className="w-24 text-center text-lg font-mono font-bold border border-slate-200 rounded-lg px-2 py-1 bg-white" />
                        <div className="text-[12px] text-slate-500 flex items-center gap-1.5 border border-slate-200 rounded-lg bg-white px-2.5 py-1"><Calendar className="h-3 w-3" />23 / 08 / 2026</div>
                      </div>
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <span className="font-mono text-[12px] font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-lg">W45019</span>
                        <div className="flex items-center gap-1 text-slate-300"><div className="h-px w-6 bg-slate-300" /><Plane className="h-4 w-4 text-blue-400 rotate-90" /><div className="h-px w-6 bg-slate-300" /></div>
                        <span className="text-[11px] text-slate-400">1h 55m</span>
                      </div>
                      <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center"><PlaneLanding className="h-4.5 w-4.5 text-purple-600" /></div>
                        <span className="font-bold text-sm text-slate-800">BGY</span>
                        <input readOnly value="21:00" className="w-24 text-center text-lg font-mono font-bold border border-slate-200 rounded-lg px-2 py-1 bg-white" />
                        <div className="text-[12px] text-slate-500 flex items-center gap-1.5 border border-slate-200 rounded-lg bg-white px-2.5 py-1"><Calendar className="h-3 w-3" />23 / 08 / 2026</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border shadow-sm p-5">
                    <SectionTitle>Operatori i Fluturimit</SectionTitle>
                    <div className="flex items-center gap-4 mt-3">
                      <div className="w-11 h-11 rounded-xl bg-[#c6007e]/10 text-[#c6007e] flex items-center justify-center text-base font-extrabold">W</div>
                      <div className="flex-1 grid grid-cols-3 gap-4">
                        <div><p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Linja ajrore</p><p className="font-semibold text-sm text-slate-800">WIZZ AIR</p></div>
                        <div><p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Nga</p><p className="font-semibold text-sm text-slate-800">TIA</p></div>
                        <div><p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Deri</p><p className="font-semibold text-sm text-slate-800">BGY</p></div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3"><Clock className="h-4 w-4 text-orange-500" /><SectionTitle>Sales Ending</SectionTitle></div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-500">Mbyllet para nisjes <span className="text-orange-600 font-semibold">*</span></span>
                      <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-slate-50 border border-slate-200">
                        <input readOnly value="13" className="font-semibold text-sm w-10 text-right bg-transparent outline-none" /><span className="text-sm text-slate-400">orë</span>
                      </div>
                    </div>
                    <p className="text-[12px] text-amber-600 font-medium mt-3">⭐ Fluturim i konfirmuar — vlen rregulli i konfirmuar (4 orë), jo kjo fushë · mbyllet <strong>Sunday, August 23, 2026 ora 3:05 PM</strong></p>
                    <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs border bg-amber-50 border-amber-200 text-amber-700 mt-2">
                      <Clock className="h-3.5 w-3.5 mt-0.5" />
                      <span>Shitja mbyllet — <strong>Sunday, August 23, 2026 ora 3:05 PM</strong> <span className="opacity-70">(ora e Shqipërisë)</span></span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <button className="w-full text-center text-sm py-2.5 rounded-lg border border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50">Mbyll shitjet ×</button>
                      <p className="text-xs text-slate-400 text-center mt-1.5">Fluturimet me rezervime nuk mund të ndryshohen</p>
                    </div>
                  </div>
                </>
              )}

              {/* ─── TAB 2: Çmimet & Bagazhi ─── */}
              {tab === "cmimet" && (
                <>
                  <div className="bg-white rounded-xl border shadow-sm p-5">
                    <div className="flex items-center justify-between">
                      <SectionTitle>Çmimet</SectionTitle>
                      <button className="inline-flex items-center gap-1.5 text-xs text-slate-400 px-2 py-1 rounded-lg hover:bg-slate-50"><History className="h-3.5 w-3.5" />Historiku</button>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5 space-y-2 mt-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-blue-700"><span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />ÇMIMI I GOOGLE (ADMIN)</span><RefreshCw className="h-3.5 w-3.5" /></div>
                      <button className="w-full text-xs text-blue-700 border border-blue-300 rounded-lg py-1.5 flex items-center justify-center gap-1.5 bg-white"><RefreshCw className="h-3 w-3" />Kontrollo çmimin live nga Google</button>
                    </div>
                    <div className="mt-2">
                      <Field label="Çmimi Adult (one-way)" value={180} unit="€" />
                      <Field label="Çmimi Fëmijë" hint="(= Adult)" value={180} unit="€" disabled />
                      <Field label="Çmimi Infant" value={35} unit="€" />
                      <Field label="Taksa" value={0} unit="€" />
                      <Field label="Çmimi Neto" hint="(informativ)" value={150} unit="€" />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border shadow-sm p-5">
                    <label className="flex items-start gap-3 cursor-pointer select-none" onClick={() => setExcluded(v => !v)}>
                      <Check on={excluded} color="bg-rose-500 border-rose-600" />
                      <div>
                        <span className="text-sm font-medium text-slate-800">Përjashto nga rregulli i çmimit të Google</span>
                        <p className="text-xs text-slate-500 mt-0.5">Kur aktivizohet, çmimi i këtij fluturimi nuk ndryshohet automatikisht nga Google. Çmimi që vendos me dorë mbetet i pandryshuar.</p>
                      </div>
                    </label>
                  </div>

                  <div className="bg-white rounded-xl border shadow-sm p-5">
                    <div className="flex items-center gap-2"><Luggage className="h-4 w-4 text-sky-600" /><SectionTitle>Bagazhi i Kontrolluar</SectionTitle></div>
                    <div className="mt-2">
                      <Field label="Numri i çantave" value={1} unit="çanta" />
                      <Field label="Kilogramët" value={20} unit="kg" />
                      <Field label="Çmimi" value={60} unit="€" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">Vendos numrin dhe kg për të dërguar bagazhin.</p>
                  </div>
                </>
              )}

              {/* ─── TAB 3: Statusi & Rezervimet ─── */}
              {tab === "statusi" && (
                <>
                  <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
                    <SectionTitle>Statusi i fluturimit</SectionTitle>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white" defaultValue="open">
                      <option value="open">Open — Hapur për rezervime</option>
                      <option value="closed">Closed — Pezull</option>
                      <option value="soldout">Sold Out — I shitur plotësisht</option>
                    </select>
                    <label className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setConfirmed(v => !v)}>
                      <Check on={confirmed} color="bg-amber-400 border-amber-500" />
                      <span className="text-sm font-medium flex items-center gap-1.5 text-slate-800"><span className="inline-flex items-center justify-center bg-black rounded w-4 h-4 text-xs leading-none">⭐</span> Fluturim i Konfirmuar</span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer select-none" onClick={() => setBlocked(v => !v)}>
                      <Check on={blocked} color="bg-orange-500 border-orange-600" />
                      <div>
                        <span className="text-sm font-medium text-slate-800">🔒 Blloko shitjet e jashtme</span>
                        <p className="text-xs text-slate-500 mt-0.5">Faqja publike, API e partnerëve dhe kanalet e jashtme e shohin fluturimin të mbyllur / pa vende. Rezervimet nga sistemi i brendshëm vazhdojnë normalisht.</p>
                      </div>
                    </label>
                  </div>

                  <div className="bg-white rounded-xl border shadow-sm p-5">
                    <div className="flex items-center justify-between mb-2">
                      <SectionTitle>Volumi i Biletave</SectionTitle>
                      <button className="inline-flex items-center gap-1.5 text-xs text-slate-400 px-2 py-1 rounded-lg hover:bg-slate-50"><History className="h-3.5 w-3.5" />Historiku</button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div className="text-center rounded-xl border border-blue-200 bg-blue-50/40 py-3">
                        <p className="text-xs text-slate-500 mb-1.5">Available</p>
                        <div className="flex items-center justify-center gap-1.5">
                          <button className="w-7 h-7 rounded-lg border border-slate-300 bg-white text-slate-500 text-sm leading-none">−</button>
                          <span className="font-bold text-2xl w-9 text-center text-slate-800">5</span>
                          <button className="w-7 h-7 rounded-lg border border-slate-300 bg-white text-slate-500 text-sm leading-none">+</button>
                        </div>
                      </div>
                      <div className="text-center rounded-xl border border-slate-200 bg-slate-50/60 py-3"><p className="text-xs text-slate-500 mb-1.5">Sold</p><p className="font-bold text-2xl text-slate-800">17</p></div>
                      <div className="text-center rounded-xl border border-slate-200 bg-slate-50/60 py-3"><p className="text-xs text-slate-500 mb-1.5">Total</p><p className="font-bold text-2xl text-slate-800">22</p></div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border shadow-sm p-5">
                    <div className="flex items-center justify-between mb-2">
                      <SectionTitle>Rezervimet (9)</SectionTitle>
                      <span className="text-xs text-blue-600 font-medium cursor-pointer">Shih të gjitha</span>
                    </div>
                    <div>
                      {bookings.map(b => (
                        <div key={b.ref} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-blue-600">{b.ref}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${bkStatusStyle[b.status]}`}>{b.status}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{b.name}</p>
                          </div>
                          <span className="font-semibold text-sm text-slate-800">${b.amount}.00</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t bg-white">
              <button className="w-full bg-[#122a45] hover:bg-[#0f2238] text-white text-sm font-semibold rounded-lg py-2.5 shadow-sm">Ruaj Ndryshimet</button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
