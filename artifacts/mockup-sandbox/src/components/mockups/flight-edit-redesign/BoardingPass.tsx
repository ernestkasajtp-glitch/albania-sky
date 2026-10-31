import './_group.css';
import { useState } from "react";
import {
  Plane, History, X, Clock, RefreshCw, Globe, Minus, Plus, Luggage, Ticket, ShieldCheck,
} from "lucide-react";

/* ─── V3 "Boarding Pass" — the flight IS a ticket.
   Top: premium boarding-pass summary (route, times, W45019, seats, status).
   Below: editable stubs separated by perforation lines.
   STUB ORDER matches V1 CockpitPro columns:
     Stub 1 → Operator + Seats/Inventory  (V1 Col 1)
     Stub 2 → Prices/Google + Baggage/Sales Ending  (V1 Col 2)
     Stub 3 → Status + Bookings  (V1 Col 3) ─── */

const bookings = [
  { ref: "KTF4493", status: "ticketed", name: "TRAVEL SHOP", amount: 170 },
  { ref: "KTF4471", status: "confirmed", name: "ARDIT HOXHA", amount: 180 },
  { ref: "KTF4462", status: "draft", name: "ONLINE TRAVEL", amount: 175 },
];

const bkStatusStyle: Record<string, string> = {
  ticketed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  confirmed: "bg-sky-50 text-sky-700 border-sky-200",
  draft: "bg-stone-50 text-stone-500 border-stone-200",
};

/* Perforation divider — dashed line with notches on both sides */
function Perforation() {
  return (
    <div className="relative h-6 shrink-0">
      <div className="absolute left-3 right-3 top-1/2 border-t-2 border-dashed border-[#d8d2c4]" />
      <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#8a9bb8]" style={{ boxShadow: "inset -2px 0 3px rgba(0,0,0,0.08)" }} />
      <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#8a9bb8]" style={{ boxShadow: "inset 2px 0 3px rgba(0,0,0,0.08)" }} />
    </div>
  );
}

function StubTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8c7f5f] flex items-center gap-1.5">
      {icon}{children}
    </p>
  );
}

function Field({ label, value, unit, disabled = false }: { label: string; value: string | number; unit?: string; disabled?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">{label}</p>
      <div className={`flex items-baseline gap-1 border-b-2 border-[#e5dfd0] pb-1 ${disabled ? "opacity-60" : ""}`}>
        <input readOnly value={value} className="bg-transparent outline-none text-base font-bold text-stone-800 w-full font-mono" />
        {unit && <span className="text-xs text-stone-400 font-semibold shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, tone }: { on: boolean; onClick: () => void; tone: string }) {
  return (
    <button onClick={onClick} className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${on ? tone : "bg-stone-300"}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

export function BoardingPass() {
  const [excluded, setExcluded] = useState(true);
  const [confirmed, setConfirmed] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [available, setAvailable] = useState(5);
  const [availInput, setAvailInput] = useState("5");

  function changeAvail(delta: number) {
    const next = Math.max(0, available + delta);
    setAvailable(next);
    setAvailInput(String(next));
  }
  function handleAvailBlur() {
    const n = parseInt(availInput, 10);
    if (!isNaN(n) && n >= 0) { setAvailable(n); setAvailInput(String(n)); }
    else setAvailInput(String(available));
  }

  return (
    <div className="flight-edit-mock min-h-screen bg-[#8a9bb8] flex items-start justify-center py-8 px-4"
      style={{ fontFamily: "'Inter', sans-serif", backgroundImage: "radial-gradient(circle at 20% 10%, rgba(255,255,255,0.15), transparent 50%)" }}>
      <div className="w-[880px] max-w-[95vw] relative">

        {/* ══════════ THE TICKET ══════════ */}
        <div className="rounded-[20px] overflow-visible shadow-[0_30px_60px_-20px_rgba(20,30,55,0.5)]">

          {/* ── Boarding-pass head ── */}
          <div className="rounded-t-[20px] overflow-hidden bg-[#12244a] text-white relative">
            {/* subtle guilloché texture */}
            <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 9px)" }} />
            {/* airline strip */}
            <div className="relative flex items-center justify-between px-6 pt-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#e8b64c] flex items-center justify-center">
                  <Plane className="h-4 w-4 text-[#12244a]" />
                </div>
                <div>
                  <p className="text-[13px] font-extrabold tracking-[0.22em] leading-none">KINGS TRAVEL</p>
                  <p className="text-[9px] uppercase tracking-[0.3em] text-[#e8b64c] mt-0.5">Boarding Pass · Admin</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="inline-flex items-center gap-1.5 text-[11px] text-white/70 hover:text-white px-2.5 py-1 rounded-full border border-white/20">
                  <History className="h-3 w-3" />Historiku
                </button>
                <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-300/30">Open</span>
                <button className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
            </div>

            {/* route hero */}
            <div className="relative px-6 pt-5 pb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/50 mb-1">Nisja · Tiranë</p>
                <p className="text-5xl font-extrabold tracking-tight leading-none">TIA</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <input readOnly value="19:05" className="bg-transparent outline-none font-mono text-xl font-bold text-[#e8b64c] w-[74px] border-b border-dashed border-white/25" />
                  <span className="text-[11px] text-white/50 font-mono">23 / 08 / 2026</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1.5 px-2">
                <span className="font-mono text-[11px] font-bold bg-white/10 border border-white/20 px-2.5 py-1 rounded-md tracking-widest">W45019</span>
                <div className="flex items-center gap-1 text-white/40">
                  <div className="w-10 h-px bg-white/25" />
                  <Plane className="h-4 w-4 text-[#e8b64c] rotate-90" />
                  <div className="w-10 h-px bg-white/25" />
                </div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">Direkt · #6632</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/50 mb-1">Mbërritja · Bergamo</p>
                <p className="text-5xl font-extrabold tracking-tight leading-none">BGY</p>
                <div className="mt-2 flex items-baseline gap-2 justify-end">
                  <span className="text-[11px] text-white/50 font-mono">23 / 08 / 2026</span>
                  <input readOnly value="21:00" className="bg-transparent outline-none font-mono text-xl font-bold text-[#e8b64c] w-[74px] text-right border-b border-dashed border-white/25" />
                </div>
              </div>
            </div>

            {/* data ribbon — only non-header info */}
            <div className="relative border-t border-white/15 bg-white/[0.04] px-6 py-3 grid grid-cols-3 gap-4">
              {[
                ["Available", "5"],
                ["Sold / Total", "17 / 22"],
                ["Statusi", confirmed ? "⭐ I Konfirmuar" : "Open"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-[9px] uppercase tracking-[0.2em] text-white/40">{k}</p>
                  <p className="text-[12px] font-bold mt-0.5 truncate">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ══════════ BODY — 2-col fixed layout ══════════ */}
          <div className="bg-[#faf7ef] rounded-b-[20px] relative">
            <div className="px-6 pt-5 pb-5 grid grid-cols-[1fr_260px] gap-6">

              {/* ════ LEFT COLUMN — all editable fields ════ */}
              <div className="space-y-5 min-w-0">

                {/* Operator + Date/Time */}
                <div className="space-y-3">
                  <StubTitle icon={<Plane className="h-3 w-3" />}>Operatori i Fluturimit</StubTitle>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#c6007e] text-white flex items-center justify-center text-base font-extrabold shadow-sm shrink-0">W</div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-0.5">Linja ajrore</p>
                      <p className="font-bold text-sm text-stone-800">WIZZ AIR</p>
                    </div>
                    <div className="ml-auto rounded-xl border-2 border-[#12244a]/12 bg-white px-4 py-2 grid grid-cols-3 items-center gap-0 w-[280px] shrink-0">
                      <div className="text-center">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-stone-400 font-semibold mb-0.5">Nisja</p>
                        <p className="font-extrabold font-mono text-lg text-[#12244a]">19:05</p>
                      </div>
                      <div className="text-center border-x border-[#e5dfd0]">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-stone-400 font-semibold mb-0.5">Data</p>
                        <p className="font-bold text-[10px] text-stone-700 leading-tight">Sun 23 Aug 2026</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-stone-400 font-semibold mb-0.5">Mbërritja</p>
                        <p className="font-extrabold font-mono text-lg text-[#12244a]">21:00</p>
                      </div>
                    </div>
                  </div>
                  <button className="w-full text-center text-[12px] py-1.5 rounded-lg border-2 border-dashed border-stone-300 text-stone-400 cursor-not-allowed font-semibold">Mbyll shitjet ×</button>
                </div>

                <div className="border-t border-[#e5dfd0]" />

                {/* Prices + Google */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <StubTitle icon={<Globe className="h-3 w-3" />}>Çmimet</StubTitle>
                    <button className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-600"><History className="h-3 w-3" />Historiku</button>
                  </div>
                  <div className="rounded-lg border border-[#12244a]/20 bg-white px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#12244a]">
                      <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />ÇMIMI I GOOGLE (ADMIN)</span>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </div>
                    <button className="w-full text-[11px] text-[#12244a] border border-[#12244a]/30 rounded-md py-1.5 flex items-center justify-center gap-1.5 bg-[#12244a]/[0.03] hover:bg-[#12244a]/[0.07] font-semibold">
                      <RefreshCw className="h-3 w-3" />Kontrollo çmimin live nga Google
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
                    <Field label="Adult (one-way)" value={180} unit="€" />
                    <Field label="Fëmijë (= Adult)" value={180} unit="€" disabled />
                    <Field label="Infant" value={35} unit="€" />
                    <Field label="Taksa" value={0} unit="€" />
                    <div className="col-span-2"><Field label="Çmimi Neto (informativ)" value={150} unit="€" /></div>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer select-none" onClick={() => setExcluded(v => !v)}>
                    <Toggle on={excluded} onClick={() => {}} tone="bg-rose-500" />
                    <div>
                      <span className="text-[12px] font-bold text-stone-800">Përjashto nga rregulli i çmimit të Google</span>
                      <p className="text-[10px] text-stone-500 mt-0.5 leading-snug">Çmimi që vendos me dorë mbetet i pandryshuar nga Google.</p>
                    </div>
                  </label>
                </div>

                <div className="border-t border-[#e5dfd0]" />

                {/* Baggage + Sales Ending — side by side */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <StubTitle icon={<Luggage className="h-3 w-3" />}>Bagazhi i Kontrolluar</StubTitle>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Çanta" value={1} unit="çanta" />
                      <Field label="Kg" value={20} unit="kg" />
                      <Field label="Çmimi" value={60} unit="€" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <StubTitle icon={<Clock className="h-3 w-3 text-orange-500" />}>Sales Ending</StubTitle>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-stone-600">Mbyllet para nisjes <span className="text-orange-600 font-bold">*</span></span>
                      <div className="flex items-baseline gap-1">
                        <input readOnly value="13" className="font-bold font-mono text-base w-10 text-right border-b-2 border-[#e5dfd0] bg-transparent outline-none text-stone-800" />
                        <span className="text-[11px] text-stone-500 font-semibold">orë</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] border border-amber-300/70 bg-amber-100/60 text-amber-800">
                      <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>Mbyllet <strong>Sun 23 Aug ora 3:05 PM</strong> <span className="opacity-70">(Shqipëri)</span></span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#e5dfd0]" />

                {/* Status */}
                <div className="space-y-2">
                  <StubTitle icon={<ShieldCheck className="h-3 w-3" />}>Statusi i Fluturimit</StubTitle>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-start">
                    <select className="border-2 border-[#e5dfd0] rounded-lg px-3 py-2 text-[12px] font-semibold bg-white text-stone-800 outline-none" defaultValue="open">
                      <option value="open">Open — Hapur për rezervime</option>
                      <option value="closed">Closed — Pezull</option>
                      <option value="soldout">Sold Out</option>
                    </select>
                    <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 whitespace-nowrap" onClick={() => setConfirmed(v => !v)}>
                      <Toggle on={confirmed} onClick={() => {}} tone="bg-amber-400" />
                      <span className="text-[12px] font-bold text-stone-800">⭐ Konfirmuar</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-[#e5dfd0] bg-white px-3 py-2 whitespace-nowrap" onClick={() => setBlocked(v => !v)}>
                      <Toggle on={blocked} onClick={() => {}} tone="bg-orange-500" />
                      <span className="text-[12px] font-bold text-stone-800">🔒 Blloko</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* ════ RIGHT COLUMN — seats + bookings ════ */}
              <div className="flex flex-col gap-4">

                {/* Seats */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <StubTitle icon={<Ticket className="h-3 w-3" />}>Vendet</StubTitle>
                    <button className="inline-flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-600"><History className="h-3 w-3" />Historiku</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border-2 border-[#12244a]/15 bg-white px-1.5 py-2.5 text-center shadow-sm">
                      <p className="text-[9px] uppercase tracking-wider text-stone-400 font-semibold mb-1.5">Available</p>
                      <div className="flex items-center justify-center gap-1">
                        <button onMouseDown={e => { e.preventDefault(); changeAvail(-1); }} className="w-5 h-5 rounded-full border border-stone-300 text-stone-500 flex items-center justify-center hover:bg-stone-100"><Minus className="h-2.5 w-2.5" /></button>
                        <input
                          type="text" inputMode="numeric" value={availInput}
                          onChange={e => setAvailInput(e.target.value.replace(/[^0-9]/g, ""))}
                          onBlur={handleAvailBlur}
                          className="font-extrabold font-mono text-xl text-[#12244a] w-8 text-center bg-transparent outline-none border-b-2 border-[#12244a]/20 focus:border-[#12244a]"
                        />
                        <button onMouseDown={e => { e.preventDefault(); changeAvail(1); }} className="w-5 h-5 rounded-full border border-stone-300 text-stone-500 flex items-center justify-center hover:bg-stone-100"><Plus className="h-2.5 w-2.5" /></button>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-[#e5dfd0] px-1.5 py-2.5 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-stone-400 font-semibold mb-1.5">Sold</p>
                      <p className="font-extrabold font-mono text-xl text-stone-700">17</p>
                    </div>
                    <div className="rounded-xl bg-white border border-[#e5dfd0] px-1.5 py-2.5 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-stone-400 font-semibold mb-1.5">Total</p>
                      <p className="font-extrabold font-mono text-xl text-stone-700">{17 + available}</p>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#e5dfd0] overflow-hidden flex">
                    <div className="bg-[#12244a]" style={{ width: `${(17 / (17 + available)) * 100}%` }} />
                    <div className="bg-[#e8b64c]" style={{ width: `${(available / (17 + available)) * 100}%` }} />
                  </div>
                  <p className="text-[9px] text-stone-400 font-mono">17 sold / {available} free · {Math.round((17 / (17 + available)) * 1000) / 10}% load</p>
                </div>

                <div className="border-t border-[#e5dfd0]" />

                {/* Bookings */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between">
                    <StubTitle icon={<Ticket className="h-3 w-3" />}>Rezervimet (9)</StubTitle>
                    <button className="text-[10px] text-[#12244a] font-bold hover:underline">Shih të gjitha</button>
                  </div>
                  <div className="rounded-xl border border-[#e5dfd0] bg-white divide-y divide-[#f0ebdd] overflow-hidden">
                    {bookings.map(b => (
                      <div key={b.ref} className="flex items-center justify-between px-2.5 py-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] font-extrabold text-[#12244a]">{b.ref}</span>
                            <span className={`text-[8px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border font-bold ${bkStatusStyle[b.status]}`}>{b.status}</span>
                          </div>
                          <p className="text-[10px] text-stone-500 mt-0.5">{b.name}</p>
                        </div>
                        <span className="font-bold font-mono text-[11px] text-stone-800">${b.amount}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-stone-400 font-mono px-0.5">
                    <span>3 / 9 të shfaqura</span>
                    <span>Σ $525</span>
                  </div>
                </div>
              </div>
            </div>

            {/* barcode footer + save */}
            <div className="px-6 pb-5 pt-1">
              <div className="flex items-center gap-4 mb-4">
                {/* fake barcode */}
                <div className="flex items-end gap-[2px] h-8 opacity-70">
                  {[3,1,2,1,4,1,1,3,2,1,3,1,2,4,1,2,1,3,1,2,3,1,1,2,4,1,2,1,3,2,1,3,1,2,1,4].map((w, i) => (
                    <div key={i} className="bg-[#12244a] h-full" style={{ width: w }} />
                  ))}
                </div>
                <div className="font-mono text-[10px] text-stone-400 tracking-[0.3em]">TIA-BGY · 6632 · W45019 · 23AUG26</div>
              </div>
              <button className="w-full bg-[#12244a] hover:bg-[#1a325f] text-white text-sm font-bold rounded-xl py-3 tracking-wide shadow-lg shadow-[#12244a]/30 transition-colors">
                Ruaj Ndryshimet
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
