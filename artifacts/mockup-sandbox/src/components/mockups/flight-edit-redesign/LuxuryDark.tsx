import './_group.css';
import { useState } from "react";
import {
  Plane, History, X, Clock, RefreshCw, Globe, Minus, Plus, ChevronDown,
} from "lucide-react";

/* ── V2 "Luxury Dark" — first-class flight board on midnight ground,
   champagne-gold accents, serif display type, glowing inputs ── */

const GOLD = "#c9a962";
const GOLD_DIM = "rgba(201,169,98,0.55)";

const bookings = [
  { ref: "KTF4493", status: "ticketed", name: "TRAVEL SHOP", amount: 170 },
  { ref: "KTF4471", status: "confirmed", name: "ARDIT HOXHA", amount: 180 },
  { ref: "KTF4462", status: "draft", name: "ONLINE TRAVEL", amount: 175 },
];

const bkStatus: Record<string, { dot: string; text: string }> = {
  ticketed: { dot: "#4ade80", text: "rgba(74,222,128,0.9)" },
  confirmed: { dot: "#7dd3fc", text: "rgba(125,211,252,0.9)" },
  draft: { dot: "#94a3b8", text: "rgba(148,163,184,0.9)" },
};

const panel: React.CSSProperties = {
  background: "linear-gradient(160deg, rgba(30,33,42,0.92), rgba(22,24,31,0.96))",
  border: "1px solid rgba(201,169,98,0.14)",
  borderRadius: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
};

const inputGlow: React.CSSProperties = {
  background: "rgba(12,13,17,0.7)",
  border: "1px solid rgba(201,169,98,0.22)",
  boxShadow: "0 0 0 1px rgba(201,169,98,0.05), inset 0 1px 4px rgba(0,0,0,0.45)",
  color: "#f4ede0",
};

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.22em", color: GOLD_DIM }}>{children}</p>
      {right}
    </div>
  );
}

function HistBtn() {
  return (
    <button className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md" style={{ color: "rgba(244,237,224,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <History className="h-3 w-3" />Historiku
    </button>
  );
}

function LuxRow({ label, hint, value, unit = "€", disabled = false }: { label: string; hint?: string; value: string | number; unit?: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px]" style={{ color: "rgba(244,237,224,0.72)" }}>
        {label}{hint && <span className="text-[9px] uppercase ml-1" style={{ letterSpacing: "0.12em", color: "rgba(244,237,224,0.35)" }}>{hint}</span>}
      </span>
      <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 w-32 ${disabled ? "opacity-50" : ""}`} style={inputGlow}>
        <input readOnly value={value} className="bg-transparent outline-none text-sm font-semibold w-full text-right" style={{ color: "#f4ede0", fontFamily: "'Spline Sans Mono', monospace" }} />
        <span className="text-[11px]" style={{ color: GOLD_DIM }}>{unit}</span>
      </div>
    </div>
  );
}

function LuxCheck({ on }: { on: boolean }) {
  return (
    <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
      style={on
        ? { background: `linear-gradient(135deg, ${GOLD}, #a8853d)`, boxShadow: "0 0 12px rgba(201,169,98,0.35)" }
        : { background: "rgba(12,13,17,0.7)", border: "1px solid rgba(201,169,98,0.3)" }}>
      {on && <span className="text-[11px] font-bold leading-none" style={{ color: "#15161c" }}>✓</span>}
    </div>
  );
}

export function LuxuryDark() {
  const [excluded, setExcluded] = useState(true);
  const [confirmed, setConfirmed] = useState(true);
  const [blocked, setBlocked] = useState(false);

  return (
    <div className="flight-edit-mock min-h-screen flex items-start justify-center p-6"
      style={{ background: "radial-gradient(1200px 700px at 50% -10%, #232634 0%, #12141a 55%, #0b0c10 100%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Spline+Sans+Mono:wght@400;500;600;700&display=swap');
        .lux-serif { font-family: 'Fraunces', serif; }
        .lux-mono { font-family: 'Spline Sans Mono', monospace; }
      `}</style>

      <div className="w-[1020px] max-w-[96vw] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "rgba(16,17,23,0.85)", border: "1px solid rgba(201,169,98,0.18)", boxShadow: "0 40px 120px rgba(0,0,0,0.6)" }}>

        {/* ── Header: premium flight board ── */}
        <div className="relative px-8 pt-6 pb-7" style={{ borderBottom: "1px solid rgba(201,169,98,0.15)", background: "linear-gradient(180deg, rgba(35,38,52,0.6), rgba(16,17,23,0))" }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="lux-mono text-[11px] px-2 py-0.5 rounded-md" style={{ color: GOLD, border: `1px solid ${GOLD_DIM}` }}>#6632</span>
              <span className="text-xs" style={{ color: "rgba(244,237,224,0.55)" }}>Sunday, August 23, 2026</span>
            </div>
            <div className="flex items-center gap-2">
              <HistBtn />
              <span className="text-[11px] font-semibold px-3 py-1 rounded-full" style={{ color: "#4ade80", border: "1px solid rgba(74,222,128,0.35)", background: "rgba(74,222,128,0.08)" }}>Open</span>
              <button className="p-1.5 rounded-md" style={{ color: "rgba(244,237,224,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}><X className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Flight board hero */}
          <div className="mt-5 flex items-end justify-center gap-10">
            <div className="text-center">
              <p className="lux-serif text-5xl font-semibold tracking-tight" style={{ color: "#f4ede0" }}>TIA</p>
              <input readOnly value="19:05" className="lux-mono mt-2 text-center text-lg w-24 rounded-lg px-2 py-1 outline-none" style={inputGlow} />
              <p className="lux-mono text-[11px] mt-1.5" style={{ color: "rgba(244,237,224,0.45)" }}>23 / 08 / 2026</p>
            </div>
            <div className="flex flex-col items-center pb-8 min-w-[180px]">
              <span className="lux-mono text-[12px] font-semibold px-3 py-1 rounded-full mb-2" style={{ color: GOLD, border: `1px solid ${GOLD_DIM}`, background: "rgba(201,169,98,0.08)" }}>W45019</span>
              <div className="flex items-center gap-2 w-full">
                <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${GOLD_DIM})` }} />
                <Plane className="h-4 w-4 rotate-45" style={{ color: GOLD }} />
                <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${GOLD_DIM}, transparent)` }} />
              </div>
            </div>
            <div className="text-center">
              <p className="lux-serif text-5xl font-semibold tracking-tight" style={{ color: "#f4ede0" }}>BGY</p>
              <input readOnly value="21:00" className="lux-mono mt-2 text-center text-lg w-24 rounded-lg px-2 py-1 outline-none" style={inputGlow} />
              <p className="lux-mono text-[11px] mt-1.5" style={{ color: "rgba(244,237,224,0.45)" }}>23 / 08 / 2026</p>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* LEFT */}
          <div className="space-y-4 min-w-0">
            {/* Operator */}
            <div className="px-5 py-4" style={panel}>
              <SectionTitle>Operatori i Fluturimit</SectionTitle>
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center lux-serif text-lg font-bold" style={{ background: "rgba(201,169,98,0.1)", color: GOLD, border: `1px solid ${GOLD_DIM}` }}>W</div>
                <div className="flex-1 grid grid-cols-3 gap-3">
                  <div><p className="text-[9px] uppercase mb-1" style={{ letterSpacing: "0.15em", color: "rgba(244,237,224,0.4)" }}>Linja ajrore</p><p className="text-sm font-semibold" style={{ color: "#f4ede0" }}>WIZZ AIR</p></div>
                  <div><p className="text-[9px] uppercase mb-1" style={{ letterSpacing: "0.15em", color: "rgba(244,237,224,0.4)" }}>Nga</p><p className="lux-mono text-sm font-semibold" style={{ color: "#f4ede0" }}>TIA</p></div>
                  <div><p className="text-[9px] uppercase mb-1" style={{ letterSpacing: "0.15em", color: "rgba(244,237,224,0.4)" }}>Deri</p><p className="lux-mono text-sm font-semibold" style={{ color: "#f4ede0" }}>BGY</p></div>
                </div>
              </div>
            </div>

            {/* Toggle sales */}
            <div className="px-5 py-4" style={panel}>
              <button className="w-full text-sm py-2.5 rounded-lg cursor-not-allowed" style={{ color: "rgba(244,237,224,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>Mbyll shitjet ×</button>
              <p className="text-[11px] text-center mt-2" style={{ color: "rgba(244,237,224,0.4)" }}>Fluturimet me rezervime nuk mund të ndryshohen</p>
            </div>

            {/* Sales Ending */}
            <div className="px-5 py-4 space-y-3" style={panel}>
              <SectionTitle right={<Clock className="h-3.5 w-3.5" style={{ color: GOLD }} />}>Sales Ending</SectionTitle>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px]" style={{ color: "rgba(244,237,224,0.72)" }}>Mbyllet para nisjes <span style={{ color: GOLD }}>*</span></span>
                <div className="flex items-center gap-2">
                  <input readOnly value="13" className="lux-mono text-sm font-semibold w-16 text-right rounded-lg px-2 py-1.5 outline-none" style={inputGlow} />
                  <span className="text-[13px]" style={{ color: "rgba(244,237,224,0.55)" }}>orë</span>
                </div>
              </div>
              <p className="text-[11px] font-medium" style={{ color: GOLD }}>⭐ Fluturim i konfirmuar — vlen rregulli i konfirmuar (4 orë), jo kjo fushë · mbyllet <strong>Sunday, August 23, 2026 ora 3:05 PM</strong></p>
              <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(201,169,98,0.08)", border: `1px solid rgba(201,169,98,0.25)`, color: "rgba(244,237,224,0.85)" }}>
                <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
                <span>Shitja mbyllet — <strong style={{ color: GOLD }}>Sunday, August 23, 2026 ora 3:05 PM</strong> <span style={{ opacity: 0.6 }}>(ora e Shqipërisë)</span></span>
              </div>
            </div>

            {/* Seats */}
            <div className="px-5 py-4" style={panel}>
              <SectionTitle right={<HistBtn />}>Volumi i Biletave</SectionTitle>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center rounded-xl py-3" style={{ background: "rgba(201,169,98,0.06)", border: `1px solid rgba(201,169,98,0.25)` }}>
                  <p className="text-[9px] uppercase mb-2" style={{ letterSpacing: "0.18em", color: GOLD_DIM }}>Available</p>
                  <div className="flex items-center justify-center gap-2">
                    <button className="w-6 h-6 rounded-md flex items-center justify-center" style={{ border: `1px solid ${GOLD_DIM}`, color: GOLD }}><Minus className="h-3 w-3" /></button>
                    <span className="lux-serif font-semibold text-2xl w-8" style={{ color: "#f4ede0" }}>5</span>
                    <button className="w-6 h-6 rounded-md flex items-center justify-center" style={{ border: `1px solid ${GOLD_DIM}`, color: GOLD }}><Plus className="h-3 w-3" /></button>
                  </div>
                </div>
                <div className="text-center rounded-xl py-3" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-[9px] uppercase mb-2" style={{ letterSpacing: "0.18em", color: "rgba(244,237,224,0.4)" }}>Sold</p>
                  <p className="lux-serif font-semibold text-2xl" style={{ color: "#f4ede0" }}>17</p>
                </div>
                <div className="text-center rounded-xl py-3" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-[9px] uppercase mb-2" style={{ letterSpacing: "0.18em", color: "rgba(244,237,224,0.4)" }}>Total</p>
                  <p className="lux-serif font-semibold text-2xl" style={{ color: "#f4ede0" }}>22</p>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="px-5 py-4 space-y-3" style={panel}>
              <SectionTitle>Statusi i fluturimit</SectionTitle>
              <div className="relative">
                <select className="w-full rounded-lg px-3 py-2.5 text-sm appearance-none outline-none" style={inputGlow} defaultValue="open">
                  <option value="open">Open — Hapur për rezervime</option>
                  <option value="closed">Closed — Pezull</option>
                  <option value="soldout">Sold Out — I shitur plotësisht</option>
                </select>
                <ChevronDown className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: GOLD_DIM }} />
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setConfirmed(v => !v)}>
                <LuxCheck on={confirmed} />
                <span className="text-sm font-medium" style={{ color: "#f4ede0" }}>⭐ Fluturim i Konfirmuar</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer select-none" onClick={() => setBlocked(v => !v)}>
                <LuxCheck on={blocked} />
                <div>
                  <span className="text-sm font-medium" style={{ color: "#f4ede0" }}>🔒 Blloko shitjet e jashtme</span>
                  <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "rgba(244,237,224,0.5)" }}>Faqja publike, API e partnerëve dhe kanalet e jashtme e shohin fluturimin të mbyllur / pa vende. Rezervimet nga sistemi i brendshëm vazhdojnë normalisht.</p>
                </div>
              </label>
            </div>
          </div>

          {/* RIGHT */}
          <div className="space-y-4 min-w-0">
            {/* Prices */}
            <div className="px-5 py-4 space-y-3" style={panel}>
              <SectionTitle right={<HistBtn />}>Çmimet</SectionTitle>
              <div className="rounded-lg px-3 py-2.5 space-y-2" style={{ background: "rgba(125,211,252,0.05)", border: "1px solid rgba(125,211,252,0.2)" }}>
                <div className="flex items-center justify-between text-[11px] font-semibold" style={{ color: "#7dd3fc" }}>
                  <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />ÇMIMI I GOOGLE (ADMIN)</span><RefreshCw className="h-3.5 w-3.5" />
                </div>
                <button className="w-full text-xs rounded-lg py-2 flex items-center justify-center gap-1.5" style={{ color: "#7dd3fc", border: "1px solid rgba(125,211,252,0.3)", background: "rgba(125,211,252,0.06)" }}>
                  <RefreshCw className="h-3 w-3" />Kontrollo çmimin live nga Google
                </button>
              </div>
              <div className="space-y-2.5">
                <LuxRow label="Çmimi Adult (one-way)" value={180} />
                <LuxRow label="Çmimi Fëmijë" hint="(= Adult)" value={180} disabled />
                <LuxRow label="Çmimi Infant" value={35} />
                <LuxRow label="Taksa" value={0} />
                <LuxRow label="Çmimi Neto" hint="(informativ)" value={150} />
              </div>
            </div>

            {/* Google exclusion */}
            <div className="px-5 py-4" style={panel}>
              <label className="flex items-start gap-3 cursor-pointer select-none" onClick={() => setExcluded(v => !v)}>
                <LuxCheck on={excluded} />
                <div>
                  <span className="text-sm font-medium" style={{ color: "#f4ede0" }}>Përjashto nga rregulli i çmimit të Google</span>
                  <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "rgba(244,237,224,0.5)" }}>Kur aktivizohet, çmimi i këtij fluturimi nuk ndryshohet automatikisht nga Google. Çmimi që vendos me dorë mbetet i pandryshuar.</p>
                </div>
              </label>
            </div>

            {/* Baggage */}
            <div className="px-5 py-4 space-y-3" style={panel}>
              <SectionTitle>Bagazhi i Kontrolluar</SectionTitle>
              <div className="space-y-2.5">
                <LuxRow label="Numri i çantave" value={1} unit="çanta" />
                <LuxRow label="Kilogramët" value={20} unit="kg" />
                <LuxRow label="Çmimi" value={60} />
              </div>
              <p className="text-[10px]" style={{ color: "rgba(244,237,224,0.35)" }}>Vendos numrin dhe kg për të dërguar bagazhin.</p>
            </div>

            {/* Bookings */}
            <div className="px-5 py-4" style={panel}>
              <SectionTitle right={<span className="text-[11px]" style={{ color: GOLD }}>Shih të gjitha</span>}>Rezervimet (9)</SectionTitle>
              <div>
                {bookings.map(b => (
                  <div key={b.ref} className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="lux-mono text-xs font-bold" style={{ color: GOLD }}>{b.ref}</span>
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: bkStatus[b.status].text }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: bkStatus[b.status].dot }} />{b.status}
                        </span>
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: "rgba(244,237,224,0.5)" }}>{b.name}</p>
                    </div>
                    <span className="lux-mono font-semibold text-sm" style={{ color: "#f4ede0" }}>${b.amount}.00</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5" style={{ borderTop: "1px solid rgba(201,169,98,0.15)", background: "rgba(12,13,17,0.6)" }}>
          <button className="w-full text-sm font-semibold rounded-lg py-3 tracking-wide"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #a8853d)`, color: "#15161c", boxShadow: "0 4px 24px rgba(201,169,98,0.3)" }}>
            Ruaj Ndryshimet
          </button>
        </div>
      </div>
    </div>
  );
}
