import './_group.css';
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Plane, Search, Calendar, ArrowRight, Users, User, Baby, Plus, Trash2,
  Briefcase, ShieldCheck, Armchair, Zap, ChevronDown, Building2, FileText,
  Check, ChevronRight, Receipt, BadgePercent, Sparkles,
} from "lucide-react";

// ============ Inlined display helpers (from flight-system/src/lib/utils) ============
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
function typeBadgeClass(t: string) {
  if (t === "infant") return "bg-pink-100 text-pink-700";
  if (t === "child") return "bg-amber-100 text-amber-700";
  return "bg-slate-200 text-slate-700";
}
function typeAvatarClass(t: string) {
  if (t === "infant") return "bg-pink-100 text-pink-700";
  if (t === "child") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

export default function BookingNewPremium() {
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
    if (!selectedFlight) return { ticket: 0, tax: 0, extras: 0, markup: watchedMarkup, discount: 0, discountPct: 0, discountFixed: 0, discountType: "percent", manualDiscount: watchedManualDiscount, total: 0 };
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
    return {
      ticket: ticketGross, tax, extras: extrasCost, markup: watchedMarkup,
      discount: discountVal, discountPct: 0, discountFixed: 0, discountType: "percent",
      manualDiscount, total,
    };
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
    <div className="booking-premium-scope min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
      <form onSubmit={onSubmit}>
        {/* Top bar */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="px-4 md:px-8 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-200">
                <Plane className="w-4 h-4 text-white -rotate-45" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Kings Management</span>
                <span className="text-sm font-bold text-slate-900">Rezervim i Ri</span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
              <span>Operacionet</span>
              <ChevronRight className="w-3 h-3" />
              <span>Rezervimet</span>
              <ChevronRight className="w-3 h-3" />
              <span className="font-semibold text-slate-900">I Ri</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => noop("/bookings")}
                className="h-9 px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Anulo</button>
              <button type="submit" disabled={!selectedFlight}
                className="hidden sm:flex h-9 px-3 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg items-center gap-1.5 disabled:opacity-50">
                <FileText className="w-3.5 h-3.5" /> Krijo
              </button>
            </div>
          </div>
          {/* Stepper */}
          <div className="px-4 md:px-8 py-3 border-t border-slate-100 bg-gradient-to-r from-slate-50/50 via-white to-slate-50/50">
            <div className="flex items-center gap-3 max-w-5xl mx-auto">
              <StepBubble n={1} label="Fluturimi" done={stepFlight} active={!stepFlight} />
              <StepLine done={stepFlight} />
              <StepBubble n={2} label="Pasagjerët" done={stepPax} active={stepFlight && !stepPax} />
              <StepLine done={stepPax} />
              <StepBubble n={3} label="Konfirmim" done={false} active={stepPax} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main column */}
          <div className="lg:col-span-8 flex flex-col gap-5">

            {/* Flight Selection */}
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center",
                    selectedFlight ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                  )}>
                    {selectedFlight ? <Check className="w-4 h-4" /> : <Plane className="w-4 h-4" />}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {selectedFlight ? "Fluturimi i Zgjedhur" : "Zgjidh Fluturimin"}
                  </h3>
                </div>
              </header>

              {/* Search bar */}
              <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100 grid grid-cols-12 gap-2">
                <div className="col-span-12 md:col-span-4">
                  <PremiumInput icon={Plane} value={searchFrom} onChange={setSearchFrom} placeholder="Nga (qytet/aeroport)" />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <PremiumInput icon={Plane} value={searchTo} onChange={setSearchTo} placeholder="Për (qytet/aeroport)" />
                </div>
                <div className="col-span-10 md:col-span-3">
                  <PremiumInput icon={Calendar} type="date" value={searchDate} onChange={setSearchDate} placeholder="Data" />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <div className="h-10 w-full rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-sm shadow-blue-200">
                    <Search className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div className="p-4 flex flex-col gap-2">
                {!hasSearch ? (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
                    <Search className="w-6 h-6 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">Plotësoni fushat sipër për të kërkuar fluturim.</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
                    <p className="text-sm text-slate-500">Asnjë fluturim nuk u gjet.</p>
                  </div>
                ) : filtered.slice(0, 30).map((f) => {
                  const selected = selectedFlightId === f.id;
                  const dep = fmtAmPm(f.departureTime) || "—";
                  const arr = fmtAmPm(f.arrivalTime) || "—";
                  return (
                    <button key={f.id} type="button" onClick={() => setSelectedFlightId(f.id)}
                      className={cn(
                        "group relative w-full text-left rounded-md border transition-all duration-150",
                        selected
                          ? "border-slate-900 bg-gradient-to-r from-slate-50 to-white shadow-[0_1px_8px_rgba(15,23,42,0.10)] ring-1 ring-slate-900/10"
                          : f.isConfirmed
                          ? "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300"
                          : "border-slate-300 bg-gradient-to-r from-[#faf8f3] to-white hover:from-amber-50 hover:to-amber-50/40 hover:border-amber-400 hover:shadow-[0_1px_6px_rgba(180,140,50,0.15)]"
                      )}
                    >
                      <div className={cn(
                        "absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md transition-all",
                        selected ? "bg-gradient-to-b from-amber-400 via-amber-500 to-amber-400" : "bg-transparent group-hover:bg-slate-300"
                      )} />
                      {selected && (
                        <div className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-slate-900 text-amber-400 flex items-center justify-center shadow">
                          <Check className="w-2.5 h-2.5" />
                        </div>
                      )}
                      <div className="pl-4 pr-3 py-1 flex items-center gap-3">
                        <div className={cn(
                          "w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors",
                          selected ? "bg-slate-900" : "bg-slate-100 group-hover:bg-slate-900"
                        )}>
                          <Plane className={cn("w-3 h-3 -rotate-45 transition-colors", selected ? "text-amber-400" : "text-slate-500 group-hover:text-amber-400")} />
                        </div>
                        <div className="flex-shrink-0 min-w-0 w-[92px]">
                          <div className="text-[12px] font-semibold tracking-wide text-slate-900 truncate leading-tight flex items-center gap-1">
                            {f.isConfirmed && <span title="Fluturim i Konfirmuar" className="inline-flex items-center justify-center bg-black rounded w-3.5 h-3.5 text-[9px] leading-none shrink-0">⭐</span>}
                            {f.airline}
                          </div>
                          <div className="text-[9.5px] text-slate-400 font-mono tracking-wider">{fmtFlightNum(f.flightNumber)}</div>
                        </div>
                        {/* Desktop: orari + aeroportet */}
                        <div className="hidden md:flex items-center gap-3 flex-1 justify-center min-w-0">
                          <div className="text-right">
                            <div className="text-[13px] font-semibold text-slate-900 leading-tight tabular-nums">{dep}</div>
                            <div className="text-[9px] uppercase tracking-[0.12em] text-slate-400">{f.fromAirport || f.fromCity}</div>
                          </div>
                          <div className="flex flex-col items-center gap-[3px] px-1.5 min-w-[76px]">
                            <div className="text-[10px] font-medium text-slate-600 tabular-nums leading-none">{f.departureDate}</div>
                            <div className="relative w-16 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent">
                              <div className="absolute -top-[2.5px] left-0 w-[5px] h-[5px] rounded-full border border-slate-300 bg-white" />
                              <Plane className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 text-amber-500 rotate-90" />
                              <div className="absolute -top-[2.5px] right-0 w-[5px] h-[5px] rounded-full border border-slate-300 bg-white" />
                            </div>
                            <div className="text-[7.5px] uppercase tracking-[0.18em] text-slate-400 leading-none">Direkt</div>
                          </div>
                          <div className="text-left">
                            <div className="text-[13px] font-semibold text-slate-900 leading-tight tabular-nums">{arr}</div>
                            <div className="text-[9px] uppercase tracking-[0.12em] text-slate-400">{f.toAirport || f.toCity}</div>
                          </div>
                        </div>
                        {/* Mobile: orari + rruga */}
                        <div className="md:hidden flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 tabular-nums leading-tight">
                            <span>{dep}</span>
                            <Plane className="w-2.5 h-2.5 text-amber-500 rotate-90 shrink-0" />
                            <span>{arr}</span>
                          </div>
                          <div className="text-[9.5px] text-slate-400 truncate">{(f.fromAirport || f.fromCity)} → {(f.toAirport || f.toCity)} · {f.departureDate}</div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-0.5 shrink-0 pl-3 border-l border-slate-100">
                          <div className="flex items-start gap-[1px] tabular-nums leading-none">
                            <span className="text-[10px] font-semibold text-amber-600 mt-[1px]">€</span>
                            <span className="text-[17px] font-bold text-slate-800 tracking-tight" style={{ fontFeatureSettings: '"tnum"' }}>{fmtM(f.adultPrice)}</span>
                          </div>
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.1em] rounded-full px-1.5 py-[1px]",
                            f.availableSeats < 10
                              ? "text-amber-700 bg-amber-50 ring-1 ring-amber-200/70"
                              : "text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200/70"
                          )}>
                            <span className={cn("w-1 h-1 rounded-full", f.availableSeats < 10 ? "bg-amber-500" : "bg-emerald-500")} />
                            +{f.availableSeats} VENDE
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedFlight && (
                <div className="mx-4 mb-4 p-3 rounded-xl bg-gradient-to-r from-blue-50/60 to-indigo-50/30 border border-blue-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <Stat label="Çmim Adult" value={`€${fmtM(selectedFlight.adultPrice)}`} />
                  <Stat label="Çmim Fëmijë" value={`€${fmtM(selectedFlight.childPrice)}`} />
                  <Stat label="Çmim Foshnje" value={`€${fmtM(selectedFlight.infantPrice)}`} />
                  <Stat label="Taksa" value={`€${fmtM(selectedFlight.tax)}`} />
                </div>
              )}
            </section>

            {/* Customer & Agency */}
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
              <header className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center"><Building2 className="w-4 h-4" /></div>
                <h3 className="text-sm font-bold text-slate-900">Klienti & Agjencia</h3>
              </header>
              <div className="p-5 grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-5 rounded-xl border-l-4 border-blue-400 bg-blue-50/40 p-3 pl-4">
                  <FieldLabel><span className="text-blue-700">Emri i klientit *</span></FieldLabel>
                  <RawInput icon={User} value={customerName} onChange={(e: any) => setCustomerName(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-4 rounded-xl border-l-4 border-indigo-400 bg-indigo-50/40 p-3 pl-4">
                  <FieldLabel><span className="text-indigo-700">Email</span></FieldLabel>
                  <RawInput type="email" value={customerEmail} onChange={(e: any) => setCustomerEmail(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-3 rounded-xl border-l-4 border-cyan-400 bg-cyan-50/40 p-3 pl-4">
                  <FieldLabel><span className="text-cyan-700">Telefon</span></FieldLabel>
                  <RawInput value={customerPhone} onChange={(e: any) => setCustomerPhone(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-6 rounded-xl border-l-4 border-emerald-400 bg-emerald-50/40 p-3 pl-4">
                  <FieldLabel><span className="text-emerald-700">Agjencia (opsionale)</span></FieldLabel>
                  {(() => {
                    const current = selectedAgent;
                    const initials = current ? (current.company ?? current.name ?? "").slice(0, 2).toUpperCase() : "—";
                    return (
                      <div className="relative">
                        <button type="button" onClick={() => setAgentPickerOpen(o => !o)}
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between hover:border-slate-300">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                              {current ? initials : <Plus className="w-3 h-3" />}
                            </div>
                            <span className="text-sm font-medium text-slate-900 truncate">
                              {current ? current.company || current.name : "Direct Booking"}
                            </span>
                            {current && current.commission != null && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-semibold shrink-0">
                                Komision {current.commission}%
                              </span>
                            )}
                          </div>
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        </button>
                        {agentPickerOpen && (
                          <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
                            <div className="max-h-72 overflow-auto py-1">
                              <button type="button" onClick={() => { setAgentId(null); setAgentPickerOpen(false); }}
                                className="w-full flex items-center px-3 py-2 text-sm hover:bg-slate-50 text-left">
                                <Check className={cn("mr-2 h-4 w-4", !agentId ? "opacity-100" : "opacity-0")} />
                                Direct Booking
                              </button>
                              {agents.map((a) => (
                                <button key={a.id} type="button" onClick={() => { setAgentId(a.id); setAgentPickerOpen(false); }}
                                  className="w-full flex items-center px-3 py-2 text-sm hover:bg-slate-50 text-left">
                                  <Check className={cn("mr-2 h-4 w-4", agentId === a.id ? "opacity-100" : "opacity-0")} />
                                  {a.name} <span className="text-slate-400 ml-1">({a.company})</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="col-span-12 md:col-span-3 rounded-xl border-l-4 border-violet-400 bg-violet-50/40 p-3 pl-4">
                  <FieldLabel><span className="text-violet-700">Komision ($)</span></FieldLabel>
                  <RawInput type="number" icon={BadgePercent} value={commission} onChange={(e: any) => setCommission(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-3 rounded-xl border-l-4 border-amber-400 bg-amber-50/40 p-3 pl-4">
                  <FieldLabel><span className="text-amber-700">Zbritje (€)</span></FieldLabel>
                  <RawInput type="number" min={0} step="0.01" placeholder="0" value={discount}
                    onChange={(e: any) => setDiscount(e.target.value)} />
                </div>
                <div className="col-span-12 rounded-xl border-l-4 border-slate-400 bg-slate-50/60 p-3 pl-4">
                  <FieldLabel><span className="text-slate-700">Shënime të brendshme</span></FieldLabel>
                  <RawInput placeholder="Kërkesa speciale, alergji, etj..." value={notes} onChange={(e: any) => setNotes(e.target.value)} />
                </div>
              </div>
            </section>

            {/* Passengers */}
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
              <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center"><Users className="w-4 h-4" /></div>
                  <h3 className="text-sm font-bold text-slate-900">Pasagjerët</h3>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">{passengers.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {(["adult", "child", "infant"] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => appendPax(t)}
                      className="h-8 px-2.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </header>

              <div className="p-4 flex flex-col gap-3">
                {passengers.map((p, index) => {
                  const expanded = expandedIdx === index;
                  const paxType = p.type || "adult";
                  const origPrice = selectedFlight
                    ? (paxType === "adult" ? selectedFlight.adultPrice : paxType === "child" ? selectedFlight.childPrice : selectedFlight.infantPrice)
                    : null;
                  return (
                    <div key={p.id} className={cn(
                      "rounded-xl border overflow-hidden transition-all",
                      expanded ? "border-blue-300 bg-blue-50/30 shadow-sm" : "border-slate-200 bg-white"
                    )}>
                      <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                        <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left">
                          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", typeAvatarClass(paxType))}>
                            <PaxIcon type={paxType} className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col leading-tight min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-900 truncate">
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${index + 1}`}
                              </span>
                              <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0", typeBadgeClass(paxType))}>
                                {TYPE_LABEL[paxType]}
                              </span>
                            </div>
                            {p.dateOfBirth && (
                              <span className="text-[11px] text-slate-500">Datëlindja: <span className="font-mono">{p.dateOfBirth}</span></span>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {p.hasSeatSelection && <span title="SEAT" className="w-6 h-6 rounded bg-blue-50 text-blue-700 flex items-center justify-center"><Armchair className="w-3 h-3" /></span>}
                            {p.hasPriorityBoarding && <span title="Priority" className="w-6 h-6 rounded bg-amber-50 text-amber-700 flex items-center justify-center"><Zap className="w-3 h-3" /></span>}
                            {p.hasInsurance && <span title="Sigurim" className="w-6 h-6 rounded bg-emerald-50 text-emerald-700 flex items-center justify-center"><ShieldCheck className="w-3 h-3" /></span>}
                            {p.baggageOption === "checked" && <span title="Bagazh" className="w-6 h-6 rounded bg-slate-100 text-slate-700 flex items-center justify-center"><Briefcase className="w-3 h-3" /></span>}
                          </div>
                          {(() => {
                            const override = p.ticketPrice;
                            const hasOverride = override != null && override !== "" && !Number.isNaN(Number(override)) && (origPrice == null || Number(override) !== Number(origPrice));
                            return (
                              <div className="hidden sm:flex items-center gap-2 pl-2 ml-1 border-l border-slate-200" onClick={(e) => e.stopPropagation()}>
                                {origPrice != null && (
                                  <>
                                    <div className="flex flex-col items-end leading-tight">
                                      <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Origjinal</span>
                                      <span className={cn("text-[11px] font-semibold tabular-nums", hasOverride ? "text-slate-400 line-through decoration-slate-300" : "text-slate-600")}>
                                        €{fmtM(origPrice)}
                                      </span>
                                    </div>
                                    <ArrowRight className="w-3 h-3 text-slate-300" />
                                  </>
                                )}
                                <div className="flex flex-col items-end leading-tight">
                                  <span className={cn("text-[9px] uppercase tracking-wider font-bold", hasOverride ? "text-emerald-600" : "text-slate-400")}>Çmimi €</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={p.ticketPrice ?? ""}
                                    placeholder={origPrice != null ? String(origPrice) : "0.00"}
                                    onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                                    className={cn(
                                      "w-20 h-7 px-2 text-right rounded-md border-2 text-sm font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500",
                                      hasOverride ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"
                                    )}
                                  />
                                </div>
                              </div>
                            );
                          })()}
                          {index > 0 && (
                            <button type="button" onClick={() => removePax(index)} className="text-slate-400 hover:text-rose-600 p-1">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                            className={cn("text-slate-400 hover:text-slate-700 transition-transform", expanded && "rotate-180")}>
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="px-4 pb-4 border-t border-blue-200/50 pt-3 grid grid-cols-12 gap-3 bg-white">
                          <div className="col-span-12 sm:col-span-4">
                            <FieldLabel>Tipi</FieldLabel>
                            <select value={p.type} onChange={(e) => updatePax(index, { type: e.target.value as Pax["type"] })}
                              className="h-10 w-full px-3 rounded-lg border border-slate-200 bg-white text-sm hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none">
                              <option value="adult">I rritur</option>
                              <option value="child">Fëmijë</option>
                              <option value="infant">Foshnje</option>
                            </select>
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <FieldLabel>Emri *</FieldLabel>
                            <RawInput value={p.firstName} onChange={(e: any) => updatePax(index, { firstName: e.target.value })} />
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <FieldLabel>Mbiemri *</FieldLabel>
                            <RawInput value={p.lastName} onChange={(e: any) => updatePax(index, { lastName: e.target.value })} />
                          </div>

                          <div className="col-span-12 sm:col-span-4">
                            <FieldLabel>Datëlindja</FieldLabel>
                            <RawInput type="date" value={p.dateOfBirth || ""} onChange={(e: any) => updatePax(index, { dateOfBirth: e.target.value })} />
                          </div>

                          {/* Çmimi i modifikuar — mobile */}
                          <div className="col-span-12 sm:hidden">
                            {(() => {
                              const hasOverride = p.ticketPrice != null && p.ticketPrice !== "" && !Number.isNaN(Number(p.ticketPrice)) && (origPrice == null || Number(p.ticketPrice) !== Number(origPrice));
                              return (
                                <>
                                  <FieldLabel>Çmimi € {origPrice != null ? `(origjinal €${fmtM(origPrice)})` : ""}</FieldLabel>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={p.ticketPrice ?? ""}
                                    placeholder={origPrice != null ? String(origPrice) : "0.00"}
                                    onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                                    className={cn(
                                      "h-10 w-full px-3 text-right rounded-lg border-2 text-sm font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500",
                                      hasOverride ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"
                                    )}
                                  />
                                </>
                              );
                            })()}
                          </div>

                          <div className="col-span-12 mt-1">
                            <FieldLabel>Ekstra</FieldLabel>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <ToggleBtn
                                on={p.baggageOption === "checked"}
                                onClick={() => updatePax(index, { baggageOption: p.baggageOption === "checked" ? "" : "checked" })}
                                icon={Briefcase}
                                label="Bagazh"
                                price={selectedFlight?.checkedBaggagePrice ? `+€${selectedFlight.checkedBaggagePrice}` : ""}
                              />
                              <ToggleBtn on={p.hasSeatSelection} onClick={() => updatePax(index, { hasSeatSelection: !p.hasSeatSelection })} icon={Armchair} label="SEAT"
                                price={selectedFlight?.seatSelectionPrice ? `+€${selectedFlight.seatSelectionPrice}` : ""} />
                              <ToggleBtn on={p.hasPriorityBoarding} onClick={() => updatePax(index, { hasPriorityBoarding: !p.hasPriorityBoarding })} icon={Zap} label="Priority"
                                price={selectedFlight?.priorityBoardingPrice ? `+€${selectedFlight.priorityBoardingPrice}` : ""} />
                              <ToggleBtn on={p.hasInsurance} onClick={() => updatePax(index, { hasInsurance: !p.hasInsurance })} icon={ShieldCheck} label="Sigurim"
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

          {/* Sidebar */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-32 flex flex-col gap-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <header className="px-5 py-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4" />
                      <h3 className="text-sm font-bold">Përmbledhje Rezervimi</h3>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-400 text-slate-900">I Ri</span>
                  </div>
                </header>
                <div className="p-5">
                  {/* Flight summary */}
                  {selectedFlight ? (
                    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/30 border border-blue-100 p-3 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">Fluturimi</span>
                        <span className="text-[10px] font-semibold text-slate-500">{selectedFlight.departureDate}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-center">
                          <div className="text-lg font-bold text-slate-900 leading-none">{selectedFlight.fromAirport || selectedFlight.fromCity}</div>
                          <div className="text-[10px] text-slate-500">{fmtAmPm(selectedFlight.departureTime)}</div>
                        </div>
                        <div className="flex-1 px-2 flex flex-col items-center">
                          <Plane className="w-3 h-3 text-blue-500 rotate-90" />
                          <div className="w-full h-px bg-slate-300 my-0.5" />
                          <span className="text-[10px] text-slate-400">Direkt</span>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-slate-900 leading-none">{selectedFlight.toAirport || selectedFlight.toCity}</div>
                          <div className="text-[10px] text-slate-500">{fmtAmPm(selectedFlight.arrivalTime)}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="font-medium text-slate-700">{selectedFlight.airline} {fmtFlightNum(selectedFlight.flightNumber)}</span>
                        <span className="font-mono text-slate-500">€{fmtM(selectedFlight.adultPrice)} bazë</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-slate-200 p-4 mb-4 text-center text-xs text-slate-500">
                      Zgjidh një fluturim
                    </div>
                  )}

                  {/* Per-passenger breakdown */}
                  {selectedFlight && passengers.length > 0 && (
                    <div className="space-y-1 text-sm tabular-nums mb-3">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Çmimi për pasagjer</div>
                      {passengers.map((p, i) => {
                        const base = p.type === "adult" ? selectedFlight.adultPrice
                          : p.type === "child" ? selectedFlight.childPrice
                          : selectedFlight.infantPrice;
                        const ov = p.ticketPrice;
                        const hasOv = ov != null && ov !== "" && !Number.isNaN(Number(ov)) && Number(ov) !== Number(base);
                        const finalPrice = hasOv ? Number(ov) : Number(base);
                        return (
                          <div key={i} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", typeAvatarClass(p.type))}>
                                <PaxIcon type={p.type} className="w-3 h-3" />
                              </div>
                              <span className="text-[12px] font-semibold text-slate-800 truncate">
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${i + 1}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 tabular-nums">
                              {hasOv && (
                                <span className="text-[10px] text-slate-400 line-through decoration-slate-300">€{fmtM(base)}</span>
                              )}
                              <span className={cn("text-[13px] font-bold", hasOv ? "text-emerald-700" : "text-slate-700")}>€{fmtM(finalPrice)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Totals breakdown */}
                  <div className="space-y-2 text-sm tabular-nums">
                    <SumRow label={`Biletat × ${passengers.length}`} value={`€${fmtM(totals.ticket)}`} />
                    {totals.discount > 0 && (
                      <SumRow
                        label={totals.discountType === "fixed" ? `Zbritje Agjenti (−€${fmtM(totals.discountFixed)})` : `Zbritje Agjenti (${totals.discountPct}%)`}
                        value={`−€${fmtM(totals.discount)}`} tone="green"
                      />
                    )}
                    {totals.manualDiscount > 0 && (
                      <SumRow label="Zbritje manuale" value={`−€${fmtM(totals.manualDiscount)}`} tone="rose" />
                    )}
                    <SumRow label="Taksa" value={`€${fmtM(totals.tax)}`} />
                    <SumRow label="Ekstra" value={`€${fmtM(totals.extras)}`} />
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Markup</span>
                      <input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)}
                        className="w-24 h-8 px-2 text-right rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500" />
                    </div>
                  </div>

                  {/* Total */}
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Total Klienti</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs text-slate-400 font-semibold">€</span>
                        <span className="text-3xl font-bold text-slate-900 tabular-nums">{fmtM(totals.total)}</span>
                      </div>
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Pagesa menaxhohet pas konfirmimit
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="px-5 py-4 bg-slate-50/50 border-t border-slate-200 flex flex-col gap-2">
                  <button type="submit" disabled={!selectedFlight}
                    className="h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-sm shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    Konfirmo Rezervimin <ArrowRight className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => noop("/bookings")}
                    className="h-9 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Anulo</button>
                </div>
              </div>

              {selectedAgent && (
                <div className="rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200/60 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-violet-900 mb-0.5">Agjenti i Zgjedhur</div>
                      <div className="text-[11px] text-violet-700 leading-relaxed">
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

function StepBubble({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn(
        "relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
        done ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
          : active ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200 ring-4 ring-blue-100"
          : "bg-white text-slate-400 border border-slate-200"
      )}>
        {done ? <Check className="w-4 h-4" /> : n}
      </div>
      <div className="hidden sm:flex flex-col leading-tight">
        <span className={cn("text-[10px] uppercase font-bold tracking-wider",
          active ? "text-blue-700" : done ? "text-emerald-700" : "text-slate-400"
        )}>Hapi {n}</span>
        <span className={cn("text-sm font-semibold",
          active || done ? "text-slate-900" : "text-slate-400"
        )}>{label}</span>
      </div>
    </div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return <div className={cn("flex-1 h-px", done ? "bg-emerald-400" : "bg-slate-200")} />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1 block">{children}</label>;
}

const RawInput = ({ icon: Icon, className, ...props }: any) => (
  <div className="relative">
    {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />}
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-200 bg-white text-sm text-slate-900 font-medium",
        "hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all",
        Icon ? "pl-10 pr-3" : "px-3",
        className
      )}
    />
  </div>
);

function PremiumInput({ icon: Icon, value, onChange, placeholder, type = "text" }: {
  icon?: any; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-10 w-full rounded-lg border border-slate-200 bg-white text-sm text-slate-900 font-medium",
          "hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all",
          Icon ? "pl-10 pr-3" : "px-3"
        )}
      />
    </div>
  );
}

function ToggleBtn({ on, onClick, icon: Icon, label, price }: {
  on: boolean; onClick: () => void; icon: any; label: string; price?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 rounded-lg border-2 transition-all text-left",
        on ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200 bg-white hover:border-slate-300"
      )}>
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0",
          on ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
        )}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col items-start leading-tight min-w-0">
          <span className={cn("text-[12px] font-semibold truncate",
            on ? "text-emerald-900" : "text-slate-700"
          )}>{label}</span>
          {price && <span className="text-[10px] text-slate-500">{price}</span>}
        </div>
      </div>
      <div className={cn("w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0",
        on ? "bg-emerald-500" : "border border-slate-300"
      )}>
        {on && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-blue-700">{label}</div>
      <div className="text-sm font-bold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

function SumRow({ label, value, tone }: { label: string; value: string; tone?: "green" | "rose" }) {
  return (
    <div className={cn(
      "flex justify-between items-center text-sm",
      tone === "green" && "text-green-700 font-medium bg-green-50 rounded-md px-2 py-1",
      tone === "rose" && "text-rose-700 font-medium bg-rose-50 rounded-md px-2 py-1"
    )}>
      <span className={cn(!tone && "text-slate-600")}>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
