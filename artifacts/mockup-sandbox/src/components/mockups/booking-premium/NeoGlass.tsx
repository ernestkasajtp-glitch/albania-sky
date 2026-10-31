import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Plane, Search, Calendar, ArrowRight, Users, User, Baby, Plus, Trash2,
  Briefcase, ShieldCheck, Armchair, Zap, ChevronDown, Building2, FileText,
  Check, ChevronRight, Receipt, BadgePercent, Sparkles, Mail, Phone,
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
function typeGlow(t: string) {
  if (t === "infant") return "from-fuchsia-400/30 to-pink-500/10 text-fuchsia-200 ring-fuchsia-300/30";
  if (t === "child") return "from-amber-300/30 to-orange-400/10 text-amber-200 ring-amber-300/30";
  return "from-cyan-300/30 to-sky-400/10 text-cyan-200 ring-cyan-300/30";
}
function typeChip(t: string) {
  if (t === "infant") return "bg-fuchsia-400/15 text-fuchsia-200 ring-1 ring-fuchsia-300/25";
  if (t === "child") return "bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/25";
  return "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/25";
}

const glass = "bg-white/[0.055] backdrop-blur-xl ring-1 ring-white/10 shadow-[0_18px_50px_-18px_rgba(0,10,40,0.65),inset_0_1px_0_rgba(255,255,255,0.12)]";
const glassInput = cn(
  "h-10 w-full rounded-xl bg-white/[0.06] text-sm text-slate-100 font-medium placeholder:text-slate-500",
  "ring-1 ring-white/10 hover:ring-white/20 focus:ring-2 focus:ring-cyan-300/50 focus:bg-white/[0.09]",
  "focus:outline-none transition-all duration-200 [color-scheme:dark]"
);

export default function NeoGlass() {
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
    <div className="relative min-h-screen font-['Space_Grotesk'] antialiased text-slate-100 bg-[#070b1c] overflow-x-clip selection:bg-cyan-300/30">
      {/* Spectral background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-48 -left-40 w-[42rem] h-[42rem] rounded-full opacity-40 blur-[110px]"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.5), transparent 65%)" }} />
        <div className="absolute top-1/3 -right-56 w-[46rem] h-[46rem] rounded-full opacity-35 blur-[130px]"
          style={{ background: "radial-gradient(circle, rgba(167,139,250,0.5), transparent 65%)" }} />
        <div className="absolute -bottom-64 left-1/4 w-[40rem] h-[40rem] rounded-full opacity-25 blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(52,211,153,0.45), transparent 65%)" }} />
        {/* grid lines */}
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "linear-gradient(rgba(148,163,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,255,0.6) 1px, transparent 1px)", backgroundSize: "72px 72px" }} />
        {/* noise */}
        <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      </div>

      <form onSubmit={onSubmit} className="relative z-10">
        {/* ===== Top bar ===== */}
        <header className="sticky top-0 z-40 backdrop-blur-2xl bg-[#070b1c]/60 border-b border-white/[0.07]">
          <div className="px-4 md:px-8 py-3 flex items-center justify-between gap-3 max-w-[1440px] mx-auto">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400/25 via-sky-500/20 to-violet-500/25 ring-1 ring-cyan-300/30 flex items-center justify-center shadow-[0_0_28px_-4px_rgba(56,189,248,0.55)]">
                <Plane className="w-4 h-4 text-cyan-200 -rotate-45" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] uppercase tracking-[0.32em] font-semibold text-cyan-300/70 font-['Spline_Sans_Mono']">KINGS TRAVEL · OPS</span>
                <span className="text-sm font-bold tracking-wide text-white">Rezervim i Ri</span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[11px] font-['Spline_Sans_Mono'] tracking-wider text-slate-400">
              <span>OPERACIONET</span>
              <ChevronRight className="w-3 h-3 text-cyan-300/60" />
              <span>REZERVIMET</span>
              <ChevronRight className="w-3 h-3 text-cyan-300/60" />
              <span className="text-cyan-200">I RI</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => noop("/bookings")}
                className="h-9 px-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] rounded-xl transition-colors">Anulo</button>
              <button type="submit" disabled={!selectedFlight}
                className="hidden sm:flex h-9 px-3.5 text-sm font-semibold text-cyan-100 rounded-xl items-center gap-1.5 disabled:opacity-40 bg-white/[0.06] ring-1 ring-cyan-300/25 hover:ring-cyan-300/50 hover:bg-cyan-400/10 transition-all">
                <FileText className="w-3.5 h-3.5" /> Krijo
              </button>
            </div>
          </div>
          {/* Stepper */}
          <div className="px-4 md:px-8 pb-3 max-w-[1440px] mx-auto">
            <div className="flex items-center gap-3 max-w-4xl">
              <Step n={1} label="Fluturimi" done={stepFlight} active={!stepFlight} />
              <StepLine done={stepFlight} />
              <Step n={2} label="Pasagjerët" done={stepPax} active={stepFlight && !stepPax} />
              <StepLine done={stepPax} />
              <Step n={3} label="Konfirmim" done={false} active={stepPax} />
            </div>
          </div>
        </header>

        {/* ===== Body ===== */}
        <div className="px-4 md:px-8 py-7 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1440px] mx-auto">
          <div className="lg:col-span-8 flex flex-col gap-6">

            {/* ---- Flight selection ---- */}
            <section className={cn("rounded-3xl overflow-hidden", glass)}>
              <div className="h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
              <header className="px-6 py-4 flex items-center justify-between border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center ring-1",
                    selectedFlight ? "bg-emerald-400/15 text-emerald-300 ring-emerald-300/30" : "bg-cyan-400/15 text-cyan-300 ring-cyan-300/30"
                  )}>
                    {selectedFlight ? <Check className="w-4 h-4" /> : <Plane className="w-4 h-4" />}
                  </div>
                  <h3 className="text-sm font-bold tracking-wide text-white uppercase">
                    {selectedFlight ? "Fluturimi i Zgjedhur" : "Zgjidh Fluturimin"}
                  </h3>
                </div>
                <span className="text-[10px] font-['Spline_Sans_Mono'] tracking-[0.25em] text-slate-500">GATE 01</span>
              </header>

              {/* Search */}
              <div className="px-6 py-4 grid grid-cols-12 gap-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="col-span-12 md:col-span-4 relative">
                  <Plane className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-300/60 pointer-events-none" />
                  <input value={searchFrom} onChange={e => setSearchFrom(e.target.value)} placeholder="Nga (qytet/aeroport)"
                    className={cn(glassInput, "pl-10 pr-3")} />
                </div>
                <div className="col-span-12 md:col-span-4 relative">
                  <Plane className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-300/60 rotate-90 pointer-events-none" />
                  <input value={searchTo} onChange={e => setSearchTo(e.target.value)} placeholder="Për (qytet/aeroport)"
                    className={cn(glassInput, "pl-10 pr-3")} />
                </div>
                <div className="col-span-10 md:col-span-3 relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)}
                    className={cn(glassInput, "pl-10 pr-3")} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <div className="h-10 w-full rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-[#070b1c] flex items-center justify-center shadow-[0_0_24px_-4px_rgba(56,189,248,0.7)] cursor-pointer hover:brightness-110 transition-all">
                    <Search className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Flight boards */}
              <div className="p-5 flex flex-col gap-3">
                {!hasSearch ? (
                  <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
                    <Search className="w-6 h-6 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400">Plotësoni fushat sipër për të kërkuar fluturim.</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
                    <p className="text-sm text-slate-400">Asnjë fluturim nuk u gjet.</p>
                  </div>
                ) : filtered.slice(0, 30).map((f) => {
                  const selected = selectedFlightId === f.id;
                  const dep = fmtAmPm(f.departureTime) || "—";
                  const arr = fmtAmPm(f.arrivalTime) || "—";
                  return (
                    <button key={f.id} type="button" onClick={() => setSelectedFlightId(f.id)}
                      className={cn(
                        "group relative w-full text-left rounded-2xl transition-all duration-300 overflow-hidden",
                        "bg-white/[0.04] ring-1 backdrop-blur-md hover:-translate-y-0.5",
                        selected
                          ? "ring-cyan-300/60 bg-cyan-400/[0.07] shadow-[0_0_38px_-8px_rgba(56,189,248,0.55)]"
                          : "ring-white/10 hover:ring-white/25 hover:bg-white/[0.06]"
                      )}
                    >
                      {selected && (
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
                      )}
                      <div className="px-4 py-3 flex items-center gap-4">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ring-1",
                          selected ? "bg-cyan-400/20 ring-cyan-300/40 shadow-[0_0_18px_-2px_rgba(56,189,248,0.6)]" : "bg-white/[0.06] ring-white/10 group-hover:ring-cyan-300/30"
                        )}>
                          <Plane className={cn("w-4 h-4 -rotate-45 transition-colors", selected ? "text-cyan-200" : "text-slate-400 group-hover:text-cyan-200")} />
                        </div>
                        <div className="shrink-0 min-w-0 w-[98px]">
                          <div className="text-[12px] font-bold tracking-wider text-white truncate leading-tight flex items-center gap-1.5">
                            {f.airline}
                            {f.isConfirmed && (
                              <span title="Fluturim i Konfirmuar" className="inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] shrink-0" />
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-['Spline_Sans_Mono'] tracking-widest">{fmtFlightNum(f.flightNumber)}</div>
                        </div>
                        {/* Desktop route */}
                        <div className="hidden md:flex items-center gap-4 flex-1 justify-center min-w-0">
                          <div className="text-right">
                            <div className="text-[15px] font-bold text-white leading-tight tabular-nums font-['Spline_Sans_Mono']">{dep}</div>
                            <div className="text-[9px] uppercase tracking-[0.2em] text-cyan-300/70">{f.fromAirport || f.fromCity}</div>
                          </div>
                          <div className="flex flex-col items-center gap-1 px-2 min-w-[92px]">
                            <div className="text-[10px] text-slate-400 font-['Spline_Sans_Mono'] leading-none">{f.departureDate}</div>
                            <div className="relative w-20 h-px bg-gradient-to-r from-cyan-300/0 via-cyan-300/60 to-violet-400/0">
                              <div className="absolute -top-[2.5px] left-0 w-[5px] h-[5px] rounded-full bg-cyan-300 shadow-[0_0_6px_rgba(56,189,248,0.9)]" />
                              <Plane className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 text-white rotate-90 drop-shadow-[0_0_5px_rgba(56,189,248,0.9)]" />
                              <div className="absolute -top-[2.5px] right-0 w-[5px] h-[5px] rounded-full bg-violet-300 shadow-[0_0_6px_rgba(167,139,250,0.9)]" />
                            </div>
                            <div className="text-[7.5px] uppercase tracking-[0.3em] text-slate-500 leading-none">Direkt</div>
                          </div>
                          <div className="text-left">
                            <div className="text-[15px] font-bold text-white leading-tight tabular-nums font-['Spline_Sans_Mono']">{arr}</div>
                            <div className="text-[9px] uppercase tracking-[0.2em] text-violet-300/70">{f.toAirport || f.toCity}</div>
                          </div>
                        </div>
                        {/* Mobile route */}
                        <div className="md:hidden flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-[14px] font-bold text-white tabular-nums leading-tight font-['Spline_Sans_Mono']">
                            <span>{dep}</span>
                            <Plane className="w-2.5 h-2.5 text-cyan-300 rotate-90 shrink-0" />
                            <span>{arr}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{(f.fromAirport || f.fromCity)} → {(f.toAirport || f.toCity)} · {f.departureDate}</div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1 shrink-0 pl-4 border-l border-white/10">
                          <div className="flex items-start gap-[2px] tabular-nums leading-none">
                            <span className="text-[10px] font-bold text-cyan-300 mt-[2px]">€</span>
                            <span className="text-[19px] font-bold text-white tracking-tight font-['Spline_Sans_Mono']">{fmtM(f.adultPrice)}</span>
                          </div>
                          <span className={cn(
                            "inline-flex items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-[0.15em] rounded-full px-2 py-[2px] ring-1",
                            f.availableSeats < 10
                              ? "text-amber-200 bg-amber-400/10 ring-amber-300/30"
                              : "text-emerald-200 bg-emerald-400/10 ring-emerald-300/30"
                          )}>
                            <span className={cn("w-1 h-1 rounded-full", f.availableSeats < 10 ? "bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.9)]" : "bg-emerald-300 shadow-[0_0_6px_rgba(52,211,153,0.9)]")} />
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
                <div className="mx-5 mb-5 p-4 rounded-2xl bg-gradient-to-r from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.08] ring-1 ring-cyan-300/20 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Stat label="Çmim Adult" value={`€${fmtM(selectedFlight.adultPrice)}`} />
                  <Stat label="Çmim Fëmijë" value={`€${fmtM(selectedFlight.childPrice)}`} />
                  <Stat label="Çmim Foshnje" value={`€${fmtM(selectedFlight.infantPrice)}`} />
                  <Stat label="Taksa" value={`€${fmtM(selectedFlight.tax)}`} />
                </div>
              )}
            </section>

            {/* ---- Customer & Agency ---- */}
            <section className={cn("rounded-3xl", glass)}>
              <div className="h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent rounded-t-3xl" />
              <header className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-400/15 text-violet-300 ring-1 ring-violet-300/30 flex items-center justify-center"><Building2 className="w-4 h-4" /></div>
                <h3 className="text-sm font-bold tracking-wide text-white uppercase">Klienti & Agjencia</h3>
              </header>
              <div className="p-6 grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-5">
                  <GLabel accent="text-cyan-300">Emri i klientit *</GLabel>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input value={customerName} onChange={e => setCustomerName(e.target.value)} className={cn(glassInput, "pl-10 pr-3")} />
                  </div>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <GLabel accent="text-violet-300">Email</GLabel>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className={cn(glassInput, "pl-10 pr-3")} />
                  </div>
                </div>
                <div className="col-span-12 md:col-span-3">
                  <GLabel accent="text-sky-300">Telefon</GLabel>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className={cn(glassInput, "pl-10 pr-3")} />
                  </div>
                </div>

                <div className="col-span-12 md:col-span-6">
                  <GLabel accent="text-emerald-300">Agjencia (opsionale)</GLabel>
                  {(() => {
                    const current = selectedAgent;
                    const initials = current ? (current.company ?? current.name ?? "").slice(0, 2).toUpperCase() : "—";
                    return (
                      <div className="relative">
                        <button type="button" onClick={() => setAgentPickerOpen(o => !o)}
                          className={cn(glassInput, "px-3 flex items-center justify-between text-left")}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-400/40 to-violet-500/40 ring-1 ring-white/20 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                              {current ? initials : <Plus className="w-3 h-3" />}
                            </div>
                            <span className="text-sm font-semibold text-white truncate">
                              {current ? current.company || current.name : "Direct Booking"}
                            </span>
                            {current && current.commission != null && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-400/15 text-violet-200 ring-1 ring-violet-300/25 font-semibold shrink-0">
                                Komision {current.commission}%
                              </span>
                            )}
                          </div>
                          <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform", agentPickerOpen && "rotate-180")} />
                        </button>
                        {agentPickerOpen && (
                          <div className="absolute z-30 mt-2 w-full rounded-2xl bg-[#0d1330]/95 backdrop-blur-2xl ring-1 ring-white/15 shadow-[0_24px_60px_-12px_rgba(0,5,30,0.9)] overflow-hidden">
                            <div className="max-h-72 overflow-auto py-1.5">
                              <button type="button" onClick={() => { setAgentId(null); setAgentPickerOpen(false); }}
                                className="w-full flex items-center px-4 py-2.5 text-sm text-slate-200 hover:bg-cyan-400/10 text-left transition-colors">
                                <Check className={cn("mr-2.5 h-4 w-4 text-cyan-300", !agentId ? "opacity-100" : "opacity-0")} />
                                Direct Booking
                              </button>
                              {agents.map((a) => (
                                <button key={a.id} type="button" onClick={() => { setAgentId(a.id); setAgentPickerOpen(false); }}
                                  className="w-full flex items-center px-4 py-2.5 text-sm text-slate-200 hover:bg-cyan-400/10 text-left transition-colors">
                                  <Check className={cn("mr-2.5 h-4 w-4 text-cyan-300", agentId === a.id ? "opacity-100" : "opacity-0")} />
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
                <div className="col-span-12 md:col-span-3">
                  <GLabel accent="text-fuchsia-300">Komision ($)</GLabel>
                  <div className="relative">
                    <BadgePercent className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input type="number" value={commission} onChange={e => setCommission(e.target.value)} className={cn(glassInput, "pl-10 pr-3")} />
                  </div>
                </div>
                <div className="col-span-12 md:col-span-3">
                  <GLabel accent="text-amber-300">Zbritje (€)</GLabel>
                  <input type="number" min={0} step="0.01" placeholder="0" value={discount}
                    onChange={e => setDiscount(e.target.value)} className={cn(glassInput, "px-3")} />
                </div>
                <div className="col-span-12">
                  <GLabel accent="text-slate-300">Shënime të brendshme</GLabel>
                  <input placeholder="Kërkesa speciale, alergji, etj..." value={notes} onChange={e => setNotes(e.target.value)}
                    className={cn(glassInput, "px-3")} />
                </div>
              </div>
            </section>

            {/* ---- Passengers ---- */}
            <section className={cn("rounded-3xl", glass)}>
              <div className="h-px bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent rounded-t-3xl" />
              <header className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-300/30 flex items-center justify-center"><Users className="w-4 h-4" /></div>
                  <h3 className="text-sm font-bold tracking-wide text-white uppercase">Pasagjerët</h3>
                  <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-white/[0.08] text-cyan-200 ring-1 ring-white/10 font-['Spline_Sans_Mono']">{passengers.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  {(["adult", "child", "infant"] as const).map(t => (
                    <button key={t} type="button" onClick={() => appendPax(t)}
                      className="h-8 px-3 text-xs font-semibold text-slate-200 bg-white/[0.05] ring-1 ring-white/12 rounded-xl hover:ring-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100 transition-all flex items-center gap-1.5">
                      <Plus className="w-3 h-3" /> {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </header>

              <div className="p-5 flex flex-col gap-3">
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
                      "rounded-2xl overflow-hidden transition-all duration-300 ring-1",
                      expanded
                        ? "ring-cyan-300/35 bg-cyan-400/[0.05] shadow-[0_0_34px_-10px_rgba(56,189,248,0.5)]"
                        : "ring-white/10 bg-white/[0.03] hover:ring-white/20"
                    )}>
                      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                        <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left">
                          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br ring-1", typeGlow(paxType))}>
                            <PaxIcon type={paxType} className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col leading-tight min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white truncate">
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${index + 1}`}
                              </span>
                              <span className={cn("text-[9px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider shrink-0", typeChip(paxType))}>
                                {TYPE_LABEL[paxType]}
                              </span>
                            </div>
                            {p.dateOfBirth && (
                              <span className="text-[11px] text-slate-400">Datëlindja: <span className="font-['Spline_Sans_Mono']">{p.dateOfBirth}</span></span>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {p.hasSeatSelection && <span title="SEAT" className="w-6 h-6 rounded-lg bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-300/25 flex items-center justify-center"><Armchair className="w-3 h-3" /></span>}
                            {p.hasPriorityBoarding && <span title="Priority" className="w-6 h-6 rounded-lg bg-amber-400/15 text-amber-300 ring-1 ring-amber-300/25 flex items-center justify-center"><Zap className="w-3 h-3" /></span>}
                            {p.hasInsurance && <span title="Sigurim" className="w-6 h-6 rounded-lg bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/25 flex items-center justify-center"><ShieldCheck className="w-3 h-3" /></span>}
                            {p.baggageOption === "checked" && <span title="Bagazh" className="w-6 h-6 rounded-lg bg-white/[0.08] text-slate-300 ring-1 ring-white/15 flex items-center justify-center"><Briefcase className="w-3 h-3" /></span>}
                          </div>
                          <div className="hidden sm:flex items-center gap-2.5 pl-3 ml-1 border-l border-white/10" onClick={(e) => e.stopPropagation()}>
                            {origPrice != null && (
                              <>
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="text-[8px] uppercase tracking-[0.2em] font-bold text-slate-500">Origjinal</span>
                                  <span className={cn("text-[11px] font-semibold tabular-nums font-['Spline_Sans_Mono']", hasOverride ? "text-slate-500 line-through" : "text-slate-300")}>
                                    €{fmtM(origPrice)}
                                  </span>
                                </div>
                                <ArrowRight className="w-3 h-3 text-slate-600" />
                              </>
                            )}
                            <div className="flex flex-col items-end leading-tight">
                              <span className={cn("text-[8px] uppercase tracking-[0.2em] font-bold", hasOverride ? "text-emerald-300" : "text-slate-500")}>Çmimi €</span>
                              <input
                                type="text" inputMode="decimal"
                                value={p.ticketPrice ?? ""}
                                placeholder={origPrice != null ? String(origPrice) : "0.00"}
                                onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                                className={cn(
                                  "w-20 h-7 px-2 text-right rounded-lg text-sm font-bold text-white tabular-nums font-['Spline_Sans_Mono'] focus:outline-none transition-all",
                                  hasOverride
                                    ? "bg-emerald-400/10 ring-1 ring-emerald-300/50 focus:ring-2 focus:ring-emerald-300/60"
                                    : "bg-white/[0.06] ring-1 ring-white/15 focus:ring-2 focus:ring-cyan-300/50"
                                )}
                              />
                            </div>
                          </div>
                          {index > 0 && (
                            <button type="button" onClick={() => removePax(index)} className="text-slate-500 hover:text-rose-400 p-1 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                            className={cn("text-slate-500 hover:text-cyan-200 transition-transform duration-300", expanded && "rotate-180")}>
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="px-4 pb-5 pt-4 border-t border-white/[0.07] grid grid-cols-12 gap-3">
                          <div className="col-span-12 sm:col-span-4">
                            <GLabel>Tipi</GLabel>
                            <select value={p.type} onChange={(e) => updatePax(index, { type: e.target.value as Pax["type"] })}
                              className={cn(glassInput, "px-3 appearance-none bg-[#0d1330]")}>
                              <option value="adult">I rritur</option>
                              <option value="child">Fëmijë</option>
                              <option value="infant">Foshnje</option>
                            </select>
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <GLabel>Emri *</GLabel>
                            <input value={p.firstName} onChange={e => updatePax(index, { firstName: e.target.value })} className={cn(glassInput, "px-3")} />
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <GLabel>Mbiemri *</GLabel>
                            <input value={p.lastName} onChange={e => updatePax(index, { lastName: e.target.value })} className={cn(glassInput, "px-3")} />
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <GLabel>Datëlindja</GLabel>
                            <input type="date" value={p.dateOfBirth || ""} onChange={e => updatePax(index, { dateOfBirth: e.target.value })} className={cn(glassInput, "px-3")} />
                          </div>

                          {/* Price override — mobile */}
                          <div className="col-span-12 sm:hidden">
                            <GLabel>Çmimi € {origPrice != null ? `(origjinal €${fmtM(origPrice)})` : ""}</GLabel>
                            <input
                              type="text" inputMode="decimal"
                              value={p.ticketPrice ?? ""}
                              placeholder={origPrice != null ? String(origPrice) : "0.00"}
                              onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                              className={cn(glassInput, "px-3 text-right font-bold font-['Spline_Sans_Mono']", hasOverride && "ring-emerald-300/50")}
                            />
                          </div>

                          <div className="col-span-12 mt-1">
                            <GLabel>Ekstra</GLabel>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                              <ExtraChip on={p.baggageOption === "checked"}
                                onClick={() => updatePax(index, { baggageOption: p.baggageOption === "checked" ? "" : "checked" })}
                                icon={Briefcase} label="Bagazh"
                                price={selectedFlight?.checkedBaggagePrice ? `+€${selectedFlight.checkedBaggagePrice}` : ""} />
                              <ExtraChip on={p.hasSeatSelection} onClick={() => updatePax(index, { hasSeatSelection: !p.hasSeatSelection })}
                                icon={Armchair} label="SEAT"
                                price={selectedFlight?.seatSelectionPrice ? `+€${selectedFlight.seatSelectionPrice}` : ""} />
                              <ExtraChip on={p.hasPriorityBoarding} onClick={() => updatePax(index, { hasPriorityBoarding: !p.hasPriorityBoarding })}
                                icon={Zap} label="Priority"
                                price={selectedFlight?.priorityBoardingPrice ? `+€${selectedFlight.priorityBoardingPrice}` : ""} />
                              <ExtraChip on={p.hasInsurance} onClick={() => updatePax(index, { hasInsurance: !p.hasInsurance })}
                                icon={ShieldCheck} label="Sigurim"
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

          {/* ===== Sidebar ===== */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-32 flex flex-col gap-4">
              <div className={cn("rounded-3xl overflow-hidden", glass)}>
                <header className="relative px-6 py-4 bg-gradient-to-r from-cyan-400/15 via-violet-500/15 to-fuchsia-500/15 border-b border-white/[0.08]">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-300/0 via-cyan-300/80 to-violet-300/0" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Receipt className="w-4 h-4 text-cyan-200" />
                      <h3 className="text-sm font-bold text-white tracking-wide uppercase">Përmbledhje Rezervimi</h3>
                    </div>
                    <span className="text-[9px] uppercase font-bold tracking-[0.2em] px-2 py-1 rounded-full bg-cyan-300 text-[#070b1c] shadow-[0_0_16px_rgba(103,232,249,0.6)]">I Ri</span>
                  </div>
                </header>
                <div className="p-6">
                  {/* Boarding-pass flight summary */}
                  {selectedFlight ? (
                    <div className="relative rounded-2xl bg-white/[0.04] ring-1 ring-cyan-300/20 p-4 mb-5 overflow-hidden">
                      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-cyan-400/15 blur-2xl pointer-events-none" />
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] uppercase font-bold text-cyan-300 tracking-[0.28em]">Fluturimi</span>
                        <span className="text-[10px] font-['Spline_Sans_Mono'] text-slate-400">{selectedFlight.departureDate}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-white leading-none font-['Spline_Sans_Mono'] tracking-tight">{selectedFlight.fromAirport || selectedFlight.fromCity}</div>
                          <div className="text-[10px] text-cyan-300/80 mt-1 font-['Spline_Sans_Mono']">{fmtAmPm(selectedFlight.departureTime)}</div>
                        </div>
                        <div className="flex-1 px-3 flex flex-col items-center">
                          <Plane className="w-3.5 h-3.5 text-white rotate-90 drop-shadow-[0_0_6px_rgba(56,189,248,0.9)]" />
                          <div className="w-full h-px bg-gradient-to-r from-cyan-300/10 via-cyan-300/60 to-violet-300/10 my-1" />
                          <span className="text-[9px] uppercase tracking-[0.3em] text-slate-500">Direkt</span>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-white leading-none font-['Spline_Sans_Mono'] tracking-tight">{selectedFlight.toAirport || selectedFlight.toCity}</div>
                          <div className="text-[10px] text-violet-300/80 mt-1 font-['Spline_Sans_Mono']">{fmtAmPm(selectedFlight.arrivalTime)}</div>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-dashed border-white/15 flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-200">{selectedFlight.airline} {fmtFlightNum(selectedFlight.flightNumber)}</span>
                        <span className="font-['Spline_Sans_Mono'] text-slate-400">€{fmtM(selectedFlight.adultPrice)} bazë</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/15 p-5 mb-5 text-center text-xs text-slate-400">
                      Zgjidh një fluturim
                    </div>
                  )}

                  {/* Per-passenger */}
                  {selectedFlight && passengers.length > 0 && (
                    <div className="space-y-1 text-sm tabular-nums mb-4">
                      <div className="text-[9px] uppercase tracking-[0.28em] font-bold text-slate-500 mb-2">Çmimi për pasagjer</div>
                      {passengers.map((p, i) => {
                        const base = p.type === "adult" ? selectedFlight.adultPrice
                          : p.type === "child" ? selectedFlight.childPrice
                          : selectedFlight.infantPrice;
                        const ov = p.ticketPrice;
                        const hasOv = ov != null && ov !== "" && !Number.isNaN(Number(ov)) && Number(ov) !== Number(base);
                        const finalPrice = hasOv ? Number(ov) : Number(base);
                        return (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[0.06] last:border-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br ring-1", typeGlow(p.type))}>
                                <PaxIcon type={p.type} className="w-3 h-3" />
                              </div>
                              <span className="text-[12px] font-semibold text-slate-200 truncate">
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${i + 1}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 tabular-nums font-['Spline_Sans_Mono']">
                              {hasOv && (
                                <span className="text-[10px] text-slate-500 line-through">€{fmtM(base)}</span>
                              )}
                              <span className={cn("text-[13px] font-bold", hasOv ? "text-emerald-300" : "text-slate-200")}>€{fmtM(finalPrice)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Totals */}
                  <div className="space-y-2.5 text-sm tabular-nums">
                    <SumRow label={`Biletat × ${passengers.length}`} value={`€${fmtM(totals.ticket)}`} />
                    {totals.discount > 0 && (
                      <SumRow label="Zbritje Agjenti" value={`−€${fmtM(totals.discount)}`} tone="green" />
                    )}
                    {totals.manualDiscount > 0 && (
                      <SumRow label="Zbritje manuale" value={`−€${fmtM(totals.manualDiscount)}`} tone="rose" />
                    )}
                    <SumRow label="Taksa" value={`€${fmtM(totals.tax)}`} />
                    <SumRow label="Ekstra" value={`€${fmtM(totals.extras)}`} />
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-slate-400">Markup</span>
                      <input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)}
                        className={cn(glassInput, "w-24 h-8 px-2 text-right font-semibold font-['Spline_Sans_Mono']")} />
                    </div>
                  </div>

                  {/* Total */}
                  <div className="mt-5 pt-4 border-t border-white/10">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.28em]">Total Klienti</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-cyan-300 font-bold">€</span>
                        <span className="text-4xl font-bold text-white tabular-nums font-['Spline_Sans_Mono'] tracking-tight drop-shadow-[0_0_18px_rgba(56,189,248,0.35)]">{fmtM(totals.total)}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]" />
                      Pagesa menaxhohet pas konfirmimit
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="px-6 py-5 border-t border-white/[0.07] bg-white/[0.02] flex flex-col gap-2.5">
                  <button type="submit" disabled={!selectedFlight}
                    className="group h-12 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 text-[#070b1c] font-bold text-sm tracking-wide shadow-[0_0_36px_-6px_rgba(56,189,248,0.8)] hover:shadow-[0_0_48px_-4px_rgba(56,189,248,0.95)] hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                    Konfirmo Rezervimin <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </button>
                  <button type="button" onClick={() => noop("/bookings")}
                    className="h-9 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors">Anulo</button>
                </div>
              </div>

              {selectedAgent && (
                <div className="rounded-2xl bg-gradient-to-br from-violet-400/[0.1] to-fuchsia-400/[0.06] ring-1 ring-violet-300/25 backdrop-blur-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400/40 to-fuchsia-500/40 ring-1 ring-violet-300/40 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-violet-100" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-violet-100 mb-0.5">Agjenti i Zgjedhur</div>
                      <div className="text-[11px] text-violet-200/80 leading-relaxed">
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

// ============ Helpers ============

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all font-['Spline_Sans_Mono']",
        done ? "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-300/50 shadow-[0_0_16px_-2px_rgba(52,211,153,0.6)]"
          : active ? "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/60 shadow-[0_0_20px_-2px_rgba(56,189,248,0.7)]"
          : "bg-white/[0.05] text-slate-500 ring-1 ring-white/10"
      )}>
        {done ? <Check className="w-4 h-4" /> : n}
      </div>
      <div className="hidden sm:flex flex-col leading-tight">
        <span className={cn("text-[9px] uppercase font-bold tracking-[0.22em]",
          active ? "text-cyan-300" : done ? "text-emerald-300" : "text-slate-600"
        )}>Hapi {n}</span>
        <span className={cn("text-sm font-semibold",
          active || done ? "text-white" : "text-slate-500"
        )}>{label}</span>
      </div>
    </div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return (
    <div className="flex-1 h-px relative overflow-hidden rounded-full bg-white/10">
      <div className={cn("absolute inset-0 transition-all duration-500", done ? "bg-gradient-to-r from-emerald-300/70 to-cyan-300/70" : "bg-transparent")} />
    </div>
  );
}

function GLabel({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return <label className={cn("text-[9px] uppercase tracking-[0.24em] font-bold mb-1.5 block", accent ?? "text-slate-400")}>{children}</label>;
}

function ExtraChip({ on, onClick, icon: Icon, label, price }: {
  on: boolean; onClick: () => void; icon: any; label: string; price?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-left ring-1",
        on
          ? "ring-emerald-300/50 bg-emerald-400/[0.09] shadow-[0_0_20px_-6px_rgba(52,211,153,0.55)]"
          : "ring-white/10 bg-white/[0.04] hover:ring-white/25 hover:bg-white/[0.06]"
      )}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
          on ? "bg-emerald-400/25 text-emerald-200" : "bg-white/[0.07] text-slate-400"
        )}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col items-start leading-tight min-w-0">
          <span className={cn("text-[12px] font-semibold truncate", on ? "text-emerald-100" : "text-slate-300")}>{label}</span>
          {price && <span className="text-[10px] text-slate-500 font-['Spline_Sans_Mono']">{price}</span>}
        </div>
      </div>
      <div className={cn("w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all",
        on ? "bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.8)]" : "ring-1 ring-white/25"
      )}>
        {on && <Check className="w-2.5 h-2.5 text-[#070b1c]" />}
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.24em] font-bold text-cyan-300/80">{label}</div>
      <div className="text-base font-bold text-white tabular-nums font-['Spline_Sans_Mono'] mt-0.5">{value}</div>
    </div>
  );
}

function SumRow({ label, value, tone }: { label: string; value: string; tone?: "green" | "rose" }) {
  return (
    <div className={cn(
      "flex justify-between items-center text-sm",
      tone === "green" && "text-emerald-300 font-medium bg-emerald-400/[0.08] ring-1 ring-emerald-300/20 rounded-lg px-2.5 py-1",
      tone === "rose" && "text-rose-300 font-medium bg-rose-400/[0.08] ring-1 ring-rose-300/20 rounded-lg px-2.5 py-1"
    )}>
      <span className={cn(!tone && "text-slate-400")}>{label}</span>
      <span className="font-semibold font-['Spline_Sans_Mono']">{value}</span>
    </div>
  );
}
