import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Plane, Search, Calendar, ArrowRight, Users, User, Baby, Plus, Trash2,
  Briefcase, ShieldCheck, Armchair, Zap, ChevronDown, Building2,
  Check, Receipt, BadgePercent, Sparkles, Mail, Phone, StickyNote, Star,
} from "lucide-react";

// ============ Display helpers ============
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

// ============ Mock data (Albanian) ============
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

function PaxIcon({ type, className }: { type: string; className?: string }) {
  if (type === "infant") return <Baby className={className} />;
  return <User className={className} />;
}

const paxTint: Record<string, string> = {
  adult: "from-cyan-400 to-teal-400 text-slate-950",
  child: "from-amber-300 to-orange-400 text-slate-950",
  infant: "from-fuchsia-400 to-pink-400 text-slate-950",
};
const paxBadge: Record<string, string> = {
  adult: "bg-cyan-400/10 text-cyan-300 ring-cyan-400/30",
  child: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  infant: "bg-fuchsia-400/10 text-fuchsia-300 ring-fuchsia-400/30",
};

// ============ Component ============
export default function AuroraTech() {
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
    <div className="aurora-scope min-h-screen bg-[#070B18] text-slate-200 font-['Space_Grotesk'] antialiased relative overflow-x-clip">
      <style>{`
        .aurora-scope { --aur-1: 168 84% 55%; --aur-2: 262 90% 68%; --aur-3: 330 85% 62%; }
        @keyframes aur-drift { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(4%, -3%, 0) scale(1.08); } }
        @keyframes aur-drift2 { 0%,100% { transform: translate3d(0,0,0) scale(1.05); } 50% { transform: translate3d(-5%, 4%, 0) scale(1); } }
        @keyframes aur-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes aur-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
        .aur-rise { animation: aur-rise .55s cubic-bezier(.22,1.2,.36,1) both; }
        .aur-card { background: linear-gradient(160deg, rgba(255,255,255,.045), rgba(255,255,255,.015)); border: 1px solid rgba(148,163,184,.14); backdrop-filter: blur(14px); }
        .aur-card:hover { border-color: rgba(148,163,184,.22); }
        .aur-input { background: rgba(6,10,26,.55); border: 1px solid rgba(148,163,184,.18); transition: border-color .2s, box-shadow .2s, transform .15s; }
        .aur-input:hover { border-color: rgba(94,234,212,.35); }
        .aur-input:focus, .aur-input:focus-within { outline: none; border-color: hsl(var(--aur-1)); box-shadow: 0 0 0 3px hsl(var(--aur-1) / .18), 0 0 24px hsl(var(--aur-1) / .12); }
        .aur-springy { transition: transform .18s cubic-bezier(.34,1.8,.5,1), box-shadow .2s, border-color .2s, background .2s; }
        .aur-springy:hover { transform: translateY(-1px) scale(1.012); }
        .aur-springy:active { transform: translateY(0) scale(.97); }
        .aur-grad-text { background: linear-gradient(92deg, hsl(var(--aur-1)), hsl(var(--aur-2)) 55%, hsl(var(--aur-3))); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .aur-cta { background: linear-gradient(95deg, hsl(var(--aur-1)) 0%, hsl(var(--aur-2)) 55%, hsl(var(--aur-3)) 110%); background-size: 180% 100%; transition: background-position .5s, transform .18s cubic-bezier(.34,1.8,.5,1), box-shadow .3s; }
        .aur-cta:hover { background-position: 90% 0; box-shadow: 0 8px 32px hsl(var(--aur-2) / .35); transform: translateY(-1px); }
        .aur-cta:active { transform: scale(.98); }
        .aur-scope input[type=date]::-webkit-calendar-picker-indicator { filter: invert(.8); }
        .aur-scope ::placeholder { color: rgb(100 116 139); }
        .aur-dot { animation: aur-pulse 1.8s ease-in-out infinite; }
      `}</style>

      {/* Aurora backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-[30%] -left-[10%] w-[70%] h-[70%] rounded-full opacity-[.17] blur-[90px]"
          style={{ background: "radial-gradient(circle, hsl(168 84% 55%), transparent 65%)", animation: "aur-drift 16s ease-in-out infinite" }} />
        <div className="absolute -top-[20%] right-[-15%] w-[65%] h-[75%] rounded-full opacity-[.15] blur-[100px]"
          style={{ background: "radial-gradient(circle, hsl(262 90% 62%), transparent 65%)", animation: "aur-drift2 20s ease-in-out infinite" }} />
        <div className="absolute bottom-[-30%] left-[25%] w-[55%] h-[60%] rounded-full opacity-[.10] blur-[110px]"
          style={{ background: "radial-gradient(circle, hsl(330 85% 58%), transparent 65%)", animation: "aur-drift 24s ease-in-out infinite reverse" }} />
        <div className="absolute inset-0 opacity-[.35]" style={{ backgroundImage: "radial-gradient(rgba(148,163,184,.09) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      </div>

      <form onSubmit={onSubmit} className="relative z-10">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#070B18]/80 backdrop-blur-xl">
          <div className="px-4 md:px-8 h-16 flex items-center justify-between gap-4 max-w-[1500px] mx-auto">
            <div className="flex items-center gap-3.5">
              <div className="relative w-10 h-10 rounded-2xl aur-cta flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
                <Plane className="w-4.5 h-4.5 w-[18px] h-[18px] text-slate-950 -rotate-45" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-[0.28em] font-bold text-slate-500">Kings Management</span>
                <span className="text-[15px] font-bold text-white tracking-tight">Rezervim i Ri</span>
              </div>
              <div className="hidden md:flex items-center gap-1.5 ml-4 text-[11px] font-['JetBrains_Mono'] text-slate-500">
                <span>Operacionet</span><span className="text-slate-700">/</span>
                <span>Rezervimet</span><span className="text-slate-700">/</span>
                <span className="text-teal-300">I Ri</span>
              </div>
            </div>

            {/* Stepper */}
            <div className="hidden lg:flex items-center gap-2">
              <Step n={1} label="Fluturimi" done={stepFlight} active={!stepFlight} />
              <StepDash done={stepFlight} />
              <Step n={2} label="Pasagjerët" done={stepPax} active={stepFlight && !stepPax} />
              <StepDash done={stepPax} />
              <Step n={3} label="Konfirmim" done={false} active={stepPax} />
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => noop("/bookings")}
                className="aur-springy h-9 px-4 text-[13px] font-semibold text-slate-400 hover:text-white rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5">
                Anulo
              </button>
              <button type="submit" disabled={!selectedFlight}
                className="aur-cta h-9 px-4 rounded-xl text-[13px] font-bold text-slate-950 flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none">
                Krijo <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="px-4 md:px-8 py-7 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1500px] mx-auto">
          <div className="lg:col-span-8 flex flex-col gap-6">

            {/* ==================== Flight selection ==================== */}
            <section className="aur-card rounded-3xl overflow-hidden aur-rise">
              <div className="px-6 pt-5 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                    selectedFlight ? "bg-teal-400/15 text-teal-300 ring-1 ring-teal-400/30" : "bg-violet-400/15 text-violet-300 ring-1 ring-violet-400/30")}>
                    {selectedFlight ? <Check className="w-4 h-4" /> : <Plane className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-white tracking-tight">
                      {selectedFlight ? "Fluturimi i Zgjedhur" : "Zgjidh Fluturimin"}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-['JetBrains_Mono']">01 · kërko dhe zgjidh</p>
                  </div>
                </div>
                {selectedFlight && (
                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-teal-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 aur-dot" /> LIVE
                  </span>
                )}
              </div>

              {/* Search */}
              <div className="px-6 pb-4 grid grid-cols-12 gap-2.5">
                <div className="col-span-12 md:col-span-4">
                  <AInput icon={Plane} value={searchFrom} onChange={setSearchFrom} placeholder="Nga (qytet/aeroport)" />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <AInput icon={Plane} value={searchTo} onChange={setSearchTo} placeholder="Për (qytet/aeroport)" />
                </div>
                <div className="col-span-9 md:col-span-3">
                  <AInput icon={Calendar} type="date" value={searchDate} onChange={setSearchDate} placeholder="Data" />
                </div>
                <div className="col-span-3 md:col-span-1">
                  <button type="button" className="aur-cta aur-springy h-11 w-full rounded-xl flex items-center justify-center text-slate-950">
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="px-4 pb-4 flex flex-col gap-2.5">
                {!hasSearch ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
                    <Search className="w-6 h-6 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm text-slate-500">Plotësoni fushat sipër për të kërkuar fluturim.</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
                    <p className="text-sm text-slate-500">Asnjë fluturim nuk u gjet.</p>
                  </div>
                ) : filtered.slice(0, 30).map((f, fi) => {
                  const selected = selectedFlightId === f.id;
                  const dep = fmtAmPm(f.departureTime) || "—";
                  const arr = fmtAmPm(f.arrivalTime) || "—";
                  return (
                    <button key={f.id} type="button" onClick={() => setSelectedFlightId(f.id)}
                      style={{ animationDelay: `${fi * 60}ms` }}
                      className={cn(
                        "aur-rise aur-springy group relative w-full text-left rounded-2xl border p-[1px] overflow-hidden",
                        selected ? "border-transparent" : "border-white/10 hover:border-white/20"
                      )}>
                      {selected && (
                        <div className="absolute inset-0 rounded-2xl"
                          style={{ background: "linear-gradient(120deg, hsl(168 84% 55% / .8), hsl(262 90% 68% / .8), hsl(330 85% 62% / .8))" }} />
                      )}
                      <div className={cn("relative rounded-[15px] px-4 py-3 flex items-center gap-4",
                        selected ? "bg-[#0B1226]" : "bg-white/[.02] group-hover:bg-white/[.045]")}>
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
                          selected ? "aur-cta text-slate-950" : "bg-white/[.06] text-slate-400 group-hover:text-teal-300")}>
                          <Plane className="w-4 h-4 -rotate-45" />
                        </div>
                        <div className="shrink-0 w-[100px]">
                          <div className="text-[12px] font-bold tracking-wide text-white flex items-center gap-1.5">
                            {f.airline}
                            {f.isConfirmed && <Star className="w-3 h-3 text-amber-300 fill-amber-300" aria-label="Fluturim i Konfirmuar" />}
                          </div>
                          <div className="text-[10px] text-slate-500 font-['JetBrains_Mono'] tracking-wider">{fmtFlightNum(f.flightNumber)}</div>
                        </div>
                        {/* route */}
                        <div className="hidden md:flex items-center gap-4 flex-1 justify-center">
                          <div className="text-right">
                            <div className="text-[16px] font-bold text-white leading-tight font-['JetBrains_Mono']">{dep}</div>
                            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">{f.fromAirport || f.fromCity}</div>
                          </div>
                          <div className="flex flex-col items-center gap-1 min-w-[92px]">
                            <div className="text-[10px] text-slate-400 font-['JetBrains_Mono']">{f.departureDate}</div>
                            <div className="relative w-20 h-px" style={{ background: "linear-gradient(90deg, transparent, hsl(168 84% 55% / .6), hsl(262 90% 68% / .6), transparent)" }}>
                              <Plane className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 text-teal-300 rotate-90" />
                            </div>
                            <div className="text-[8px] uppercase tracking-[0.3em] text-slate-500">Direkt</div>
                          </div>
                          <div className="text-left">
                            <div className="text-[16px] font-bold text-white leading-tight font-['JetBrains_Mono']">{arr}</div>
                            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">{f.toAirport || f.toCity}</div>
                          </div>
                        </div>
                        {/* mobile route */}
                        <div className="md:hidden flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-[14px] font-bold text-white font-['JetBrains_Mono']">
                            <span>{dep}</span>
                            <Plane className="w-2.5 h-2.5 text-teal-300 rotate-90 shrink-0" />
                            <span>{arr}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{(f.fromAirport || f.fromCity)} → {(f.toAirport || f.toCity)} · {f.departureDate}</div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1 shrink-0 pl-4 border-l border-white/[.07]">
                          <div className="flex items-start gap-0.5 leading-none">
                            <span className="text-[10px] font-bold text-teal-300 mt-[2px]">€</span>
                            <span className="text-[20px] font-bold text-white font-['JetBrains_Mono'] tracking-tight">{fmtM(f.adultPrice)}</span>
                          </div>
                          <span className={cn(
                            "inline-flex items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em] rounded-full px-2 py-[2px] ring-1",
                            f.availableSeats < 10
                              ? "text-amber-300 bg-amber-400/10 ring-amber-400/30"
                              : "text-teal-300 bg-teal-400/10 ring-teal-400/30"
                          )}>
                            <span className={cn("w-1 h-1 rounded-full aur-dot", f.availableSeats < 10 ? "bg-amber-400" : "bg-teal-400")} />
                            +{f.availableSeats} VENDE
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ÇMIM strip */}
              {selectedFlight && (
                <div className="mx-4 mb-4 rounded-2xl border border-white/[.08] bg-gradient-to-r from-teal-400/[.06] via-violet-400/[.06] to-fuchsia-400/[.06] p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <PriceStat label="Çmim Adult" value={selectedFlight.adultPrice} tone="text-teal-300" />
                  <PriceStat label="Çmim Fëmijë" value={selectedFlight.childPrice} tone="text-violet-300" />
                  <PriceStat label="Çmim Foshnje" value={selectedFlight.infantPrice} tone="text-fuchsia-300" />
                  <PriceStat label="Taksa" value={selectedFlight.tax} tone="text-amber-300" />
                </div>
              )}
            </section>

            {/* ==================== Customer & Agency ==================== */}
            <section className="aur-card rounded-3xl aur-rise" style={{ animationDelay: "90ms" }}>
              <div className="px-6 pt-5 pb-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-400/15 text-violet-300 ring-1 ring-violet-400/30 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-white tracking-tight">Klienti & Agjencia</h3>
                  <p className="text-[11px] text-slate-500 font-['JetBrains_Mono']">02 · të dhënat e kontaktit</p>
                </div>
              </div>
              <div className="px-6 pb-6 grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-5">
                  <ALabel>Emri i klientit *</ALabel>
                  <ARaw icon={User} value={customerName} onChange={(e: any) => setCustomerName(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <ALabel>Email</ALabel>
                  <ARaw icon={Mail} type="email" value={customerEmail} onChange={(e: any) => setCustomerEmail(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <ALabel>Telefon</ALabel>
                  <ARaw icon={Phone} value={customerPhone} onChange={(e: any) => setCustomerPhone(e.target.value)} />
                </div>

                <div className="col-span-12 md:col-span-6">
                  <ALabel>Agjencia (opsionale)</ALabel>
                  {(() => {
                    const current = selectedAgent;
                    const initials = current ? (current.company ?? current.name ?? "").slice(0, 2).toUpperCase() : "—";
                    return (
                      <div className="relative">
                        <button type="button" onClick={() => setAgentPickerOpen(o => !o)}
                          className="aur-input aur-springy w-full h-11 px-3 rounded-xl flex items-center justify-between text-left">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-6 h-6 rounded-lg aur-cta flex items-center justify-center text-slate-950 text-[10px] font-bold shrink-0">
                              {current ? initials : <Plus className="w-3 h-3" />}
                            </div>
                            <span className="text-sm font-semibold text-white truncate">
                              {current ? current.company || current.name : "Direct Booking"}
                            </span>
                            {current && current.commission != null && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-400/10 ring-1 ring-violet-400/30 text-violet-300 font-bold shrink-0">
                                Komision {current.commission}%
                              </span>
                            )}
                          </div>
                          <ChevronDown className={cn("w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200", agentPickerOpen && "rotate-180")} />
                        </button>
                        {agentPickerOpen && (
                          <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-white/10 bg-[#0B1226]/95 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden aur-rise">
                            <div className="max-h-72 overflow-auto py-1">
                              <button type="button" onClick={() => { setAgentId(null); setAgentPickerOpen(false); }}
                                className="w-full flex items-center px-3 py-2.5 text-sm hover:bg-white/[.06] text-left text-slate-200">
                                <Check className={cn("mr-2 h-4 w-4 text-teal-300", !agentId ? "opacity-100" : "opacity-0")} />
                                Direct Booking
                              </button>
                              {agents.map((a) => (
                                <button key={a.id} type="button" onClick={() => { setAgentId(a.id); setAgentPickerOpen(false); }}
                                  className="w-full flex items-center px-3 py-2.5 text-sm hover:bg-white/[.06] text-left text-slate-200">
                                  <Check className={cn("mr-2 h-4 w-4 text-teal-300", agentId === a.id ? "opacity-100" : "opacity-0")} />
                                  {a.name} <span className="text-slate-500 ml-1.5">({a.company})</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="col-span-6 md:col-span-3">
                  <ALabel>Komision ($)</ALabel>
                  <ARaw icon={BadgePercent} type="number" value={commission} onChange={(e: any) => setCommission(e.target.value)} />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <ALabel>Zbritje (€)</ALabel>
                  <ARaw type="number" min={0} step="0.01" placeholder="0" value={discount} onChange={(e: any) => setDiscount(e.target.value)} />
                </div>
                <div className="col-span-12">
                  <ALabel>Shënime të brendshme</ALabel>
                  <ARaw icon={StickyNote} placeholder="Kërkesa speciale, alergji, etj..." value={notes} onChange={(e: any) => setNotes(e.target.value)} />
                </div>
              </div>
            </section>

            {/* ==================== Passengers ==================== */}
            <section className="aur-card rounded-3xl aur-rise" style={{ animationDelay: "160ms" }}>
              <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-fuchsia-400/15 text-fuchsia-300 ring-1 ring-fuchsia-400/30 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-white tracking-tight flex items-center gap-2">
                      Pasagjerët
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/[.07] text-slate-300 font-['JetBrains_Mono']">{passengers.length}</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 font-['JetBrains_Mono']">03 · emrat & ekstrat</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {(["adult", "child", "infant"] as const).map(t => (
                    <button key={t} type="button" onClick={() => appendPax(t)}
                      className="aur-springy h-8 px-3 text-[12px] font-bold text-slate-300 border border-white/10 rounded-xl hover:border-teal-400/40 hover:text-teal-300 hover:bg-teal-400/[.06] flex items-center gap-1">
                      <Plus className="w-3 h-3" /> {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-4 pb-5 flex flex-col gap-3">
                {passengers.map((p, index) => {
                  const expanded = expandedIdx === index;
                  const paxType = p.type || "adult";
                  const origPrice = selectedFlight
                    ? (paxType === "adult" ? selectedFlight.adultPrice : paxType === "child" ? selectedFlight.childPrice : selectedFlight.infantPrice)
                    : null;
                  const override = p.ticketPrice;
                  const hasOverride = override != null && override !== "" && !Number.isNaN(Number(override)) && (origPrice == null || Number(override) !== Number(origPrice));
                  return (
                    <div key={p.id} className={cn(
                      "rounded-2xl border overflow-hidden transition-all duration-300",
                      expanded ? "border-teal-400/30 bg-teal-400/[.03] shadow-[0_0_32px_rgba(45,212,191,.06)]" : "border-white/[.08] bg-white/[.02]"
                    )}>
                      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                        <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left">
                          <div className={cn("w-10 h-10 rounded-2xl bg-gradient-to-br flex items-center justify-center shrink-0", paxTint[paxType])}>
                            <PaxIcon type={paxType} className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col leading-tight min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[14px] font-bold text-white truncate">
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${index + 1}`}
                              </span>
                              <span className={cn("text-[9px] uppercase font-bold px-2 py-[2px] rounded-full ring-1 shrink-0 tracking-[0.1em]", paxBadge[paxType])}>
                                {TYPE_LABEL[paxType]}
                              </span>
                            </div>
                            {p.dateOfBirth && (
                              <span className="text-[11px] text-slate-500">Datëlindja: <span className="font-['JetBrains_Mono']">{p.dateOfBirth}</span></span>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {p.hasSeatSelection && <ExtraDot title="SEAT" icon={Armchair} tone="text-cyan-300 bg-cyan-400/10 ring-cyan-400/25" />}
                            {p.hasPriorityBoarding && <ExtraDot title="Priority" icon={Zap} tone="text-amber-300 bg-amber-400/10 ring-amber-400/25" />}
                            {p.hasInsurance && <ExtraDot title="Sigurim" icon={ShieldCheck} tone="text-teal-300 bg-teal-400/10 ring-teal-400/25" />}
                            {p.baggageOption === "checked" && <ExtraDot title="Bagazh" icon={Briefcase} tone="text-violet-300 bg-violet-400/10 ring-violet-400/25" />}
                          </div>
                          <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-white/[.08]" onClick={(e) => e.stopPropagation()}>
                            {origPrice != null && (
                              <>
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="text-[8.5px] uppercase tracking-[0.14em] font-bold text-slate-500">Origjinal</span>
                                  <span className={cn("text-[12px] font-semibold font-['JetBrains_Mono']", hasOverride ? "text-slate-500 line-through decoration-slate-600" : "text-slate-300")}>
                                    €{fmtM(origPrice)}
                                  </span>
                                </div>
                                <ArrowRight className="w-3 h-3 text-slate-600" />
                              </>
                            )}
                            <div className="flex flex-col items-end leading-tight">
                              <span className={cn("text-[8.5px] uppercase tracking-[0.14em] font-bold", hasOverride ? "text-teal-300" : "text-slate-500")}>Çmimi €</span>
                              <input
                                type="text" inputMode="decimal"
                                value={p.ticketPrice ?? ""}
                                placeholder={origPrice != null ? String(origPrice) : "0.00"}
                                onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                                className={cn(
                                  "aur-input w-20 h-8 px-2 text-right rounded-lg text-sm font-bold text-white font-['JetBrains_Mono']",
                                  hasOverride && "!border-teal-400/50 bg-teal-400/[.08]"
                                )}
                              />
                            </div>
                          </div>
                          {index > 0 && (
                            <button type="button" onClick={() => removePax(index)} className="aur-springy text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-400/10">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                            className={cn("text-slate-500 hover:text-white transition-transform duration-300 p-1", expanded && "rotate-180")}>
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="px-4 pb-4 border-t border-white/[.06] pt-4 grid grid-cols-12 gap-3 aur-rise">
                          <div className="col-span-12 sm:col-span-4">
                            <ALabel>Tipi</ALabel>
                            <select value={p.type} onChange={(e) => updatePax(index, { type: e.target.value as Pax["type"] })}
                              className="aur-input h-11 w-full px-3 rounded-xl text-sm text-white bg-[#0B1226]">
                              <option value="adult">I rritur</option>
                              <option value="child">Fëmijë</option>
                              <option value="infant">Foshnje</option>
                            </select>
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <ALabel>Emri *</ALabel>
                            <ARaw value={p.firstName} onChange={(e: any) => updatePax(index, { firstName: e.target.value })} />
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <ALabel>Mbiemri *</ALabel>
                            <ARaw value={p.lastName} onChange={(e: any) => updatePax(index, { lastName: e.target.value })} />
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <ALabel>Datëlindja</ALabel>
                            <ARaw type="date" value={p.dateOfBirth || ""} onChange={(e: any) => updatePax(index, { dateOfBirth: e.target.value })} />
                          </div>

                          {/* Price override — mobile */}
                          <div className="col-span-12 sm:hidden">
                            <ALabel>Çmimi € {origPrice != null ? `(origjinal €${fmtM(origPrice)})` : ""}</ALabel>
                            <input
                              type="text" inputMode="decimal"
                              value={p.ticketPrice ?? ""}
                              placeholder={origPrice != null ? String(origPrice) : "0.00"}
                              onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                              className={cn(
                                "aur-input h-11 w-full px-3 text-right rounded-xl text-sm font-bold text-white font-['JetBrains_Mono']",
                                hasOverride && "!border-teal-400/50 bg-teal-400/[.08]"
                              )}
                            />
                          </div>

                          <div className="col-span-12 mt-1">
                            <ALabel>Ekstra</ALabel>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <AToggle
                                on={p.baggageOption === "checked"}
                                onClick={() => updatePax(index, { baggageOption: p.baggageOption === "checked" ? "" : "checked" })}
                                icon={Briefcase} label="Bagazh"
                                price={selectedFlight?.checkedBaggagePrice ? `+€${selectedFlight.checkedBaggagePrice}` : ""}
                              />
                              <AToggle on={p.hasSeatSelection} onClick={() => updatePax(index, { hasSeatSelection: !p.hasSeatSelection })} icon={Armchair} label="SEAT"
                                price={selectedFlight?.seatSelectionPrice ? `+€${selectedFlight.seatSelectionPrice}` : ""} />
                              <AToggle on={p.hasPriorityBoarding} onClick={() => updatePax(index, { hasPriorityBoarding: !p.hasPriorityBoarding })} icon={Zap} label="Priority"
                                price={selectedFlight?.priorityBoardingPrice ? `+€${selectedFlight.priorityBoardingPrice}` : ""} />
                              <AToggle on={p.hasInsurance} onClick={() => updatePax(index, { hasInsurance: !p.hasInsurance })} icon={ShieldCheck} label="Sigurim"
                                price={selectedFlight?.insurancePrice ? `+€${selectedFlight.insurancePrice}` : ""} />
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

          {/* ==================== Sidebar ==================== */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 flex flex-col gap-4">
              <div className="aur-card rounded-3xl overflow-hidden aur-rise" style={{ animationDelay: "120ms" }}>
                <div className="relative px-6 py-4 border-b border-white/[.07] overflow-hidden">
                  <div className="absolute inset-0 opacity-40" style={{ background: "linear-gradient(110deg, hsl(168 84% 55% / .12), hsl(262 90% 68% / .12), hsl(330 85% 62% / .10))" }} />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Receipt className="w-4 h-4 text-teal-300" />
                      <h3 className="text-[14px] font-bold text-white tracking-tight">Përmbledhje Rezervimi</h3>
                    </div>
                    <span className="text-[9px] uppercase font-bold tracking-[0.2em] px-2 py-1 rounded-full aur-cta text-slate-950">I Ri</span>
                  </div>
                </div>
                <div className="p-6">
                  {/* Flight card */}
                  {selectedFlight ? (
                    <div className="rounded-2xl border border-white/[.08] bg-white/[.03] p-4 mb-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] uppercase font-bold tracking-[0.22em] text-teal-300">Fluturimi</span>
                        <span className="text-[10px] font-semibold text-slate-400 font-['JetBrains_Mono']">{selectedFlight.departureDate}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-center">
                          <div className="text-xl font-bold text-white leading-none tracking-tight">{selectedFlight.fromAirport || selectedFlight.fromCity}</div>
                          <div className="text-[10px] text-slate-500 mt-1 font-['JetBrains_Mono']">{fmtAmPm(selectedFlight.departureTime)}</div>
                        </div>
                        <div className="flex-1 px-3 flex flex-col items-center gap-1">
                          <Plane className="w-3 h-3 text-teal-300 rotate-90" />
                          <div className="w-full h-px" style={{ background: "linear-gradient(90deg, transparent, hsl(168 84% 55% / .5), hsl(262 90% 68% / .5), transparent)" }} />
                          <span className="text-[9px] uppercase tracking-[0.25em] text-slate-500">Direkt</span>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-white leading-none tracking-tight">{selectedFlight.toAirport || selectedFlight.toCity}</div>
                          <div className="text-[10px] text-slate-500 mt-1 font-['JetBrains_Mono']">{fmtAmPm(selectedFlight.arrivalTime)}</div>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/[.06] flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-300">{selectedFlight.airline} {fmtFlightNum(selectedFlight.flightNumber)}</span>
                        <span className="font-['JetBrains_Mono'] text-slate-500">€{fmtM(selectedFlight.adultPrice)} bazë</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 p-5 mb-5 text-center text-xs text-slate-500">
                      Zgjidh një fluturim
                    </div>
                  )}

                  {/* Per-passenger */}
                  {selectedFlight && passengers.length > 0 && (
                    <div className="space-y-0.5 mb-4">
                      <div className="text-[9px] uppercase tracking-[0.22em] font-bold text-slate-500 mb-2">Çmimi për pasagjer</div>
                      {passengers.map((p, i) => {
                        const base = p.type === "adult" ? selectedFlight.adultPrice
                          : p.type === "child" ? selectedFlight.childPrice
                          : selectedFlight.infantPrice;
                        const ov = p.ticketPrice;
                        const hasOv = ov != null && ov !== "" && !Number.isNaN(Number(ov)) && Number(ov) !== Number(base);
                        const finalPrice = hasOv ? Number(ov) : Number(base);
                        return (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[.05] last:border-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={cn("w-6 h-6 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0", paxTint[p.type])}>
                                <PaxIcon type={p.type} className="w-3 h-3" />
                              </div>
                              <span className="text-[12px] font-semibold text-slate-200 truncate">
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${i + 1}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 font-['JetBrains_Mono']">
                              {hasOv && <span className="text-[10px] text-slate-500 line-through">€{fmtM(base)}</span>}
                              <span className={cn("text-[13px] font-bold", hasOv ? "text-teal-300" : "text-slate-200")}>€{fmtM(finalPrice)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Totals */}
                  <div className="space-y-2.5 text-sm font-['JetBrains_Mono']">
                    <ARow label={`Biletat × ${passengers.length}`} value={`€${fmtM(totals.ticket)}`} />
                    {totals.discount > 0 && <ARow label="Zbritje Agjenti" value={`−€${fmtM(totals.discount)}`} tone="green" />}
                    {totals.manualDiscount > 0 && <ARow label="Zbritje manuale" value={`−€${fmtM(totals.manualDiscount)}`} tone="rose" />}
                    <ARow label="Taksa" value={`€${fmtM(totals.tax)}`} />
                    <ARow label="Ekstra" value={`€${fmtM(totals.extras)}`} />
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500 font-['Space_Grotesk']">Markup</span>
                      <input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)}
                        className="aur-input w-24 h-9 px-2.5 text-right rounded-xl text-sm font-bold text-white" />
                    </div>
                  </div>

                  {/* Grand total */}
                  <div className="mt-5 pt-4 border-t border-white/[.08]">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.22em]">Total Klienti</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-bold aur-grad-text">€</span>
                        <span key={totals.total} className="aur-rise text-[38px] leading-none font-bold aur-grad-text font-['JetBrains_Mono'] tracking-tight">
                          {fmtM(totals.total)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 aur-dot" />
                      Pagesa menaxhohet pas konfirmimit
                    </div>
                  </div>
                </div>

                <div className="px-6 pb-6 flex flex-col gap-2">
                  <button type="submit" disabled={!selectedFlight}
                    className="aur-cta h-12 rounded-2xl text-slate-950 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none">
                    Konfirmo Rezervimin <ArrowRight className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => noop("/bookings")}
                    className="aur-springy h-10 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/[.05]">Anulo</button>
                </div>
              </div>

              {selectedAgent && (
                <div className="aur-card rounded-2xl p-4 aur-rise" style={{ animationDelay: "200ms" }}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl aur-cta flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-slate-950" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white mb-0.5">Agjenti i Zgjedhur</div>
                      <div className="text-[11px] text-slate-400 leading-relaxed">
                        {selectedAgent.name} · {selectedAgent.company}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// ============ Helper components ============

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all font-['JetBrains_Mono']",
        done ? "bg-teal-400/15 text-teal-300 ring-1 ring-teal-400/40"
          : active ? "aur-cta text-slate-950 shadow-lg shadow-violet-500/25"
          : "bg-white/[.04] text-slate-500 ring-1 ring-white/10"
      )}>
        {done ? <Check className="w-3.5 h-3.5" /> : n}
      </div>
      <span className={cn("text-[12px] font-semibold",
        active ? "text-white" : done ? "text-teal-300" : "text-slate-500")}>{label}</span>
    </div>
  );
}

function StepDash({ done }: { done: boolean }) {
  return <div className={cn("w-8 h-px", done ? "bg-teal-400/50" : "bg-white/10")} />;
}

function ALabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-slate-500 mb-1.5 block">{children}</label>;
}

const ARaw = ({ icon: Icon, className, ...props }: any) => (
  <div className="relative">
    {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />}
    <input
      {...props}
      className={cn(
        "aur-input h-11 w-full rounded-xl text-sm text-white font-medium",
        Icon ? "pl-10 pr-3" : "px-3.5",
        className
      )}
    />
  </div>
);

function AInput({ icon: Icon, value, onChange, placeholder, type = "text" }: {
  icon?: any; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="relative">
      {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />}
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn("aur-input h-11 w-full rounded-xl text-sm text-white font-medium", Icon ? "pl-10 pr-3" : "px-3.5")}
      />
    </div>
  );
}

function ExtraDot({ title, icon: Icon, tone }: { title: string; icon: any; tone: string }) {
  return (
    <span title={title} className={cn("w-7 h-7 rounded-lg ring-1 flex items-center justify-center", tone)}>
      <Icon className="w-3.5 h-3.5" />
    </span>
  );
}

function AToggle({ on, onClick, icon: Icon, label, price }: {
  on: boolean; onClick: () => void; icon: any; label: string; price?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "aur-springy flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left",
        on ? "border-teal-400/50 bg-teal-400/[.08] shadow-[0_0_20px_rgba(45,212,191,.10)]" : "border-white/10 bg-white/[.02] hover:border-white/20"
      )}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
          on ? "aur-cta text-slate-950" : "bg-white/[.06] text-slate-400")}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col items-start leading-tight min-w-0">
          <span className={cn("text-[12px] font-bold truncate", on ? "text-teal-200" : "text-slate-300")}>{label}</span>
          {price && <span className="text-[10px] text-slate-500 font-['JetBrains_Mono']">{price}</span>}
        </div>
      </div>
      <div className={cn("w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all",
        on ? "bg-teal-400" : "border border-slate-600")}>
        {on && <Check className="w-2.5 h-2.5 text-slate-950" />}
      </div>
    </button>
  );
}

function PriceStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className={cn("text-[9px] uppercase tracking-[0.18em] font-bold", tone)}>{label}</div>
      <div className="text-[17px] font-bold text-white font-['JetBrains_Mono'] mt-0.5">€{fmtM(value)}</div>
    </div>
  );
}

function ARow({ label, value, tone }: { label: string; value: string; tone?: "green" | "rose" }) {
  return (
    <div className={cn(
      "flex justify-between items-center text-[13px]",
      tone === "green" && "text-teal-300 bg-teal-400/[.07] rounded-lg px-2.5 py-1.5",
      tone === "rose" && "text-rose-300 bg-rose-400/[.07] rounded-lg px-2.5 py-1.5"
    )}>
      <span className={cn(!tone && "text-slate-400")}>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
