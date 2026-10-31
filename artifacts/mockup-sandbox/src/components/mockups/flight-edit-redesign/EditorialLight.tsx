import './_group.css';
import { useState } from "react";
import { History, X, Clock, RefreshCw, Globe } from "lucide-react";

/* ─── V5 "Editorial Light" — quiet-luxury typeset itinerary ───
   Warm paper ground, serif display numerals, hairline dividers,
   one muted bronze accent. */

const bookings = [
  { ref: "KTF4493", status: "ticketed", name: "TRAVEL SHOP", amount: 170 },
  { ref: "KTF4471", status: "confirmed", name: "ARDIT HOXHA", amount: 180 },
  { ref: "KTF4462", status: "draft", name: "ONLINE TRAVEL", amount: 175 },
];

const bkDot: Record<string, string> = {
  ticketed: "#2f6f4f",
  confirmed: "#28527a",
  draft: "#9a9284",
};

const ink = "#2b2620";
const faint = "#8d8374";
const hairline = "#e3dccf";
const bronze = "#9a6b3f";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Spline Sans', 'Inter', sans-serif";

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-4">
      <span style={{ fontFamily: sans, color: bronze }} className="text-[10px] font-semibold uppercase tracking-[0.22em]">{children}</span>
      {right}
    </div>
  );
}

function Rule() {
  return <div style={{ background: hairline }} className="h-px w-full my-7" />;
}

function EditRow({ label, hint, value, unit = "€", disabled = false }: { label: string; hint?: string; value: string | number; unit?: string; disabled?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-2" style={{ borderBottom: `1px solid ${hairline}` }}>
      <span style={{ color: disabled ? faint : ink }} className="text-[13px]">
        {label}{hint && <span style={{ color: faint }} className="text-[10px] uppercase tracking-wider"> {hint}</span>}
      </span>
      <span className="flex items-baseline gap-1.5">
        <input readOnly value={value} style={{ fontFamily: serif, color: disabled ? faint : ink }} className="bg-transparent outline-none text-right text-lg w-16" />
        <span style={{ color: faint, fontFamily: sans }} className="text-[11px]">{unit}</span>
      </span>
    </div>
  );
}

function Toggle({ on, onClick, title, desc, accent }: { on: boolean; onClick: () => void; title: React.ReactNode; desc?: string; accent?: string }) {
  const c = accent || bronze;
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none py-2.5" onClick={onClick}>
      <span
        className="mt-0.5 w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center"
        style={{ border: `1px solid ${on ? c : hairline}`, background: on ? c : "transparent", borderRadius: 2 }}
      >
        {on && <span className="text-white text-[11px] leading-none">✓</span>}
      </span>
      <span>
        <span style={{ color: ink }} className="text-[13px] font-medium block">{title}</span>
        {desc && <span style={{ color: faint }} className="text-[11.5px] leading-relaxed block mt-1">{desc}</span>}
      </span>
    </label>
  );
}

export function EditorialLight() {
  const [excluded, setExcluded] = useState(true);
  const [confirmed, setConfirmed] = useState(true);
  const [blocked, setBlocked] = useState(false);

  return (
    <div className="flight-edit-mock min-h-screen flex items-start justify-center p-6" style={{ background: "#d8d2c4", fontFamily: sans }}>
      <style>{`@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Spline+Sans:wght@400;500;600&display=swap");`}</style>
      <div className="w-[980px] max-w-[96vw] shadow-2xl" style={{ background: "#faf6ee", color: ink }}>

        {/* Header */}
        <div className="px-12 pt-10 pb-8" style={{ borderBottom: `1px solid ${hairline}` }}>
          <div className="flex items-start justify-between">
            <div>
              <p style={{ color: bronze }} className="text-[10px] font-semibold uppercase tracking-[0.3em] mb-3">Kings Travel · Itinerar Nº 6632</p>
              <h2 style={{ fontFamily: serif, fontWeight: 500 }} className="text-[56px] leading-none tracking-tight">
                TIA <span style={{ color: bronze }} className="mx-2">→</span> BGY
              </h2>
              <p style={{ color: faint }} className="text-sm mt-3">Sunday, August 23, 2026 · Fluturimi <span style={{ color: ink }} className="font-medium">W45019</span></p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] px-3 py-1.5" style={{ color: faint, border: `1px solid ${hairline}` }}>
                <History className="h-3 w-3" />Historiku
              </button>
              <span className="text-[11px] uppercase tracking-[0.15em] px-3 py-1.5" style={{ color: "#2f6f4f", border: "1px solid #2f6f4f33", background: "#2f6f4f0d" }}>Open</span>
              <button className="p-1.5" style={{ color: faint }}><X className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* LEFT */}
          <div className="px-12 py-10" style={{ borderRight: `1px solid ${hairline}` }}>
            {/* Timing */}
            <SectionLabel>Oraret e Fluturimit</SectionLabel>
            <div className="flex items-end justify-between">
              <div>
                <p style={{ color: faint }} className="text-[11px] uppercase tracking-[0.15em] mb-1">Nisja · TIA</p>
                <input readOnly value="19:05" style={{ fontFamily: serif, color: ink }} className="bg-transparent outline-none text-[40px] leading-none w-28" />
                <p style={{ color: faint }} className="text-[12px] mt-1.5">23 / 08 / 2026</p>
              </div>
              <div className="pb-8 flex flex-col items-center gap-1">
                <span style={{ color: bronze, fontFamily: sans }} className="text-[11px] tracking-[0.2em]">W45019</span>
                <div style={{ borderTop: `1px solid ${hairline}` }} className="w-20" />
              </div>
              <div className="text-right">
                <p style={{ color: faint }} className="text-[11px] uppercase tracking-[0.15em] mb-1">Mbërritja · BGY</p>
                <input readOnly value="21:00" style={{ fontFamily: serif, color: ink }} className="bg-transparent outline-none text-[40px] leading-none w-28 text-right" />
                <p style={{ color: faint }} className="text-[12px] mt-1.5">23 / 08 / 2026</p>
              </div>
            </div>

            <Rule />

            {/* Operator */}
            <SectionLabel>Operatori i Fluturimit</SectionLabel>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <p style={{ color: faint }} className="text-[10px] uppercase tracking-[0.15em] mb-1">Linja ajrore</p>
                <p style={{ fontFamily: serif }} className="text-lg">WIZZ AIR</p>
              </div>
              <div>
                <p style={{ color: faint }} className="text-[10px] uppercase tracking-[0.15em] mb-1">Nga</p>
                <p style={{ fontFamily: serif }} className="text-lg">TIA</p>
              </div>
              <div>
                <p style={{ color: faint }} className="text-[10px] uppercase tracking-[0.15em] mb-1">Deri</p>
                <p style={{ fontFamily: serif }} className="text-lg">BGY</p>
              </div>
            </div>

            <Rule />

            {/* Close sales */}
            <button className="w-full text-[12px] uppercase tracking-[0.18em] py-3" style={{ color: faint, border: `1px solid ${hairline}`, cursor: "not-allowed" }}>
              Mbyll shitjet ×
            </button>
            <p style={{ color: faint }} className="text-[11.5px] text-center mt-2 italic" >Fluturimet me rezervime nuk mund të ndryshohen</p>

            <Rule />

            {/* Sales ending */}
            <SectionLabel right={<Clock className="h-3.5 w-3.5" style={{ color: bronze }} />}>Sales Ending</SectionLabel>
            <div className="flex items-baseline justify-between">
              <span style={{ color: ink }} className="text-[13px]">Mbyllet para nisjes <span style={{ color: bronze }}>*</span></span>
              <span className="flex items-baseline gap-1.5">
                <input readOnly value="13" style={{ fontFamily: serif }} className="bg-transparent outline-none text-2xl w-12 text-right" />
                <span style={{ color: faint }} className="text-[12px]">orë</span>
              </span>
            </div>
            <p style={{ color: bronze }} className="text-[11.5px] leading-relaxed mt-3">
              ⭐ Fluturim i konfirmuar — vlen rregulli i konfirmuar (4 orë), jo kjo fushë · mbyllet <strong>Sunday, August 23, 2026 ora 3:05 PM</strong>
            </p>
            <div className="mt-3 px-4 py-3 text-[12px] flex items-start gap-2" style={{ background: "#f3ead9", borderLeft: `2px solid ${bronze}`, color: "#6f5233" }}>
              <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Shitja mbyllet — <strong>Sunday, August 23, 2026 ora 3:05 PM</strong> <span className="opacity-70">(ora e Shqipërisë)</span></span>
            </div>

            <Rule />

            {/* Seats */}
            <SectionLabel right={
              <button className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.15em]" style={{ color: faint }}><History className="h-3 w-3" />Historiku</button>
            }>Volumi i Biletave</SectionLabel>
            <div className="grid grid-cols-3">
              <div>
                <p style={{ color: faint }} className="text-[10px] uppercase tracking-[0.15em] mb-2">Available</p>
                <div className="flex items-center gap-2">
                  <button className="w-6 h-6 leading-none text-sm" style={{ border: `1px solid ${hairline}`, color: faint }}>−</button>
                  <span style={{ fontFamily: serif }} className="text-[34px] leading-none w-10 text-center">5</span>
                  <button className="w-6 h-6 leading-none text-sm" style={{ border: `1px solid ${hairline}`, color: faint }}>+</button>
                </div>
              </div>
              <div>
                <p style={{ color: faint }} className="text-[10px] uppercase tracking-[0.15em] mb-2">Sold</p>
                <p style={{ fontFamily: serif }} className="text-[34px] leading-none">17</p>
              </div>
              <div>
                <p style={{ color: faint }} className="text-[10px] uppercase tracking-[0.15em] mb-2">Total</p>
                <p style={{ fontFamily: serif }} className="text-[34px] leading-none">22</p>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="px-12 py-10">
            {/* Prices */}
            <SectionLabel right={
              <button className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.15em]" style={{ color: faint }}><History className="h-3 w-3" />Historiku</button>
            }>Çmimet</SectionLabel>
            <div className="px-4 py-3 mb-4" style={{ border: `1px solid ${hairline}`, background: "#f5f0e4" }}>
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: bronze }}>
                <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />Çmimi i Google (Admin)</span>
                <RefreshCw className="h-3.5 w-3.5" />
              </div>
              <button className="w-full mt-2.5 text-[11px] uppercase tracking-[0.12em] py-2 flex items-center justify-center gap-1.5" style={{ border: `1px solid ${bronze}55`, color: bronze, background: "#faf6ee" }}>
                <RefreshCw className="h-3 w-3" />Kontrollo çmimin live nga Google
              </button>
            </div>
            <EditRow label="Çmimi Adult (one-way)" value={180} />
            <EditRow label="Çmimi Fëmijë" hint="(= Adult)" value={180} disabled />
            <EditRow label="Çmimi Infant" value={35} />
            <EditRow label="Taksa" value={0} />
            <EditRow label="Çmimi Neto" hint="(informativ)" value={150} />

            <div className="mt-5">
              <Toggle
                on={excluded}
                onClick={() => setExcluded(v => !v)}
                title="Përjashto nga rregulli i çmimit të Google"
                desc="Kur aktivizohet, çmimi i këtij fluturimi nuk ndryshohet automatikisht nga Google. Çmimi që vendos me dorë mbetet i pandryshuar."
              />
            </div>

            <Rule />

            {/* Baggage */}
            <SectionLabel>Bagazhi i Kontrolluar</SectionLabel>
            <EditRow label="Numri i çantave" value={1} unit="çanta" />
            <EditRow label="Kilogramët" value={20} unit="kg" />
            <EditRow label="Çmimi" value={60} />
            <p style={{ color: faint }} className="text-[11px] italic mt-2">Vendos numrin dhe kg për të dërguar bagazhin.</p>

            <Rule />

            {/* Status */}
            <SectionLabel>Statusi i fluturimit</SectionLabel>
            <select className="w-full text-[13px] px-3 py-2.5 bg-transparent outline-none" style={{ border: `1px solid ${hairline}`, color: ink, fontFamily: sans }} defaultValue="open">
              <option value="open">Open — Hapur për rezervime</option>
              <option value="closed">Closed — Pezull</option>
              <option value="soldout">Sold Out — I shitur plotësisht</option>
            </select>
            <div className="mt-2">
              <Toggle on={confirmed} onClick={() => setConfirmed(v => !v)} title={<>⭐ Fluturim i Konfirmuar</>} accent="#a3812f" />
              <Toggle
                on={blocked}
                onClick={() => setBlocked(v => !v)}
                title="🔒 Blloko shitjet e jashtme"
                desc="Faqja publike, API e partnerëve dhe kanalet e jashtme e shohin fluturimin të mbyllur / pa vende. Rezervimet nga sistemi i brendshëm vazhdojnë normalisht."
                accent="#8a4b2d"
              />
            </div>

            <Rule />

            {/* Bookings */}
            <SectionLabel right={<span style={{ color: bronze }} className="text-[10px] uppercase tracking-[0.15em] cursor-pointer">Shih të gjitha</span>}>
              Rezervimet (9)
            </SectionLabel>
            <div>
              {bookings.map(b => (
                <div key={b.ref} className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${hairline}` }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span style={{ fontFamily: sans, color: ink }} className="text-[12px] font-semibold tracking-wide">{b.ref}</span>
                      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em]" style={{ color: faint }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: bkDot[b.status] }} />{b.status}
                      </span>
                    </div>
                    <p style={{ color: faint }} className="text-[11.5px] mt-0.5">{b.name}</p>
                  </div>
                  <span style={{ fontFamily: serif }} className="text-lg">${b.amount}.00</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-12 py-6" style={{ borderTop: `1px solid ${hairline}` }}>
          <button className="w-full py-3.5 text-[12px] font-semibold uppercase tracking-[0.25em] text-white" style={{ background: ink }}>
            Ruaj Ndryshimet
          </button>
        </div>
      </div>
    </div>
  );
}
