import './_group.css';
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Plane, Search, Calendar, ArrowRight, Users, User, Baby, Plus, Trash2,
  Briefcase, ShieldCheck, Armchair, Zap, ChevronDown, Building2, FileText,
  Check, ChevronRight, Receipt, BadgePercent, Sparkles, Star,
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

// ============ Onyx palette tokens ============
const GOLD = "#d9b36c";
const GOLD_SOFT = "rgba(217,179,108,0.16)";

function PaxIcon({ type, className }: { type: string; className?: string }) {
  if (type === "infant") return <Baby className={className} />;
  return <User className={className} />;
}

export default function BookingOnyxLuxe() {
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
    <div className="onyx-scope min-h-screen font-['Outfit'] antialiased text-[#e9e2d4] relative overflow-x-hidden"
      style={{ background: "radial-gradient(1200px 600px at 75% -10%, #1c1710 0%, #0d0b09 45%, #080706 100%)" }}>
      <style>{`
        .onyx-scope input, .onyx-scope select { color-scheme: dark; }
        .onyx-scope ::placeholder { color: rgba(233,226,212,0.28); }
        .onyx-scope input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
        @keyframes onyx-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes onyx-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .onyx-rise { animation: onyx-rise .55s cubic-bezier(.22,1,.36,1) both; }
        .onyx-gold-line { background: linear-gradient(90deg, transparent, ${GOLD}, transparent); }
        .onyx-card {
          background: linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015));
          border: 1px solid rgba(217,179,108,0.14);
          backdrop-filter: blur(14px);
          box-shadow: 0 24px 60px -30px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .onyx-input {
          background: rgba(0,0,0,0.35);
          border: 1px solid rgba(233,226,212,0.12);
          transition: border-color .2s, box-shadow .2s, background .2s;
        }
        .onyx-input:hover { border-color: rgba(217,179,108,0.35); }
        .onyx-input:focus { outline: none; border-color: ${GOLD}; box-shadow: 0 0 0 3px rgba(217,179,108,0.12); background: rgba(0,0,0,0.5); }
        .onyx-shimmer-text {
          background: linear-gradient(100deg, #cfa85e 20%, #f4e3bd 40%, #cfa85e 60%);
          background-size: 200% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: onyx-shimmer 5s linear infinite;
        }
      `}</style>

      {/* ambient noise + glow */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.045]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")" }} />
      <div className="pointer-events-none fixed -top-40 right-[-10%] w-[640px] h-[640px] rounded-full z-0"
        style={{ background: "radial-gradient(circle, rgba(217,179,108,0.09) 0%, transparent 65%)" }} />

      <form onSubmit={onSubmit} className="relative z-10">
        {/* ===== Top bar ===== */}
        <header className="sticky top-0 z-30" style={{ background: "rgba(10,9,7,0.82)", backdropFilter: "blur(18px)", borderBottom: "1px solid rgba(217,179,108,0.14)" }}>
          <div className="px-4 md:px-10 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(140deg, #2a2318, #14100a)", border: `1px solid rgba(217,179,108,0.4)`, boxShadow: "0 0 24px rgba(217,179,108,0.18)" }}>
                <Plane className="w-4 h-4 -rotate-45" style={{ color: GOLD }} />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] uppercase tracking-[0.35em] font-semibold" style={{ color: GOLD }}>Kings Travel</span>
                <span className="text-[15px] font-['Fraunces'] font-semibold text-[#f2ead9] tracking-wide">Rezervim i Ri</span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#8d8471]">
              <span>Operacionet</span>
              <ChevronRight className="w-3 h-3 opacity-50" />
              <span>Rezervimet</span>
              <ChevronRight className="w-3 h-3 opacity-50" />
              <span className="font-semibold" style={{ color: GOLD }}>I Ri</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => noop("/bookings")}
                className="h-9 px-4 text-[13px] font-medium text-[#a89f8a] hover:text-[#e9e2d4] rounded-full transition-colors">Anulo</button>
              <button type="submit" disabled={!selectedFlight}
                className="hidden sm:flex h-9 px-4 text-[13px] font-semibold rounded-full items-center gap-1.5 disabled:opacity-40 transition-all hover:brightness-110"
                style={{ background: GOLD_SOFT, border: `1px solid rgba(217,179,108,0.4)`, color: GOLD }}>
                <FileText className="w-3.5 h-3.5" /> Krijo
              </button>
            </div>
          </div>
          {/* Stepper */}
          <div className="px-4 md:px-10 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex items-center gap-4 max-w-5xl mx-auto">
              <OnyxStep n="I" label="Fluturimi" done={stepFlight} active={!stepFlight} />
              <div className={cn("flex-1 h-px transition-colors", stepFlight ? "onyx-gold-line" : "bg-[#2a251c]")} />
              <OnyxStep n="II" label="Pasagjerët" done={stepPax} active={stepFlight && !stepPax} />
              <div className={cn("flex-1 h-px transition-colors", stepPax ? "onyx-gold-line" : "bg-[#2a251c]")} />
              <OnyxStep n="III" label="Konfirmim" done={false} active={stepPax} />
            </div>
          </div>
        </header>

        {/* ===== Body ===== */}
        <div className="px-4 md:px-10 py-8 grid grid-cols-1 lg:grid-cols-12 gap-7 max-w-[1440px] mx-auto">
          <div className="lg:col-span-8 flex flex-col gap-7">

            {/* ===== Flight selection ===== */}
            <section className="onyx-card rounded-2xl overflow-hidden onyx-rise">
              <header className="px-6 pt-5 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-['Fraunces'] italic" style={{ color: GOLD }}>01</span>
                  <h3 className="text-lg font-['Fraunces'] font-semibold text-[#f2ead9]">
                    {selectedFlight ? "Fluturimi i Zgjedhur" : "Zgjidh Fluturimin"}
                  </h3>
                  {selectedFlight && (
                    <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: GOLD_SOFT, border: "1px solid rgba(217,179,108,0.4)" }}>
                      <Check className="w-3 h-3" style={{ color: GOLD }} />
                    </span>
                  )}
                </div>
                <div className="h-px w-24 onyx-gold-line hidden sm:block" />
              </header>

              {/* Search */}
              <div className="px-6 pb-4 grid grid-cols-12 gap-2.5">
                <div className="col-span-12 md:col-span-4">
                  <OnyxInputWrap icon={Plane}>
                    <input value={searchFrom} onChange={e => setSearchFrom(e.target.value)} placeholder="Nga (qytet/aeroport)"
                      className="onyx-input h-11 w-full rounded-xl pl-10 pr-3 text-sm text-[#f2ead9]" />
                  </OnyxInputWrap>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <OnyxInputWrap icon={Plane}>
                    <input value={searchTo} onChange={e => setSearchTo(e.target.value)} placeholder="Për (qytet/aeroport)"
                      className="onyx-input h-11 w-full rounded-xl pl-10 pr-3 text-sm text-[#f2ead9]" />
                  </OnyxInputWrap>
                </div>
                <div className="col-span-10 md:col-span-3">
                  <OnyxInputWrap icon={Calendar}>
                    <input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)}
                      className="onyx-input h-11 w-full rounded-xl pl-10 pr-3 text-sm text-[#f2ead9]" />
                  </OnyxInputWrap>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <div className="h-11 w-full rounded-xl flex items-center justify-center cursor-pointer transition-all hover:brightness-110"
                    style={{ background: `linear-gradient(140deg, #e3c184, ${GOLD})`, boxShadow: "0 8px 24px -8px rgba(217,179,108,0.5)" }}>
                    <Search className="w-4 h-4 text-[#171208]" />
                  </div>
                </div>
              </div>

              <div className="px-4 pb-5 flex flex-col gap-2">
                {!hasSearch ? (
                  <div className="rounded-xl p-10 text-center" style={{ border: "1px dashed rgba(217,179,108,0.25)" }}>
                    <Search className="w-6 h-6 mx-auto mb-2 opacity-40" style={{ color: GOLD }} />
                    <p className="text-sm text-[#8d8471]">Plotësoni fushat sipër për të kërkuar fluturim.</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="rounded-xl p-10 text-center" style={{ border: "1px dashed rgba(217,179,108,0.25)" }}>
                    <p className="text-sm text-[#8d8471]">Asnjë fluturim nuk u gjet.</p>
                  </div>
                ) : filtered.slice(0, 30).map((f) => {
                  const selected = selectedFlightId === f.id;
                  const dep = fmtAmPm(f.departureTime) || "—";
                  const arr = fmtAmPm(f.arrivalTime) || "—";
                  return (
                    <button key={f.id} type="button" onClick={() => setSelectedFlightId(f.id)}
                      className={cn("group relative w-full text-left rounded-xl transition-all duration-200")}
                      style={selected
                        ? { background: "linear-gradient(140deg, rgba(217,179,108,0.14), rgba(217,179,108,0.04))", border: `1px solid rgba(217,179,108,0.55)`, boxShadow: "0 0 30px -8px rgba(217,179,108,0.3)" }
                        : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(233,226,212,0.08)" }}>
                      {selected && (
                        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: GOLD, boxShadow: "0 0 12px rgba(217,179,108,0.6)" }}>
                          <Check className="w-3 h-3 text-[#171208]" />
                        </div>
                      )}
                      <div className="px-4 py-3 flex items-center gap-4">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all")}
                          style={{ background: selected ? GOLD : "rgba(233,226,212,0.06)", border: selected ? "none" : "1px solid rgba(233,226,212,0.12)" }}>
                          <Plane className="w-3.5 h-3.5 -rotate-45" style={{ color: selected ? "#171208" : GOLD }} />
                        </div>
                        <div className="flex-shrink-0 min-w-0 w-[96px]">
                          <div className="text-[12px] font-semibold tracking-wide text-[#f2ead9] truncate leading-tight flex items-center gap-1.5">
                            {f.isConfirmed && <Star className="w-3 h-3 shrink-0 fill-current" style={{ color: GOLD }} />}
                            {f.airline}
                          </div>
                          <div className="text-[10px] font-mono tracking-widest text-[#8d8471]">{fmtFlightNum(f.flightNumber)}</div>
                        </div>
                        <div className="hidden md:flex items-center gap-4 flex-1 justify-center min-w-0">
                          <div className="text-right">
                            <div className="text-[15px] font-['Fraunces'] font-semibold text-[#f2ead9] leading-tight tabular-nums">{dep}</div>
                            <div className="text-[9px] uppercase tracking-[0.22em] text-[#8d8471]">{f.fromAirport || f.fromCity}</div>
                          </div>
                          <div className="flex flex-col items-center gap-1 px-1.5 min-w-[88px]">
                            <div className="text-[10px] font-medium text-[#a89f8a] tabular-nums leading-none">{f.departureDate}</div>
                            <div className="relative w-20 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(217,179,108,0.5), transparent)" }}>
                              <Plane className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-90" style={{ color: GOLD }} />
                            </div>
                            <div className="text-[7.5px] uppercase tracking-[0.3em] text-[#8d8471] leading-none">Direkt</div>
                          </div>
                          <div className="text-left">
                            <div className="text-[15px] font-['Fraunces'] font-semibold text-[#f2ead9] leading-tight tabular-nums">{arr}</div>
                            <div className="text-[9px] uppercase tracking-[0.22em] text-[#8d8471]">{f.toAirport || f.toCity}</div>
                          </div>
                        </div>
                        <div className="md:hidden flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#f2ead9] tabular-nums leading-tight">
                            <span>{dep}</span>
                            <Plane className="w-2.5 h-2.5 rotate-90 shrink-0" style={{ color: GOLD }} />
                            <span>{arr}</span>
                          </div>
                          <div className="text-[10px] text-[#8d8471] truncate">{(f.fromAirport || f.fromCity)} → {(f.toAirport || f.toCity)} · {f.departureDate}</div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1 shrink-0 pl-4" style={{ borderLeft: "1px solid rgba(233,226,212,0.08)" }}>
                          <div className="flex items-start gap-[2px] tabular-nums leading-none">
                            <span className="text-[10px] font-semibold mt-[2px]" style={{ color: GOLD }}>€</span>
                            <span className="text-[19px] font-['Fraunces'] font-semibold text-[#f2ead9] tracking-tight">{fmtM(f.adultPrice)}</span>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.15em] rounded-full px-2 py-[2px]"
                            style={f.availableSeats < 10
                              ? { color: "#e8a95c", background: "rgba(232,169,92,0.1)", border: "1px solid rgba(232,169,92,0.3)" }
                              : { color: "#9fce9a", background: "rgba(159,206,154,0.08)", border: "1px solid rgba(159,206,154,0.25)" }}>
                            <span className="w-1 h-1 rounded-full" style={{ background: f.availableSeats < 10 ? "#e8a95c" : "#9fce9a" }} />
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
                <div className="mx-4 mb-5 px-5 py-4 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-4"
                  style={{ background: "rgba(217,179,108,0.06)", border: "1px solid rgba(217,179,108,0.2)" }}>
                  <OnyxStat label="Çmim Adult" value={`€${fmtM(selectedFlight.adultPrice)}`} />
                  <OnyxStat label="Çmim Fëmijë" value={`€${fmtM(selectedFlight.childPrice)}`} />
                  <OnyxStat label="Çmim Foshnje" value={`€${fmtM(selectedFlight.infantPrice)}`} />
                  <OnyxStat label="Taksa" value={`€${fmtM(selectedFlight.tax)}`} />
                </div>
              )}
            </section>

            {/* ===== Customer & Agency ===== */}
            <section className="onyx-card rounded-2xl onyx-rise" style={{ animationDelay: "80ms" }}>
              <header className="px-6 pt-5 pb-4 flex items-center gap-3">
                <span className="text-[10px] font-['Fraunces'] italic" style={{ color: GOLD }}>02</span>
                <h3 className="text-lg font-['Fraunces'] font-semibold text-[#f2ead9]">Klienti & Agjencia</h3>
                <Building2 className="w-4 h-4 opacity-40" style={{ color: GOLD }} />
              </header>
              <div className="px-6 pb-6 grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-5">
                  <OnyxLabel required>Emri i klientit</OnyxLabel>
                  <OnyxInputWrap icon={User}>
                    <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                      className="onyx-input h-11 w-full rounded-xl pl-10 pr-3 text-sm text-[#f2ead9] capitalize" />
                  </OnyxInputWrap>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <OnyxLabel>Email</OnyxLabel>
                  <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                    className="onyx-input h-11 w-full rounded-xl px-3 text-sm text-[#f2ead9]" />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <OnyxLabel>Telefon</OnyxLabel>
                  <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                    className="onyx-input h-11 w-full rounded-xl px-3 text-sm text-[#f2ead9]" />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <OnyxLabel>Agjencia (opsionale)</OnyxLabel>
                  {(() => {
                    const current = selectedAgent;
                    const initials = current ? (current.company ?? current.name ?? "").slice(0, 2).toUpperCase() : "—";
                    return (
                      <div className="relative">
                        <button type="button" onClick={() => setAgentPickerOpen(o => !o)}
                          className="onyx-input w-full h-11 px-3 rounded-xl flex items-center justify-between text-left">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                              style={{ background: GOLD, color: "#171208" }}>
                              {current ? initials : <Plus className="w-3 h-3" />}
                            </div>
                            <span className="text-sm font-medium text-[#f2ead9] truncate">
                              {current ? current.company || current.name : "Direct Booking"}
                            </span>
                            {current && current.commission != null && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                                style={{ background: GOLD_SOFT, color: GOLD, border: "1px solid rgba(217,179,108,0.3)" }}>
                                Komision {current.commission}%
                              </span>
                            )}
                          </div>
                          <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", agentPickerOpen && "rotate-180")} style={{ color: GOLD }} />
                        </button>
                        {agentPickerOpen && (
                          <div className="absolute z-30 mt-1.5 w-full rounded-xl overflow-hidden"
                            style={{ background: "#161310", border: "1px solid rgba(217,179,108,0.3)", boxShadow: "0 24px 50px -12px rgba(0,0,0,0.9)" }}>
                            <div className="max-h-72 overflow-auto py-1">
                              <button type="button" onClick={() => { setAgentId(null); setAgentPickerOpen(false); }}
                                className="w-full flex items-center px-3 py-2.5 text-sm text-[#e9e2d4] hover:bg-[rgba(217,179,108,0.08)] text-left transition-colors">
                                <Check className={cn("mr-2 h-4 w-4", !agentId ? "opacity-100" : "opacity-0")} style={{ color: GOLD }} />
                                Direct Booking
                              </button>
                              {agents.map((a) => (
                                <button key={a.id} type="button" onClick={() => { setAgentId(a.id); setAgentPickerOpen(false); }}
                                  className="w-full flex items-center px-3 py-2.5 text-sm text-[#e9e2d4] hover:bg-[rgba(217,179,108,0.08)] text-left transition-colors">
                                  <Check className={cn("mr-2 h-4 w-4", agentId === a.id ? "opacity-100" : "opacity-0")} style={{ color: GOLD }} />
                                  {a.name} <span className="text-[#8d8471] ml-1.5">({a.company})</span>
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
                  <OnyxLabel>Komision ($)</OnyxLabel>
                  <OnyxInputWrap icon={BadgePercent}>
                    <input type="number" value={commission} onChange={e => setCommission(e.target.value)}
                      className="onyx-input h-11 w-full rounded-xl pl-10 pr-3 text-sm text-[#f2ead9] tabular-nums" />
                  </OnyxInputWrap>
                </div>
                <div className="col-span-12 md:col-span-3">
                  <OnyxLabel>Zbritje (€)</OnyxLabel>
                  <input type="number" min={0} step="0.01" placeholder="0" value={discount} onChange={e => setDiscount(e.target.value)}
                    className="onyx-input h-11 w-full rounded-xl px-3 text-sm text-[#f2ead9] tabular-nums" />
                </div>
                <div className="col-span-12">
                  <OnyxLabel>Shënime të brendshme</OnyxLabel>
                  <input placeholder="Kërkesa speciale, alergji, etj..." value={notes} onChange={e => setNotes(e.target.value)}
                    className="onyx-input h-11 w-full rounded-xl px-3 text-sm text-[#f2ead9]" />
                </div>
              </div>
            </section>

            {/* ===== Passengers ===== */}
            <section className="onyx-card rounded-2xl onyx-rise" style={{ animationDelay: "160ms" }}>
              <header className="px-6 pt-5 pb-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-['Fraunces'] italic" style={{ color: GOLD }}>03</span>
                  <h3 className="text-lg font-['Fraunces'] font-semibold text-[#f2ead9]">Pasagjerët</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums"
                    style={{ background: GOLD_SOFT, color: GOLD, border: "1px solid rgba(217,179,108,0.3)" }}>{passengers.length}</span>
                  <Users className="w-4 h-4 opacity-40" style={{ color: GOLD }} />
                </div>
                <div className="flex items-center gap-1.5">
                  {(["adult", "child", "infant"] as const).map(t => (
                    <button key={t} type="button" onClick={() => appendPax(t)}
                      className="h-8 px-3 text-xs font-semibold rounded-full flex items-center gap-1.5 transition-all hover:brightness-125"
                      style={{ border: "1px solid rgba(217,179,108,0.3)", color: "#e9e2d4", background: "rgba(217,179,108,0.06)" }}>
                      <Plus className="w-3 h-3" style={{ color: GOLD }} /> {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </header>

              <div className="px-4 pb-5 flex flex-col gap-3">
                {passengers.map((p, index) => {
                  const expanded = expandedIdx === index;
                  const paxType = p.type || "adult";
                  const origPrice = selectedFlight
                    ? (paxType === "adult" ? selectedFlight.adultPrice : paxType === "child" ? selectedFlight.childPrice : selectedFlight.infantPrice)
                    : null;
                  return (
                    <div key={p.id} className="rounded-xl overflow-hidden transition-all duration-300"
                      style={expanded
                        ? { border: "1px solid rgba(217,179,108,0.4)", background: "rgba(217,179,108,0.04)", boxShadow: "0 0 24px -10px rgba(217,179,108,0.25)" }
                        : { border: "1px solid rgba(233,226,212,0.08)", background: "rgba(255,255,255,0.015)" }}>
                      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                        <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: paxType === "infant" ? "rgba(232,140,168,0.12)" : paxType === "child" ? "rgba(232,169,92,0.12)" : GOLD_SOFT,
                              border: "1px solid rgba(217,179,108,0.25)",
                              color: paxType === "infant" ? "#e88ca8" : paxType === "child" ? "#e8a95c" : GOLD }}>
                            <PaxIcon type={paxType} className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col leading-tight min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-['Fraunces'] font-semibold text-[#f2ead9] truncate">
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${index + 1}`}
                              </span>
                              <span className="text-[8.5px] uppercase font-bold tracking-[0.18em] px-2 py-0.5 rounded-full shrink-0"
                                style={{ background: "rgba(233,226,212,0.06)", color: "#a89f8a", border: "1px solid rgba(233,226,212,0.1)" }}>
                                {TYPE_LABEL[paxType]}
                              </span>
                            </div>
                            {p.dateOfBirth && (
                              <span className="text-[11px] text-[#8d8471]">Datëlindja: <span className="font-mono">{p.dateOfBirth}</span></span>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {p.hasSeatSelection && <ExtraDot title="SEAT"><Armchair className="w-3 h-3" /></ExtraDot>}
                            {p.hasPriorityBoarding && <ExtraDot title="Priority"><Zap className="w-3 h-3" /></ExtraDot>}
                            {p.hasInsurance && <ExtraDot title="Sigurim"><ShieldCheck className="w-3 h-3" /></ExtraDot>}
                            {p.baggageOption === "checked" && <ExtraDot title="Bagazh"><Briefcase className="w-3 h-3" /></ExtraDot>}
                          </div>
                          {(() => {
                            const override = p.ticketPrice;
                            const hasOverride = override != null && override !== "" && !Number.isNaN(Number(override)) && (origPrice == null || Number(override) !== Number(origPrice));
                            return (
                              <div className="hidden sm:flex items-center gap-2.5 pl-3 ml-1" style={{ borderLeft: "1px solid rgba(233,226,212,0.08)" }} onClick={(e) => e.stopPropagation()}>
                                {origPrice != null && (
                                  <>
                                    <div className="flex flex-col items-end leading-tight">
                                      <span className="text-[8.5px] uppercase tracking-[0.18em] font-bold text-[#8d8471]">Origjinal</span>
                                      <span className={cn("text-[11px] font-semibold tabular-nums", hasOverride ? "text-[#6b6455] line-through" : "text-[#a89f8a]")}>
                                        €{fmtM(origPrice)}
                                      </span>
                                    </div>
                                    <ArrowRight className="w-3 h-3 opacity-30" style={{ color: GOLD }} />
                                  </>
                                )}
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="text-[8.5px] uppercase tracking-[0.18em] font-bold" style={{ color: hasOverride ? GOLD : "#8d8471" }}>Çmimi €</span>
                                  <input type="text" inputMode="decimal" value={p.ticketPrice ?? ""}
                                    placeholder={origPrice != null ? String(origPrice) : "0.00"}
                                    onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                                    className="onyx-input w-20 h-7 px-2 text-right rounded-lg text-sm font-bold text-[#f2ead9] tabular-nums"
                                    style={hasOverride ? { borderColor: "rgba(217,179,108,0.6)", background: GOLD_SOFT } : undefined} />
                                </div>
                              </div>
                            );
                          })()}
                          {index > 0 && (
                            <button type="button" onClick={() => removePax(index)} className="text-[#8d8471] hover:text-rose-400 p-1 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                            className={cn("p-1 transition-transform duration-300", expanded && "rotate-180")} style={{ color: GOLD }}>
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="px-4 pb-5 pt-4 grid grid-cols-12 gap-3" style={{ borderTop: "1px solid rgba(217,179,108,0.15)" }}>
                          <div className="col-span-12 sm:col-span-4">
                            <OnyxLabel>Tipi</OnyxLabel>
                            <select value={p.type} onChange={(e) => updatePax(index, { type: e.target.value as Pax["type"] })}
                              className="onyx-input h-11 w-full px-3 rounded-xl text-sm text-[#f2ead9]">
                              <option value="adult">I rritur</option>
                              <option value="child">Fëmijë</option>
                              <option value="infant">Foshnje</option>
                            </select>
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <OnyxLabel required>Emri</OnyxLabel>
                            <input value={p.firstName} onChange={(e) => updatePax(index, { firstName: e.target.value })}
                              className="onyx-input h-11 w-full rounded-xl px-3 text-sm text-[#f2ead9]" />
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <OnyxLabel required>Mbiemri</OnyxLabel>
                            <input value={p.lastName} onChange={(e) => updatePax(index, { lastName: e.target.value })}
                              className="onyx-input h-11 w-full rounded-xl px-3 text-sm text-[#f2ead9]" />
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <OnyxLabel>Datëlindja</OnyxLabel>
                            <input type="date" value={p.dateOfBirth || ""} onChange={(e) => updatePax(index, { dateOfBirth: e.target.value })}
                              className="onyx-input h-11 w-full rounded-xl px-3 text-sm text-[#f2ead9]" />
                          </div>

                          <div className="col-span-12 sm:hidden">
                            {(() => {
                              const hasOverride = p.ticketPrice != null && p.ticketPrice !== "" && !Number.isNaN(Number(p.ticketPrice)) && (origPrice == null || Number(p.ticketPrice) !== Number(origPrice));
                              return (
                                <>
                                  <OnyxLabel>Çmimi € {origPrice != null ? `(origjinal €${fmtM(origPrice)})` : ""}</OnyxLabel>
                                  <input type="text" inputMode="decimal" value={p.ticketPrice ?? ""}
                                    placeholder={origPrice != null ? String(origPrice) : "0.00"}
                                    onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                                    className="onyx-input h-11 w-full px-3 text-right rounded-xl text-sm font-bold text-[#f2ead9] tabular-nums"
                                    style={hasOverride ? { borderColor: "rgba(217,179,108,0.6)", background: GOLD_SOFT } : undefined} />
                                </>
                              );
                            })()}
                          </div>

                          <div className="col-span-12 mt-1">
                            <OnyxLabel>Ekstra</OnyxLabel>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <OnyxToggle
                                on={p.baggageOption === "checked"}
                                onClick={() => updatePax(index, { baggageOption: p.baggageOption === "checked" ? "" : "checked" })}
                                icon={Briefcase} label="Bagazh"
                                price={selectedFlight?.checkedBaggagePrice ? `+€${selectedFlight.checkedBaggagePrice}` : ""} />
                              <OnyxToggle on={p.hasSeatSelection} onClick={() => updatePax(index, { hasSeatSelection: !p.hasSeatSelection })} icon={Armchair} label="SEAT"
                                price={selectedFlight?.seatSelectionPrice ? `+€${selectedFlight.seatSelectionPrice}` : ""} />
                              <OnyxToggle on={p.hasPriorityBoarding} onClick={() => updatePax(index, { hasPriorityBoarding: !p.hasPriorityBoarding })} icon={Zap} label="Priority"
                                price={selectedFlight?.priorityBoardingPrice ? `+€${selectedFlight.priorityBoardingPrice}` : ""} />
                              <OnyxToggle on={p.hasInsurance} onClick={() => updatePax(index, { hasInsurance: !p.hasInsurance })} icon={ShieldCheck} label="Sigurim"
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
            <div className="lg:sticky lg:top-32 flex flex-col gap-5 onyx-rise" style={{ animationDelay: "240ms" }}>
              <div className="onyx-card rounded-2xl overflow-hidden">
                <header className="px-6 py-4 relative overflow-hidden"
                  style={{ background: "linear-gradient(140deg, #1e1811, #0f0c08)", borderBottom: "1px solid rgba(217,179,108,0.25)" }}>
                  <div className="absolute top-0 left-0 right-0 h-px onyx-gold-line" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Receipt className="w-4 h-4" style={{ color: GOLD }} />
                      <h3 className="text-base font-['Fraunces'] font-semibold text-[#f2ead9]">Përmbledhje Rezervimi</h3>
                    </div>
                    <span className="text-[9px] uppercase font-bold tracking-[0.25em] px-2 py-1 rounded-full"
                      style={{ background: GOLD, color: "#171208" }}>I Ri</span>
                  </div>
                </header>
                <div className="p-6">
                  {selectedFlight ? (
                    <div className="rounded-xl p-4 mb-5 relative overflow-hidden"
                      style={{ background: "rgba(217,179,108,0.06)", border: "1px solid rgba(217,179,108,0.25)" }}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] uppercase font-bold tracking-[0.3em]" style={{ color: GOLD }}>Fluturimi</span>
                        <span className="text-[10px] font-semibold text-[#a89f8a] tabular-nums">{selectedFlight.departureDate}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-center">
                          <div className="text-2xl font-['Fraunces'] font-semibold text-[#f2ead9] leading-none">{selectedFlight.fromAirport || selectedFlight.fromCity}</div>
                          <div className="text-[10px] text-[#8d8471] mt-1 tabular-nums">{fmtAmPm(selectedFlight.departureTime)}</div>
                        </div>
                        <div className="flex-1 px-3 flex flex-col items-center">
                          <Plane className="w-3.5 h-3.5 rotate-90" style={{ color: GOLD }} />
                          <div className="w-full h-px my-1" style={{ background: "linear-gradient(90deg, transparent, rgba(217,179,108,0.5), transparent)" }} />
                          <span className="text-[8px] uppercase tracking-[0.3em] text-[#8d8471]">Direkt</span>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-['Fraunces'] font-semibold text-[#f2ead9] leading-none">{selectedFlight.toAirport || selectedFlight.toCity}</div>
                          <div className="text-[10px] text-[#8d8471] mt-1 tabular-nums">{fmtAmPm(selectedFlight.arrivalTime)}</div>
                        </div>
                      </div>
                      <div className="mt-3 pt-2.5 flex items-center justify-between text-[11px]" style={{ borderTop: "1px dashed rgba(217,179,108,0.25)" }}>
                        <span className="font-medium text-[#e9e2d4]">{selectedFlight.airline} {fmtFlightNum(selectedFlight.flightNumber)}</span>
                        <span className="font-mono text-[#8d8471]">€{fmtM(selectedFlight.adultPrice)} bazë</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl p-5 mb-5 text-center text-xs text-[#8d8471]" style={{ border: "1px dashed rgba(217,179,108,0.25)" }}>
                      Zgjidh një fluturim
                    </div>
                  )}

                  {selectedFlight && passengers.length > 0 && (
                    <div className="space-y-1 text-sm tabular-nums mb-4">
                      <div className="text-[9px] uppercase tracking-[0.3em] font-bold text-[#8d8471] mb-2">Çmimi për pasagjer</div>
                      {passengers.map((p, i) => {
                        const base = p.type === "adult" ? selectedFlight.adultPrice
                          : p.type === "child" ? selectedFlight.childPrice
                          : selectedFlight.infantPrice;
                        const ov = p.ticketPrice;
                        const hasOv = ov != null && ov !== "" && !Number.isNaN(Number(ov)) && Number(ov) !== Number(base);
                        const finalPrice = hasOv ? Number(ov) : Number(base);
                        return (
                          <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: i < passengers.length - 1 ? "1px solid rgba(233,226,212,0.06)" : "none" }}>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                                style={{ background: GOLD_SOFT, color: GOLD, border: "1px solid rgba(217,179,108,0.2)" }}>
                                <PaxIcon type={p.type} className="w-3 h-3" />
                              </div>
                              <span className="text-[12px] font-semibold text-[#e9e2d4] truncate">
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${i + 1}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 tabular-nums">
                              {hasOv && <span className="text-[10px] text-[#6b6455] line-through">€{fmtM(base)}</span>}
                              <span className="text-[13px] font-bold" style={{ color: hasOv ? GOLD : "#e9e2d4" }}>€{fmtM(finalPrice)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-2.5 text-sm tabular-nums">
                    <OnyxSum label={`Biletat × ${passengers.length}`} value={`€${fmtM(totals.ticket)}`} />
                    {totals.discount > 0 && (
                      <OnyxSum label={totals.discountType === "fixed" ? `Zbritje Agjenti (−€${fmtM(totals.discountFixed)})` : `Zbritje Agjenti (${totals.discountPct}%)`}
                        value={`−€${fmtM(totals.discount)}`} tone="green" />
                    )}
                    {totals.manualDiscount > 0 && (
                      <OnyxSum label="Zbritje manuale" value={`−€${fmtM(totals.manualDiscount)}`} tone="rose" />
                    )}
                    <OnyxSum label="Taksa" value={`€${fmtM(totals.tax)}`} />
                    <OnyxSum label="Ekstra" value={`€${fmtM(totals.extras)}`} />
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#8d8471]">Markup</span>
                      <input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)}
                        className="onyx-input w-24 h-9 px-2 text-right rounded-lg text-sm font-semibold text-[#f2ead9] tabular-nums" />
                    </div>
                  </div>

                  <div className="mt-5 pt-4" style={{ borderTop: "1px solid rgba(217,179,108,0.2)" }}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-[0.3em] text-[#8d8471]">Total Klienti</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold" style={{ color: GOLD }}>€</span>
                        <span className="text-[40px] font-['Fraunces'] font-semibold tabular-nums leading-none onyx-shimmer-text">{fmtM(totals.total)}</span>
                      </div>
                    </div>
                    <div className="mt-2.5 text-[11px] text-[#8d8471] flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD, boxShadow: "0 0 8px rgba(217,179,108,0.7)" }} />
                      Pagesa menaxhohet pas konfirmimit
                    </div>
                  </div>
                </div>

                <div className="px-6 py-5 flex flex-col gap-2" style={{ borderTop: "1px solid rgba(217,179,108,0.15)", background: "rgba(0,0,0,0.25)" }}>
                  <button type="submit" disabled={!selectedFlight}
                    className="h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:brightness-110 hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: `linear-gradient(140deg, #ecd19a, ${GOLD} 55%, #b8944f)`, color: "#171208", boxShadow: "0 14px 34px -12px rgba(217,179,108,0.55)" }}>
                    Konfirmo Rezervimin <ArrowRight className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => noop("/bookings")}
                    className="h-10 rounded-xl text-sm font-medium text-[#a89f8a] hover:text-[#e9e2d4] transition-colors">Anulo</button>
                </div>
              </div>

              {selectedAgent && (
                <div className="rounded-2xl p-5 onyx-card">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: GOLD_SOFT, border: "1px solid rgba(217,179,108,0.35)" }}>
                      <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-['Fraunces'] font-semibold text-[#f2ead9] mb-0.5">Agjenti i Zgjedhur</div>
                      <div className="text-[11px] text-[#a89f8a] leading-relaxed">
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

// ============ Onyx helpers ============

function OnyxStep({ n, label, active, done }: { n: string; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-['Fraunces'] font-semibold transition-all"
        style={done
          ? { background: GOLD, color: "#171208", boxShadow: "0 0 16px rgba(217,179,108,0.4)" }
          : active
          ? { background: "rgba(217,179,108,0.12)", color: GOLD, border: `1px solid ${GOLD}`, boxShadow: "0 0 20px rgba(217,179,108,0.25)" }
          : { background: "transparent", color: "#6b6455", border: "1px solid rgba(233,226,212,0.15)" }}>
        {done ? <Check className="w-4 h-4" /> : n}
      </div>
      <div className="hidden sm:flex flex-col leading-tight">
        <span className="text-[8.5px] uppercase font-bold tracking-[0.28em]"
          style={{ color: active || done ? GOLD : "#6b6455" }}>Hapi {n}</span>
        <span className={cn("text-[13px] font-semibold", active || done ? "text-[#f2ead9]" : "text-[#6b6455]")}>{label}</span>
      </div>
    </div>
  );
}

function OnyxLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[9px] uppercase tracking-[0.28em] font-bold text-[#8d8471] mb-1.5 block">
      {children}{required && <span style={{ color: GOLD }}> *</span>}
    </label>
  );
}

function OnyxInputWrap({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-10" style={{ color: "rgba(217,179,108,0.5)" }} />
      {children}
    </div>
  );
}

function ExtraDot({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <span title={title} className="w-6 h-6 rounded-full flex items-center justify-center"
      style={{ background: GOLD_SOFT, color: GOLD, border: "1px solid rgba(217,179,108,0.25)" }}>
      {children}
    </span>
  );
}

function OnyxToggle({ on, onClick, icon: Icon, label, price }: {
  on: boolean; onClick: () => void; icon: any; label: string; price?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 hover:brightness-125"
      style={on
        ? { border: "1px solid rgba(217,179,108,0.55)", background: "rgba(217,179,108,0.1)", boxShadow: "0 0 18px -6px rgba(217,179,108,0.3)" }
        : { border: "1px solid rgba(233,226,212,0.1)", background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          style={on ? { background: GOLD, color: "#171208" } : { background: "rgba(233,226,212,0.06)", color: "#8d8471" }}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col items-start leading-tight min-w-0">
          <span className={cn("text-[12px] font-semibold truncate", on ? "text-[#f2ead9]" : "text-[#a89f8a]")}>{label}</span>
          {price && <span className="text-[10px] text-[#8d8471]">{price}</span>}
        </div>
      </div>
      <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
        style={on ? { background: GOLD } : { border: "1px solid rgba(233,226,212,0.25)" }}>
        {on && <Check className="w-2.5 h-2.5 text-[#171208]" />}
      </div>
    </button>
  );
}

function OnyxStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.28em] font-bold" style={{ color: GOLD }}>{label}</div>
      <div className="text-lg font-['Fraunces'] font-semibold text-[#f2ead9] tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function OnyxSum({ label, value, tone }: { label: string; value: string; tone?: "green" | "rose" }) {
  return (
    <div className={cn("flex justify-between items-center text-sm rounded-lg", tone && "px-2.5 py-1.5")}
      style={tone === "green" ? { background: "rgba(159,206,154,0.08)", color: "#9fce9a" }
        : tone === "rose" ? { background: "rgba(232,120,120,0.08)", color: "#e08a8a" }
        : undefined}>
      <span className={cn(!tone && "text-[#a89f8a]")}>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
