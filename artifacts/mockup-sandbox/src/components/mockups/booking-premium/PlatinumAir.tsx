import './_group.css';
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Plane, Search, Calendar, ArrowRight, User, Baby, Plus, Trash2,
  Briefcase, ShieldCheck, Armchair, Zap, ChevronDown, Check, Minus,
} from "lucide-react";

/* ============ Display helpers ============ */
function fmtFlightNum(num: string | null | undefined): string {
  if (!num) return num ?? "";
  const clean = num.replace(/\s+/g, "");
  if (clean.length <= 2) return clean;
  return clean.slice(0, 2) + " " + clean.slice(2);
}
function fmtAmPm(t: string | null | undefined): string {
  if (t == null) return "";
  return String(t).trim();
}
function fmtM(n: number | string | null | undefined): string {
  if (n == null || n === "") return "0";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return String(Math.round(num));
}

/* ============ Mock data (Albanian) ============ */
type MockFlight = {
  id: number; airline: string; flightNumber: string;
  fromCity: string; fromAirport: string; toCity: string; toAirport: string;
  departureDate: string; departureTime: string; arrivalTime: string;
  adultPrice: number; childPrice: number; infantPrice: number; tax: number;
  availableSeats: number; isConfirmed: boolean;
  checkedBaggagePrice: number; seatSelectionPrice: number;
  priorityBoardingPrice: number; insurancePrice: number;
};

const MOCK_FLIGHTS: MockFlight[] = [
  {
    id: 1, airline: "WIZZ AIR", flightNumber: "W44799",
    fromCity: "Tiranë", fromAirport: "TIA", toCity: "Bologna", toAirport: "BLQ",
    departureDate: "2026-03-14", departureTime: "19:05", arrivalTime: "20:55",
    adultPrice: 140, childPrice: 120, infantPrice: 45, tax: 30,
    availableSeats: 30, isConfirmed: true,
    checkedBaggagePrice: 35, seatSelectionPrice: 12, priorityBoardingPrice: 8, insurancePrice: 15,
  },
  {
    id: 2, airline: "WIZZ AIR", flightNumber: "W44801",
    fromCity: "Tiranë", fromAirport: "TIA", toCity: "Milano", toAirport: "MXP",
    departureDate: "2026-03-14", departureTime: "06:40", arrivalTime: "08:30",
    adultPrice: 165, childPrice: 140, infantPrice: 50, tax: 30,
    availableSeats: 7, isConfirmed: false,
    checkedBaggagePrice: 35, seatSelectionPrice: 12, priorityBoardingPrice: 8, insurancePrice: 15,
  },
  {
    id: 3, airline: "WIZZ AIR", flightNumber: "W44815",
    fromCity: "Tiranë", fromAirport: "TIA", toCity: "Romë", toAirport: "FCO",
    departureDate: "2026-03-14", departureTime: "13:20", arrivalTime: "15:05",
    adultPrice: 155, childPrice: 130, infantPrice: 48, tax: 30,
    availableSeats: 42, isConfirmed: false,
    checkedBaggagePrice: 35, seatSelectionPrice: 12, priorityBoardingPrice: 8, insurancePrice: 15,
  },
];

type MockAgent = { id: number; name: string; company: string; commission: number };
const MOCK_AGENTS: MockAgent[] = [
  { id: 1, name: "Elira Hoxha", company: "Z TRAVEL", commission: 5 },
  { id: 2, name: "Ardit Meta", company: "SKY LINE", commission: 3 },
];

type Pax = {
  id: string;
  type: "adult" | "child" | "infant";
  firstName: string; lastName: string;
  dateOfBirth?: string;
  baggageOption?: string;
  hasSeatSelection: boolean; hasPriorityBoarding: boolean; hasInsurance: boolean;
  ticketPrice?: string | null;
};

const INITIAL_PAX: Pax[] = [
  { id: "p1", type: "adult", firstName: "Melissa", lastName: "Shuli", baggageOption: "checked", hasSeatSelection: true, hasPriorityBoarding: false, hasInsurance: false, ticketPrice: "170" },
  { id: "p2", type: "adult", firstName: "Genti", lastName: "Shuli", baggageOption: "", hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false, ticketPrice: "170" },
];

const TYPE_LABEL: Record<string, string> = { adult: "I rritur", child: "Fëmijë", infant: "Foshnje" };

/* ============ Design tokens ============ */
const INK = "#1c1e21";          // near-black graphite
const SILVER = "#8b9097";       // engraved silver text
const HAIRLINE = "#e4e2dd";     // warm porcelain hairline
const PORCELAIN = "#f7f6f3";    // page ground
const CARD = "#fdfcfa";         // card surface
const ACCENT = "#9a7b4f";       // burnished champagne — the one accent

const displayFont = "font-['Fraunces']";
const bodyFont = "font-['DM_Sans']";

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-[10px] uppercase tracking-[0.28em] font-medium", className)} style={{ color: SILVER }}>
      {children}
    </span>
  );
}

function Hairline({ className }: { className?: string }) {
  return <div className={cn("h-px w-full", className)} style={{ backgroundColor: HAIRLINE }} />;
}

export default function PlatinumAir() {
  const noop = (...args: any[]) => console.log("[mockup] noop", ...args);

  const [searchFrom, setSearchFrom] = useState("Tiranë");
  const [searchTo, setSearchTo] = useState("Bologna");
  const [searchDate, setSearchDate] = useState("2026-03-14");

  const flights = MOCK_FLIGHTS;
  const agents = MOCK_AGENTS;

  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [selectedFlightId, setSelectedFlightId] = useState<number | null>(1);
  const [agentId, setAgentId] = useState<number | null>(1);

  const [customerName, setCustomerName] = useState("melissa shuli");
  const [customerEmail, setCustomerEmail] = useState("melissa.shuli@example.com");
  const [customerPhone, setCustomerPhone] = useState("+355 69 000 0000");
  const [commission, setCommission] = useState<string>("");
  const [discount, setDiscount] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [markup, setMarkup] = useState<string>("0");

  const [passengers, setPassengers] = useState<Pax[]>(INITIAL_PAX);
  const [expandedIdx, setExpandedIdx] = useState<number>(0);

  const selectedFlight = useMemo(
    () => flights.find(f => f.id === selectedFlightId) ?? null,
    [flights, selectedFlightId]
  );
  const selectedAgent = useMemo(
    () => (agentId ? agents.find(a => a.id === agentId) ?? null : null),
    [agents, agentId]
  );

  const watchedMarkup = Number(markup) || 0;
  const watchedManualDiscount = Number(discount || 0);

  function updatePax(index: number, patch: Partial<Pax>) {
    setPassengers(prev => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  function appendPax(type: Pax["type"]) {
    setPassengers(prev => {
      const next = [...prev, { id: `p${Date.now()}`, type, firstName: "", lastName: "", baggageOption: "", hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false, ticketPrice: null }];
      setExpandedIdx(prev.length);
      return next;
    });
  }
  function removePax(index: number) {
    setPassengers(prev => prev.filter((_, i) => i !== index));
  }

  const totals = useMemo(() => {
    if (!selectedFlight) return { ticket: 0, tax: 0, extras: 0, markup: watchedMarkup, discount: 0, manualDiscount: watchedManualDiscount, total: 0 };
    let ticketGross = 0;
    let effSum = 0;
    let markupTotal = 0;
    let extrasCost = 0;
    passengers.forEach(p => {
      const base = p.type === "adult" ? selectedFlight.adultPrice
        : p.type === "child" ? selectedFlight.childPrice
        : selectedFlight.infantPrice;
      const override = p.ticketPrice;
      const hasOverride = override != null && override !== "" && !Number.isNaN(Number(override));
      if (hasOverride) {
        ticketGross += Number(override);
        effSum += Number(override);
      } else {
        const eff = Math.round(Math.max(0, base + watchedMarkup) * 100) / 100;
        ticketGross += base;
        effSum += eff;
        markupTotal += watchedMarkup;
      }
      if (p.baggageOption === "checked" && selectedFlight.checkedBaggagePrice) extrasCost += selectedFlight.checkedBaggagePrice;
      if (p.hasSeatSelection && selectedFlight.seatSelectionPrice) extrasCost += selectedFlight.seatSelectionPrice;
      if (p.hasPriorityBoarding && selectedFlight.priorityBoardingPrice) extrasCost += selectedFlight.priorityBoardingPrice;
      if (p.hasInsurance && selectedFlight.insurancePrice) extrasCost += selectedFlight.insurancePrice;
    });
    const tax = selectedFlight.tax * passengers.length;
    const manualDiscount = Math.max(0, Math.round(watchedManualDiscount * 100) / 100);
    markupTotal = Math.round(markupTotal * 100) / 100;
    const discountVal = Math.round((ticketGross - effSum + markupTotal) * 100) / 100;
    const total = Math.round((effSum + tax + extrasCost - manualDiscount) * 100) / 100;
    return { ticket: ticketGross, tax, extras: extrasCost, markup: watchedMarkup, discount: discountVal, manualDiscount, total };
  }, [selectedFlight, passengers, watchedMarkup, watchedManualDiscount]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[mockup] onSubmit stub — booking created", { customerName, passengers, totals });
  };

  const stepFlight = !!selectedFlight;
  const stepPax = stepFlight && passengers.every(p => p.firstName && p.lastName);

  const hasSearch = !!(searchFrom || searchTo || searchDate);
  const matchTxt = (val: string, q: string) => !q ? true : (val ?? "").toLowerCase().includes(q.toLowerCase());
  const filtered = !hasSearch ? [] : flights.filter(f => {
    const fromOk = !searchFrom || matchTxt(f.fromCity, searchFrom) || matchTxt(f.fromAirport, searchFrom);
    const toOk = !searchTo || matchTxt(f.toCity, searchTo) || matchTxt(f.toAirport, searchTo);
    const dateOk = !searchDate || f.departureDate === searchDate;
    return fromOk && toOk && dateOk;
  });

  return (
    <div className={cn("booking-premium-scope min-h-screen antialiased", bodyFont)} style={{ backgroundColor: PORCELAIN, color: INK }}>
      <style>{`
        .pa-fade-in { animation: paFade .6s cubic-bezier(.22,.61,.36,1) both; }
        @keyframes paFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .pa-input { transition: border-color .25s ease, background-color .25s ease; }
        .pa-input:focus { outline: none; border-color: ${ACCENT}; }
        .pa-lift { transition: transform .25s cubic-bezier(.22,.61,.36,1), box-shadow .25s ease, border-color .25s ease, background-color .25s ease; }
        .pa-lift:hover { transform: translateY(-1px); }
      `}</style>

      <form onSubmit={onSubmit}>
        {/* ============ Top bar ============ */}
        <header className="sticky top-0 z-30" style={{ backgroundColor: "rgba(247,246,243,0.92)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="max-w-[1320px] mx-auto px-6 md:px-10 h-[72px] flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: CARD }}>
                <Plane className="w-4 h-4 -rotate-45" style={{ color: ACCENT }} />
              </div>
              <div className="flex flex-col leading-tight min-w-0">
                <Eyebrow>Kings Management · Operacionet · Rezervimet</Eyebrow>
                <span className={cn("text-xl tracking-tight truncate", displayFont)} style={{ fontWeight: 500 }}>Rezervim i Ri</span>
              </div>
            </div>

            {/* Quiet stepper */}
            <div className="hidden lg:flex items-center gap-6">
              {[
                { n: "01", label: "Fluturimi", done: stepFlight, active: !stepFlight },
                { n: "02", label: "Pasagjerët", done: stepPax, active: stepFlight && !stepPax },
                { n: "03", label: "Konfirmim", done: false, active: stepPax },
              ].map((s, i) => (
                <div key={s.n} className="flex items-center gap-6">
                  {i > 0 && <div className="w-10 h-px" style={{ backgroundColor: s.done || s.active ? ACCENT : HAIRLINE }} />}
                  <div className="flex items-center gap-2.5">
                    <span className={cn("text-[11px] tabular-nums tracking-[0.2em]", displayFont)}
                      style={{ color: s.done ? ACCENT : s.active ? INK : SILVER }}>
                      {s.done ? <Check className="w-3.5 h-3.5 inline" /> : s.n}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.22em]" style={{ color: s.active ? INK : s.done ? ACCENT : SILVER, fontWeight: s.active ? 600 : 400 }}>
                      {s.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => noop("/bookings")}
                className="h-10 px-4 text-[13px] tracking-wide rounded-full transition-colors hover:bg-black/[0.04]" style={{ color: SILVER }}>
                Anulo
              </button>
              <button type="submit" disabled={!selectedFlight}
                className="hidden sm:inline-flex h-10 px-5 items-center gap-2 rounded-full text-[13px] tracking-wide transition-all disabled:opacity-40 pa-lift"
                style={{ backgroundColor: INK, color: "#f5f3ef" }}>
                Krijo Rezervimin <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* ============ Body ============ */}
        <div className="max-w-[1320px] mx-auto px-6 md:px-10 py-10 md:py-14 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          <div className="lg:col-span-8 flex flex-col gap-14">

            {/* ------- Section I: Flight ------- */}
            <section className="pa-fade-in">
              <div className="flex items-baseline gap-4 mb-6">
                <span className={cn("text-[13px] tabular-nums", displayFont)} style={{ color: ACCENT }}>I.</span>
                <h2 className={cn("text-[26px] tracking-tight", displayFont)} style={{ fontWeight: 450 }}>
                  {selectedFlight ? "Fluturimi i Zgjedhur" : "Zgjidh Fluturimin"}
                </h2>
                <div className="flex-1"><Hairline /></div>
              </div>

              {/* Search row */}
              <div className="grid grid-cols-12 gap-px rounded-2xl overflow-hidden mb-6" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: HAIRLINE }}>
                <div className="col-span-12 md:col-span-4" style={{ backgroundColor: CARD }}>
                  <SearchCell icon={Plane} label="Nga" value={searchFrom} onChange={setSearchFrom} placeholder="Qytet / aeroport" />
                </div>
                <div className="col-span-12 md:col-span-4" style={{ backgroundColor: CARD }}>
                  <SearchCell icon={Plane} label="Për" value={searchTo} onChange={setSearchTo} placeholder="Qytet / aeroport" />
                </div>
                <div className="col-span-9 md:col-span-3" style={{ backgroundColor: CARD }}>
                  <SearchCell icon={Calendar} label="Data" type="date" value={searchDate} onChange={setSearchDate} />
                </div>
                <div className="col-span-3 md:col-span-1 flex items-stretch" style={{ backgroundColor: INK }}>
                  <div className="w-full flex items-center justify-center text-white/90">
                    <Search className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Flight boarding-pass rows */}
              <div className="flex flex-col gap-3">
                {!hasSearch ? (
                  <EmptyPanel text="Plotësoni fushat sipër për të kërkuar fluturim." icon={<Search className="w-5 h-5" style={{ color: SILVER }} />} />
                ) : filtered.length === 0 ? (
                  <EmptyPanel text="Asnjë fluturim nuk u gjet." />
                ) : filtered.slice(0, 30).map((f) => {
                  const selected = selectedFlightId === f.id;
                  const dep = fmtAmPm(f.departureTime) || "—";
                  const arr = fmtAmPm(f.arrivalTime) || "—";
                  return (
                    <button key={f.id} type="button" onClick={() => setSelectedFlightId(f.id)}
                      className="pa-lift group relative w-full text-left rounded-2xl overflow-hidden"
                      style={{
                        backgroundColor: CARD,
                        border: `1px solid ${selected ? ACCENT : HAIRLINE}`,
                        boxShadow: selected ? "0 12px 32px -18px rgba(154,123,79,0.45)" : "0 1px 2px rgba(28,30,33,0.03)",
                      }}>
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] transition-opacity duration-300"
                        style={{ backgroundColor: ACCENT, opacity: selected ? 1 : 0 }} />
                      <div className="pl-6 pr-5 py-4 flex items-center gap-5">
                        {/* Airline */}
                        <div className="w-[104px] shrink-0">
                          <div className="text-[12px] tracking-[0.14em] font-semibold flex items-center gap-1.5">
                            {f.airline}
                          </div>
                          <div className="text-[10px] tracking-[0.18em] mt-0.5 tabular-nums" style={{ color: SILVER }}>{fmtFlightNum(f.flightNumber)}</div>
                          {f.isConfirmed && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
                              <ShieldCheck className="w-3 h-3" /> Konfirmuar
                            </div>
                          )}
                        </div>

                        {/* Route — desktop */}
                        <div className="hidden md:flex items-center gap-6 flex-1 justify-center">
                          <div className="text-right">
                            <div className={cn("text-[22px] leading-none tabular-nums", displayFont)} style={{ fontWeight: 480 }}>{dep}</div>
                            <div className="text-[10px] uppercase tracking-[0.24em] mt-1.5" style={{ color: SILVER }}>{f.fromAirport || f.fromCity}</div>
                          </div>
                          <div className="flex flex-col items-center gap-1.5 min-w-[120px]">
                            <div className="text-[10px] tabular-nums tracking-[0.14em]" style={{ color: SILVER }}>{f.departureDate}</div>
                            <div className="relative w-24 h-px" style={{ backgroundColor: HAIRLINE }}>
                              <div className="absolute -top-[2.5px] left-0 w-[5px] h-[5px] rounded-full" style={{ border: `1px solid ${SILVER}`, backgroundColor: CARD }} />
                              <Plane className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-90 transition-transform duration-500 group-hover:translate-x-1" style={{ color: ACCENT }} />
                              <div className="absolute -top-[2.5px] right-0 w-[5px] h-[5px] rounded-full" style={{ backgroundColor: selected ? ACCENT : SILVER }} />
                            </div>
                            <div className="text-[8.5px] uppercase tracking-[0.3em]" style={{ color: SILVER }}>Direkt</div>
                          </div>
                          <div className="text-left">
                            <div className={cn("text-[22px] leading-none tabular-nums", displayFont)} style={{ fontWeight: 480 }}>{arr}</div>
                            <div className="text-[10px] uppercase tracking-[0.24em] mt-1.5" style={{ color: SILVER }}>{f.toAirport || f.toCity}</div>
                          </div>
                        </div>

                        {/* Route — mobile */}
                        <div className="md:hidden flex-1 min-w-0">
                          <div className={cn("flex items-center gap-2 text-[17px] tabular-nums", displayFont)}>
                            <span>{dep}</span>
                            <Plane className="w-2.5 h-2.5 rotate-90 shrink-0" style={{ color: ACCENT }} />
                            <span>{arr}</span>
                          </div>
                          <div className="text-[10px] truncate mt-0.5 tracking-wide" style={{ color: SILVER }}>
                            {(f.fromAirport || f.fromCity)} → {(f.toAirport || f.toCity)} · {f.departureDate}
                          </div>
                        </div>

                        {/* Price + seats */}
                        <div className="text-right shrink-0 pl-5 flex flex-col items-end gap-1" style={{ borderLeft: `1px solid ${HAIRLINE}` }}>
                          <div className="flex items-start gap-0.5 tabular-nums">
                            <span className="text-[11px] mt-[3px]" style={{ color: ACCENT }}>€</span>
                            <span className={cn("text-[24px] leading-none tracking-tight", displayFont)} style={{ fontWeight: 520 }}>{fmtM(f.adultPrice)}</span>
                          </div>
                          <span className="text-[9px] uppercase tracking-[0.2em]" style={{ color: f.availableSeats < 10 ? ACCENT : SILVER }}>
                            {f.availableSeats} vende
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ÇMIM strip */}
              {selectedFlight && (
                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 rounded-2xl overflow-hidden pa-fade-in"
                  style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: CARD }}>
                  {[
                    { label: "Çmim Adult", value: selectedFlight.adultPrice },
                    { label: "Çmim Fëmijë", value: selectedFlight.childPrice },
                    { label: "Çmim Foshnje", value: selectedFlight.infantPrice },
                    { label: "Taksa", value: selectedFlight.tax },
                  ].map((s, i) => (
                    <div key={s.label} className="px-5 py-4" style={{ borderLeft: i > 0 ? `1px solid ${HAIRLINE}` : undefined }}>
                      <Eyebrow>{s.label}</Eyebrow>
                      <div className={cn("text-[19px] tabular-nums mt-1", displayFont)} style={{ fontWeight: 480 }}>
                        €{fmtM(s.value)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ------- Section II: Client & Agency ------- */}
            <section className="pa-fade-in" style={{ animationDelay: "80ms" }}>
              <div className="flex items-baseline gap-4 mb-6">
                <span className={cn("text-[13px] tabular-nums", displayFont)} style={{ color: ACCENT }}>II.</span>
                <h2 className={cn("text-[26px] tracking-tight", displayFont)} style={{ fontWeight: 450 }}>Klienti & Agjencia</h2>
                <div className="flex-1"><Hairline /></div>
              </div>

              <div className="rounded-2xl p-6 md:p-8 grid grid-cols-12 gap-x-8 gap-y-7"
                style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}>
                <Field className="col-span-12 md:col-span-5" label="Emri i klientit *">
                  <LineInput value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </Field>
                <Field className="col-span-12 md:col-span-4" label="Email">
                  <LineInput type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                </Field>
                <Field className="col-span-12 md:col-span-3" label="Telefon">
                  <LineInput value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                </Field>

                <Field className="col-span-12 md:col-span-6" label="Agjencia (opsionale)">
                  <div className="relative">
                    <button type="button" onClick={() => setAgentPickerOpen(o => !o)}
                      className="w-full h-11 flex items-center justify-between gap-2 pa-input"
                      style={{ borderBottom: `1px solid ${agentPickerOpen ? ACCENT : HAIRLINE}` }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] tracking-widest shrink-0"
                          style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}>
                          {selectedAgent ? (selectedAgent.company ?? selectedAgent.name ?? "").slice(0, 2).toUpperCase() : <Plus className="w-3 h-3" />}
                        </div>
                        <span className="text-[14px] truncate">{selectedAgent ? selectedAgent.company || selectedAgent.name : "Direct Booking"}</span>
                        {selectedAgent && selectedAgent.commission != null && (
                          <span className="text-[10px] uppercase tracking-[0.18em] shrink-0" style={{ color: ACCENT }}>
                            Komision {selectedAgent.commission}%
                          </span>
                        )}
                      </div>
                      <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform duration-300", agentPickerOpen && "rotate-180")} style={{ color: SILVER }} />
                    </button>
                    {agentPickerOpen && (
                      <div className="absolute z-30 mt-2 w-full rounded-xl overflow-hidden pa-fade-in"
                        style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: "0 24px 48px -24px rgba(28,30,33,0.25)" }}>
                        <div className="max-h-72 overflow-auto py-1.5">
                          <button type="button" onClick={() => { setAgentId(null); setAgentPickerOpen(false); }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-black/[0.03] text-left transition-colors">
                            <Check className="h-3.5 w-3.5" style={{ color: ACCENT, opacity: !agentId ? 1 : 0 }} />
                            Direct Booking
                          </button>
                          {agents.map((a) => (
                            <button key={a.id} type="button" onClick={() => { setAgentId(a.id); setAgentPickerOpen(false); }}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-black/[0.03] text-left transition-colors">
                              <Check className="h-3.5 w-3.5" style={{ color: ACCENT, opacity: agentId === a.id ? 1 : 0 }} />
                              {a.name} <span style={{ color: SILVER }}>({a.company})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Field>
                <Field className="col-span-6 md:col-span-3" label="Komision ($)">
                  <LineInput type="number" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="0" />
                </Field>
                <Field className="col-span-6 md:col-span-3" label="Zbritje (€)">
                  <LineInput type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
                </Field>
                <Field className="col-span-12" label="Shënime të brendshme">
                  <LineInput placeholder="Kërkesa speciale, alergji, etj..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
            </section>

            {/* ------- Section III: Passengers ------- */}
            <section className="pa-fade-in" style={{ animationDelay: "160ms" }}>
              <div className="flex items-baseline gap-4 mb-6 flex-wrap">
                <span className={cn("text-[13px] tabular-nums", displayFont)} style={{ color: ACCENT }}>III.</span>
                <h2 className={cn("text-[26px] tracking-tight", displayFont)} style={{ fontWeight: 450 }}>Pasagjerët</h2>
                <span className="text-[11px] tabular-nums tracking-[0.2em]" style={{ color: SILVER }}>{passengers.length} manifest</span>
                <div className="flex-1 min-w-[40px]"><Hairline /></div>
                <div className="flex items-center gap-2">
                  {(["adult", "child", "infant"] as const).map(t => (
                    <button key={t} type="button" onClick={() => appendPax(t)}
                      className="h-8 px-3.5 text-[11px] uppercase tracking-[0.14em] rounded-full flex items-center gap-1.5 transition-colors hover:bg-black/[0.04]"
                      style={{ border: `1px solid ${HAIRLINE}`, color: INK }}>
                      <Plus className="w-3 h-3" style={{ color: ACCENT }} /> {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {passengers.map((p, index) => {
                  const expanded = expandedIdx === index;
                  const paxType = p.type || "adult";
                  const origPrice = selectedFlight
                    ? (paxType === "adult" ? selectedFlight.adultPrice : paxType === "child" ? selectedFlight.childPrice : selectedFlight.infantPrice)
                    : null;
                  const override = p.ticketPrice;
                  const hasOverride = override != null && override !== "" && !Number.isNaN(Number(override)) && (origPrice == null || Number(override) !== Number(origPrice));
                  return (
                    <div key={p.id} className="rounded-2xl overflow-hidden transition-all duration-300"
                      style={{
                        backgroundColor: CARD,
                        border: `1px solid ${expanded ? ACCENT : HAIRLINE}`,
                        boxShadow: expanded ? "0 16px 40px -24px rgba(154,123,79,0.4)" : "0 1px 2px rgba(28,30,33,0.03)",
                      }}>
                      <div className="px-5 md:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                        <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                          className="flex items-center gap-4 min-w-0 flex-1 text-left">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                            style={{ border: `1px solid ${expanded ? ACCENT : HAIRLINE}`, color: expanded ? ACCENT : SILVER }}>
                            {paxType === "infant" ? <Baby className="w-4 h-4" /> : <User className="w-4 h-4" />}
                          </div>
                          <div className="flex flex-col leading-tight min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className={cn("text-[17px] tracking-tight truncate", displayFont)} style={{ fontWeight: 480 }}>
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${index + 1}`}
                              </span>
                              <span className="text-[9px] uppercase tracking-[0.24em] px-2 py-[3px] rounded-full shrink-0"
                                style={{ border: `1px solid ${HAIRLINE}`, color: SILVER }}>
                                {TYPE_LABEL[paxType]}
                              </span>
                            </div>
                            {p.dateOfBirth && (
                              <span className="text-[11px] mt-0.5 tabular-nums" style={{ color: SILVER }}>Datëlindja: {p.dateOfBirth}</span>
                            )}
                          </div>
                        </button>

                        <div className="flex items-center gap-4">
                          {/* Extras glyphs */}
                          <div className="hidden sm:flex items-center gap-2">
                            {p.baggageOption === "checked" && <ExtraDot icon={Briefcase} title="Bagazh" />}
                            {p.hasSeatSelection && <ExtraDot icon={Armchair} title="SEAT" />}
                            {p.hasPriorityBoarding && <ExtraDot icon={Zap} title="Priority" />}
                            {p.hasInsurance && <ExtraDot icon={ShieldCheck} title="Sigurim" />}
                          </div>
                          {/* Price */}
                          <div className="hidden sm:flex items-center gap-3 pl-4" style={{ borderLeft: `1px solid ${HAIRLINE}` }} onClick={(e) => e.stopPropagation()}>
                            {origPrice != null && (
                              <div className="flex flex-col items-end leading-tight">
                                <Eyebrow>Origjinal</Eyebrow>
                                <span className={cn("text-[12px] tabular-nums", hasOverride && "line-through")} style={{ color: SILVER }}>€{fmtM(origPrice)}</span>
                              </div>
                            )}
                            <div className="flex flex-col items-end leading-tight">
                              <Eyebrow className={hasOverride ? "" : undefined}>Çmimi €</Eyebrow>
                              <input type="text" inputMode="decimal" value={p.ticketPrice ?? ""}
                                placeholder={origPrice != null ? String(origPrice) : "0.00"}
                                onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                                className="pa-input w-20 h-8 px-1 text-right text-[15px] tabular-nums bg-transparent"
                                style={{ borderBottom: `1px solid ${hasOverride ? ACCENT : HAIRLINE}`, color: hasOverride ? ACCENT : INK, fontWeight: 600 }} />
                            </div>
                          </div>
                          {index > 0 && (
                            <button type="button" onClick={() => removePax(index)}
                              className="p-1.5 rounded-full transition-colors hover:bg-black/[0.04]" style={{ color: SILVER }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                            className={cn("transition-transform duration-300", expanded && "rotate-180")} style={{ color: SILVER }}>
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="px-5 md:px-6 pb-6 pt-5 grid grid-cols-12 gap-x-6 gap-y-6 pa-fade-in" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                          <Field className="col-span-12 sm:col-span-4" label="Tipi">
                            <select value={p.type} onChange={(e) => updatePax(index, { type: e.target.value as Pax["type"] })}
                              className="pa-input h-10 w-full bg-transparent text-[14px]"
                              style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
                              <option value="adult">I rritur</option>
                              <option value="child">Fëmijë</option>
                              <option value="infant">Foshnje</option>
                            </select>
                          </Field>
                          <Field className="col-span-12 sm:col-span-4" label="Emri *">
                            <LineInput value={p.firstName} onChange={(e) => updatePax(index, { firstName: e.target.value })} />
                          </Field>
                          <Field className="col-span-12 sm:col-span-4" label="Mbiemri *">
                            <LineInput value={p.lastName} onChange={(e) => updatePax(index, { lastName: e.target.value })} />
                          </Field>
                          <Field className="col-span-12 sm:col-span-4" label="Datëlindja">
                            <LineInput type="date" value={p.dateOfBirth || ""} onChange={(e) => updatePax(index, { dateOfBirth: e.target.value })} />
                          </Field>

                          {/* Mobile price override */}
                          <Field className="col-span-12 sm:hidden" label={`Çmimi € ${origPrice != null ? `(origjinal €${fmtM(origPrice)})` : ""}`}>
                            <input type="text" inputMode="decimal" value={p.ticketPrice ?? ""}
                              placeholder={origPrice != null ? String(origPrice) : "0.00"}
                              onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                              className="pa-input h-10 w-full text-right text-[15px] tabular-nums bg-transparent"
                              style={{ borderBottom: `1px solid ${hasOverride ? ACCENT : HAIRLINE}`, fontWeight: 600 }} />
                          </Field>

                          <div className="col-span-12">
                            <Eyebrow>Ekstra</Eyebrow>
                            <div className="mt-2.5 grid grid-cols-2 md:grid-cols-4 gap-3">
                              <ExtraToggle on={p.baggageOption === "checked"}
                                onClick={() => updatePax(index, { baggageOption: p.baggageOption === "checked" ? "" : "checked" })}
                                icon={Briefcase} label="Bagazh"
                                price={selectedFlight?.checkedBaggagePrice ? `+€${selectedFlight.checkedBaggagePrice}` : ""} />
                              <ExtraToggle on={p.hasSeatSelection} onClick={() => updatePax(index, { hasSeatSelection: !p.hasSeatSelection })}
                                icon={Armchair} label="SEAT" price={selectedFlight?.seatSelectionPrice ? `+€${selectedFlight.seatSelectionPrice}` : ""} />
                              <ExtraToggle on={p.hasPriorityBoarding} onClick={() => updatePax(index, { hasPriorityBoarding: !p.hasPriorityBoarding })}
                                icon={Zap} label="Priority" price={selectedFlight?.priorityBoardingPrice ? `+€${selectedFlight.priorityBoardingPrice}` : ""} />
                              <ExtraToggle on={p.hasInsurance} onClick={() => updatePax(index, { hasInsurance: !p.hasInsurance })}
                                icon={ShieldCheck} label="Sigurim" price={selectedFlight?.insurancePrice ? `+€${selectedFlight.insurancePrice}` : ""} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ============ Sidebar — the folio ============ */}
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-[96px] flex flex-col gap-5 pa-fade-in" style={{ animationDelay: "240ms" }}>
              <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: "0 24px 60px -40px rgba(28,30,33,0.3)" }}>
                {/* Folio header */}
                <div className="px-7 pt-7 pb-5 text-center">
                  <Eyebrow>Kings Travel · Folio</Eyebrow>
                  <div className={cn("text-[22px] tracking-tight mt-1", displayFont)} style={{ fontWeight: 480 }}>Përmbledhje Rezervimi</div>
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <div className="w-8 h-px" style={{ backgroundColor: ACCENT }} />
                    <span className="text-[9px] uppercase tracking-[0.3em]" style={{ color: ACCENT }}>I Ri</span>
                    <div className="w-8 h-px" style={{ backgroundColor: ACCENT }} />
                  </div>
                </div>

                <div className="px-7 pb-7">
                  {/* Flight summary */}
                  {selectedFlight ? (
                    <div className="rounded-xl px-5 py-4 mb-6" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: PORCELAIN }}>
                      <div className="flex items-center justify-between mb-3">
                        <Eyebrow>Fluturimi</Eyebrow>
                        <span className="text-[10px] tabular-nums tracking-[0.14em]" style={{ color: SILVER }}>{selectedFlight.departureDate}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-center">
                          <div className={cn("text-[24px] leading-none tracking-tight", displayFont)} style={{ fontWeight: 500 }}>{selectedFlight.fromAirport || selectedFlight.fromCity}</div>
                          <div className="text-[10px] tabular-nums mt-1.5" style={{ color: SILVER }}>{fmtAmPm(selectedFlight.departureTime)}</div>
                        </div>
                        <div className="flex-1 px-4 flex flex-col items-center gap-1">
                          <Plane className="w-3 h-3 rotate-90" style={{ color: ACCENT }} />
                          <div className="w-full h-px" style={{ backgroundColor: HAIRLINE }} />
                          <span className="text-[8.5px] uppercase tracking-[0.3em]" style={{ color: SILVER }}>Direkt</span>
                        </div>
                        <div className="text-center">
                          <div className={cn("text-[24px] leading-none tracking-tight", displayFont)} style={{ fontWeight: 500 }}>{selectedFlight.toAirport || selectedFlight.toCity}</div>
                          <div className="text-[10px] tabular-nums mt-1.5" style={{ color: SILVER }}>{fmtAmPm(selectedFlight.arrivalTime)}</div>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 flex items-center justify-between text-[11px]" style={{ borderTop: `1px dashed ${HAIRLINE}` }}>
                        <span className="tracking-[0.1em]">{selectedFlight.airline} {fmtFlightNum(selectedFlight.flightNumber)}</span>
                        <span className="tabular-nums" style={{ color: SILVER }}>€{fmtM(selectedFlight.adultPrice)} bazë</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl p-5 mb-6 text-center text-[12px]" style={{ border: `1px dashed ${HAIRLINE}`, color: SILVER }}>
                      Zgjidh një fluturim
                    </div>
                  )}

                  {/* Per-passenger */}
                  {selectedFlight && passengers.length > 0 && (
                    <div className="mb-6">
                      <Eyebrow>Çmimi për pasagjer</Eyebrow>
                      <div className="mt-2">
                        {passengers.map((p, i) => {
                          const base = p.type === "adult" ? selectedFlight.adultPrice
                            : p.type === "child" ? selectedFlight.childPrice
                            : selectedFlight.infantPrice;
                          const ov = p.ticketPrice;
                          const hasOv = ov != null && ov !== "" && !Number.isNaN(Number(ov)) && Number(ov) !== Number(base);
                          const finalPrice = hasOv ? Number(ov) : Number(base);
                          return (
                            <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom: i < passengers.length - 1 ? `1px solid ${HAIRLINE}` : undefined }}>
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ border: `1px solid ${HAIRLINE}`, color: SILVER }}>
                                  {p.type === "infant" ? <Baby className="w-3 h-3" /> : <User className="w-3 h-3" />}
                                </div>
                                <span className="text-[13px] truncate">
                                  {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${i + 1}`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 tabular-nums">
                                {hasOv && <span className="text-[10px] line-through" style={{ color: SILVER }}>€{fmtM(base)}</span>}
                                <span className="text-[14px]" style={{ fontWeight: 600, color: hasOv ? ACCENT : INK }}>€{fmtM(finalPrice)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="space-y-2.5 text-[13px] tabular-nums">
                    <FolioRow label={`Biletat × ${passengers.length}`} value={`€${fmtM(totals.ticket)}`} />
                    {totals.discount > 0 && <FolioRow label="Zbritje Agjenti" value={`−€${fmtM(totals.discount)}`} accent />}
                    {totals.manualDiscount > 0 && <FolioRow label="Zbritje manuale" value={`−€${fmtM(totals.manualDiscount)}`} accent />}
                    <FolioRow label="Taksa" value={`€${fmtM(totals.tax)}`} />
                    <FolioRow label="Ekstra" value={`€${fmtM(totals.extras)}`} />
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span className="text-[10px] uppercase tracking-[0.24em]" style={{ color: SILVER }}>Markup</span>
                      <input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)}
                        className="pa-input w-24 h-8 px-1 text-right bg-transparent text-[14px] tabular-nums"
                        style={{ borderBottom: `1px solid ${HAIRLINE}`, fontWeight: 600 }} />
                    </div>
                  </div>

                  {/* Grand total */}
                  <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${INK}` }}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] uppercase tracking-[0.28em]" style={{ color: SILVER }}>Total Klienti</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[14px]" style={{ color: ACCENT }}>€</span>
                        <span className={cn("text-[40px] leading-none tracking-tight tabular-nums", displayFont)} style={{ fontWeight: 520 }}>
                          {fmtM(totals.total)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: SILVER }}>
                      <Minus className="w-3 h-3" style={{ color: ACCENT }} />
                      Pagesa menaxhohet pas konfirmimit
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="mt-6 flex flex-col gap-2">
                    <button type="submit" disabled={!selectedFlight}
                      className="pa-lift h-12 rounded-full text-[13px] tracking-[0.08em] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: INK, color: "#f5f3ef", boxShadow: "0 16px 32px -18px rgba(28,30,33,0.5)" }}>
                      Konfirmo Rezervimin <ArrowRight className="w-4 h-4" style={{ color: ACCENT }} />
                    </button>
                    <button type="button" onClick={() => noop("/bookings")}
                      className="h-10 rounded-full text-[13px] transition-colors hover:bg-black/[0.04]" style={{ color: SILVER }}>
                      Anulo
                    </button>
                  </div>
                </div>
              </div>

              {selectedAgent && (
                <div className="rounded-2xl px-6 py-5 flex items-start gap-4" style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[11px] tracking-widest"
                    style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}>
                    {(selectedAgent.company ?? selectedAgent.name).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <Eyebrow>Agjenti i Zgjedhur</Eyebrow>
                    <div className="text-[13px] mt-1 leading-relaxed">
                      {selectedAgent.name} · {selectedAgent.company}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
}

/* ============ Sub-components ============ */

function SearchCell({ icon: Icon, label, value, onChange, placeholder, type = "text" }: {
  icon: any; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block px-5 py-3 cursor-text">
      <span className="text-[9px] uppercase tracking-[0.28em] flex items-center gap-1.5" style={{ color: SILVER }}>
        <Icon className="w-3 h-3" style={{ color: ACCENT }} /> {label}
      </span>
      <input type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="pa-input mt-1 w-full bg-transparent text-[14px] tracking-wide"
        style={{ border: "none", color: INK }} />
    </label>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-[9px] uppercase tracking-[0.28em] block mb-1.5" style={{ color: SILVER }}>{label}</label>
      {children}
    </div>
  );
}

function LineInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className="pa-input h-10 w-full bg-transparent text-[14px] tracking-wide"
      style={{ borderBottom: `1px solid ${HAIRLINE}`, color: INK }} />
  );
}

function ExtraDot({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <span title={title} className="w-7 h-7 rounded-full flex items-center justify-center"
      style={{ border: `1px solid ${HAIRLINE}`, color: ACCENT }}>
      <Icon className="w-3 h-3" />
    </span>
  );
}

function ExtraToggle({ on, onClick, icon: Icon, label, price }: {
  on: boolean; onClick: () => void; icon: any; label: string; price?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className="pa-lift flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left"
      style={{
        border: `1px solid ${on ? ACCENT : HAIRLINE}`,
        backgroundColor: on ? "rgba(154,123,79,0.06)" : "transparent",
      }}>
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="w-4 h-4 shrink-0" style={{ color: on ? ACCENT : SILVER }} />
        <div className="flex flex-col items-start leading-tight min-w-0">
          <span className="text-[12px] tracking-wide truncate" style={{ fontWeight: on ? 600 : 400, color: INK }}>{label}</span>
          {price && <span className="text-[10px] tabular-nums" style={{ color: SILVER }}>{price}</span>}
        </div>
      </div>
      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors"
        style={on ? { backgroundColor: ACCENT } : { border: `1px solid ${SILVER}` }}>
        {on && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
    </button>
  );
}

function EmptyPanel({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-10 text-center flex flex-col items-center gap-2" style={{ border: `1px dashed ${HAIRLINE}` }}>
      {icon}
      <p className="text-[13px]" style={{ color: SILVER }}>{text}</p>
    </div>
  );
}

function FolioRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span style={{ color: accent ? ACCENT : SILVER }}>{label}</span>
      <span className="tabular-nums" style={{ fontWeight: 600, color: accent ? ACCENT : INK }}>{value}</span>
    </div>
  );
}
