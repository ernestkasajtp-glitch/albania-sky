import './_group.css';
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Plane, Search, Calendar, ArrowRight, Users, User, Baby, Plus, Trash2,
  Briefcase, ShieldCheck, Armchair, Zap, ChevronDown, Check, Crown,
} from "lucide-react";

/* ============ Royal Sapphire — KINGS TRAVEL booking creation ============
   National-carrier prestige: deep sapphire, gilded rules, serif crest headings. */

function fmtFlightNum(num: string | null | undefined): string {
  if (!num) return num ?? "";
  const clean = num.replace(/\s+/g, "");
  if (clean.length <= 2) return clean;
  return clean.slice(0, 2) + " " + clean.slice(2);
}
function fmtM(n: number | string | null | undefined): string {
  if (n == null || n === "") return "0";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return String(Math.round(num));
}

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

/* ---------- Palette tokens (Royal Sapphire) ---------- */
const INK = "#0c1b3d";        // deep sapphire ink
const GOLD = "#c8a24a";       // gilded accent
const GOLD_DEEP = "#a07f2c";
const PARCH = "#f6f4ee";      // warm parchment field

function PaxIcon({ type, className }: { type: string; className?: string }) {
  if (type === "infant") return <Baby className={className} />;
  return <User className={className} />;
}

/* ---------- Small building blocks ---------- */

function GildedRule({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#c8a24a66] to-[#c8a24a]" />
      <div className="w-1.5 h-1.5 rotate-45 border border-[#c8a24a] bg-transparent" />
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[#c8a24a66] to-[#c8a24a]" />
    </div>
  );
}

function SectionCrest({ roman, title, sub }: { roman: string; title: string; sub?: string }) {
  return (
    <header className="px-6 pt-6 pb-4">
      <div className="flex items-baseline gap-3">
        <span className="font-['Fraunces'] text-[13px] tracking-[0.3em] text-[#a07f2c]">{roman}</span>
        <h3 className="font-['Fraunces'] text-[22px] font-semibold text-[#0c1b3d] tracking-tight">{title}</h3>
        {sub && <span className="text-[11px] uppercase tracking-[0.18em] text-[#0c1b3d]/45 font-semibold">{sub}</span>}
      </div>
      <GildedRule className="mt-3" />
    </header>
  );
}

function RoyalLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] uppercase tracking-[0.22em] font-bold text-[#0c1b3d]/55 mb-1.5">
      {children}
    </label>
  );
}

const RoyalInput = ({ icon: Icon, className, ...props }: any) => (
  <div className="relative group">
    {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0c1b3d]/35 pointer-events-none group-focus-within:text-[#a07f2c] transition-colors" />}
    <input
      {...props}
      className={cn(
        "h-10 w-full border border-[#0c1b3d]/15 bg-white text-sm text-[#0c1b3d] font-medium rounded-[3px]",
        "hover:border-[#0c1b3d]/30 focus:border-[#c8a24a] focus:ring-2 focus:ring-[#c8a24a]/20 focus:outline-none transition-all",
        Icon ? "pl-10 pr-3" : "px-3",
        className
      )}
    />
  </div>
);

function RoyalToggle({ on, onClick, icon: Icon, label, price }: {
  on: boolean; onClick: () => void; icon: any; label: string; price?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 border transition-all duration-200 text-left rounded-[3px]",
        on
          ? "border-[#c8a24a] bg-[#c8a24a]/10 shadow-[inset_0_0_0_1px_#c8a24a55]"
          : "border-[#0c1b3d]/15 bg-white hover:border-[#c8a24a]/60 hover:bg-[#c8a24a]/[0.04]"
      )}>
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn("w-7 h-7 flex items-center justify-center shrink-0 rounded-[3px] transition-colors",
          on ? "bg-[#0c1b3d] text-[#e9c877]" : "bg-[#0c1b3d]/5 text-[#0c1b3d]/50"
        )}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col items-start leading-tight min-w-0">
          <span className={cn("text-[12px] font-semibold truncate", on ? "text-[#0c1b3d]" : "text-[#0c1b3d]/70")}>{label}</span>
          {price && <span className={cn("text-[10px] tabular-nums", on ? "text-[#a07f2c] font-semibold" : "text-[#0c1b3d]/45")}>{price}</span>}
        </div>
      </div>
      <div className={cn("w-4 h-4 rotate-45 flex items-center justify-center shrink-0 transition-all",
        on ? "bg-[#c8a24a]" : "border border-[#0c1b3d]/25"
      )}>
        {on && <Check className="w-2.5 h-2.5 text-[#0c1b3d] -rotate-45" />}
      </div>
    </button>
  );
}

function SumRow({ label, value, tone }: { label: string; value: string; tone?: "gold" | "rose" }) {
  return (
    <div className="flex justify-between items-center text-sm py-1">
      <span className={cn(
        "text-[12px]",
        tone === "gold" ? "text-[#e9c877]" : tone === "rose" ? "text-rose-300" : "text-white/60"
      )}>{label}</span>
      <span className={cn(
        "font-semibold tabular-nums",
        tone === "gold" ? "text-[#e9c877]" : tone === "rose" ? "text-rose-300" : "text-white/90"
      )}>{value}</span>
    </div>
  );
}

/* ==================== MAIN COMPONENT ==================== */

export default function RoyalSapphire() {
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

  const hasSearch = !!(searchFrom || searchTo || searchDate);
  const matchTxt = (val: string, q: string) => !q ? true : (val ?? "").toLowerCase().includes(q.toLowerCase());
  const filtered = !hasSearch ? [] : flights.filter(f => {
    const fromOk = !searchFrom || matchTxt(f.fromCity, searchFrom) || matchTxt(f.fromAirport, searchFrom);
    const toOk = !searchTo || matchTxt(f.toCity, searchTo) || matchTxt(f.toAirport, searchTo);
    const dateOk = !searchDate || f.departureDate === searchDate;
    return fromOk && toOk && dateOk;
  });

  return (
    <div
      className="booking-premium-scope min-h-screen antialiased text-[#0c1b3d] font-['Outfit']"
      style={{ background: `linear-gradient(180deg, ${PARCH} 0%, #eef0f4 100%)` }}
    >
      {/* Fine texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.35]"
        style={{ backgroundImage: `radial-gradient(#0c1b3d0d 1px, transparent 1px)`, backgroundSize: "28px 28px" }}
      />

      <form onSubmit={onSubmit} className="relative">
        {/* ===== Regal masthead ===== */}
        <div className="sticky top-0 z-30">
          <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${GOLD_DEEP}, #e9c877 30%, ${GOLD} 55%, #e9c877 80%, ${GOLD_DEEP})` }} />
          <div style={{ background: `linear-gradient(180deg, #0a1733, ${INK})` }} className="border-b border-[#c8a24a]/25 shadow-[0_8px_30px_rgba(12,27,61,0.35)]">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="relative w-11 h-11 flex items-center justify-center">
                  <div className="absolute inset-0 rotate-45 border border-[#c8a24a]/70 rounded-[4px]" />
                  <div className="absolute inset-[3px] rotate-45 border border-[#c8a24a]/30 rounded-[3px]" />
                  <Crown className="w-4.5 h-4.5 text-[#e9c877]" style={{ width: 18, height: 18 }} />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="font-['Fraunces'] text-[17px] font-semibold text-white tracking-wide">KINGS TRAVEL</span>
                  <span className="text-[9px] uppercase tracking-[0.35em] text-[#c8a24a]">Rezervim i Ri</span>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-2.5 text-[11px] uppercase tracking-[0.2em] text-white/40">
                <span>Operacionet</span>
                <span className="w-1 h-1 rotate-45 bg-[#c8a24a]/60" />
                <span>Rezervimet</span>
                <span className="w-1 h-1 rotate-45 bg-[#c8a24a]/60" />
                <span className="text-[#e9c877] font-semibold">I Ri</span>
              </div>

              <div className="flex items-center gap-2.5">
                <button type="button" onClick={() => noop("/bookings")}
                  className="h-9 px-4 text-[12px] uppercase tracking-[0.15em] font-semibold text-white/60 hover:text-white transition-colors">
                  Anulo
                </button>
                <button type="submit" disabled={!selectedFlight}
                  className="group relative h-9 px-5 text-[12px] uppercase tracking-[0.15em] font-bold text-[#0c1b3d] disabled:opacity-40 transition-all hover:shadow-[0_4px_18px_rgba(200,162,74,0.45)]"
                  style={{ background: `linear-gradient(135deg, #e9c877, ${GOLD} 55%, ${GOLD_DEEP})` }}>
                  Krijo Rezervimin
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Body ===== */}
        <div className="relative max-w-[1400px] mx-auto px-4 md:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-7">
          <div className="lg:col-span-8 flex flex-col gap-7">

            {/* ---------- I. Flight ---------- */}
            <section className="bg-white border border-[#0c1b3d]/10 shadow-[0_2px_20px_rgba(12,27,61,0.06)] rounded-[6px] overflow-hidden">
              <SectionCrest roman="I" title={selectedFlight ? "Fluturimi i Zgjedhur" : "Zgjidh Fluturimin"} sub={selectedFlight ? "Konfirmuar" : undefined} />

              {/* Search */}
              <div className="px-6 pb-4 grid grid-cols-12 gap-2.5">
                <div className="col-span-12 md:col-span-4">
                  <RoyalInput icon={Plane} value={searchFrom} onChange={(e: any) => setSearchFrom(e.target.value)} placeholder="Nga (qytet/aeroport)" />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <RoyalInput icon={Plane} value={searchTo} onChange={(e: any) => setSearchTo(e.target.value)} placeholder="Për (qytet/aeroport)" />
                </div>
                <div className="col-span-10 md:col-span-3">
                  <RoyalInput icon={Calendar} type="date" value={searchDate} onChange={(e: any) => setSearchDate(e.target.value)} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <button type="button" className="h-10 w-full flex items-center justify-center text-[#0c1b3d] rounded-[3px] transition-shadow hover:shadow-[0_4px_14px_rgba(200,162,74,0.4)]"
                    style={{ background: `linear-gradient(135deg, #e9c877, ${GOLD})` }}>
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Flight tickets */}
              <div className="px-6 pb-6 flex flex-col gap-3">
                {!hasSearch ? (
                  <div className="border border-dashed border-[#0c1b3d]/20 p-8 text-center rounded-[4px]">
                    <Search className="w-6 h-6 mx-auto text-[#0c1b3d]/25 mb-2" />
                    <p className="text-sm text-[#0c1b3d]/50">Plotësoni fushat sipër për të kërkuar fluturim.</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="border border-dashed border-[#0c1b3d]/20 p-8 text-center rounded-[4px]">
                    <p className="text-sm text-[#0c1b3d]/50">Asnjë fluturim nuk u gjet.</p>
                  </div>
                ) : filtered.slice(0, 30).map((f) => {
                  const selected = selectedFlightId === f.id;
                  return (
                    <button key={f.id} type="button" onClick={() => setSelectedFlightId(f.id)}
                      className={cn(
                        "group relative w-full text-left border transition-all duration-300 rounded-[4px] overflow-hidden",
                        selected
                          ? "border-[#c8a24a] shadow-[0_6px_24px_rgba(12,27,61,0.14)]"
                          : "border-[#0c1b3d]/12 bg-white hover:border-[#c8a24a]/60 hover:shadow-[0_4px_16px_rgba(12,27,61,0.08)] hover:-translate-y-[1px]"
                      )}
                      style={selected ? { background: `linear-gradient(90deg, #0a1733, ${INK} 60%, #14285a)` } : undefined}
                    >
                      {/* Boarding-pass perforation */}
                      <div className={cn("absolute top-0 bottom-0 right-[118px] w-px border-l border-dashed",
                        selected ? "border-[#c8a24a]/35" : "border-[#0c1b3d]/12")} />
                      <div className={cn("absolute -top-1.5 right-[115px] w-3 h-3 rounded-full border",
                        selected ? "bg-[#f6f4ee] border-[#c8a24a]/50" : "bg-[#f6f4ee] border-[#0c1b3d]/12")} />
                      <div className={cn("absolute -bottom-1.5 right-[115px] w-3 h-3 rounded-full border",
                        selected ? "bg-[#f6f4ee] border-[#c8a24a]/50" : "bg-[#f6f4ee] border-[#0c1b3d]/12")} />

                      <div className="pl-4 pr-3 py-3 flex items-center gap-4">
                        <div className={cn("w-9 h-9 flex items-center justify-center shrink-0 rounded-[3px] transition-colors",
                          selected ? "bg-[#c8a24a]/15 border border-[#c8a24a]/50" : "bg-[#0c1b3d]/5 group-hover:bg-[#c8a24a]/10"
                        )}>
                          <Plane className={cn("w-4 h-4 -rotate-45", selected ? "text-[#e9c877]" : "text-[#0c1b3d]/60")} />
                        </div>
                        <div className="shrink-0 w-[96px]">
                          <div className={cn("text-[12px] font-bold tracking-wide leading-tight flex items-center gap-1.5", selected ? "text-white" : "text-[#0c1b3d]")}>
                            {f.isConfirmed && <Crown className={cn("w-3 h-3 shrink-0", selected ? "text-[#e9c877]" : "text-[#a07f2c]")} />}
                            {f.airline}
                          </div>
                          <div className={cn("text-[10px] font-mono tracking-wider", selected ? "text-[#c8a24a]" : "text-[#0c1b3d]/40")}>{fmtFlightNum(f.flightNumber)}</div>
                        </div>

                        <div className="hidden md:flex items-center gap-4 flex-1 justify-center min-w-0">
                          <div className="text-right">
                            <div className={cn("text-[15px] font-['Fraunces'] font-semibold leading-tight tabular-nums", selected ? "text-white" : "text-[#0c1b3d]")}>{f.departureTime}</div>
                            <div className={cn("text-[9px] uppercase tracking-[0.2em]", selected ? "text-white/45" : "text-[#0c1b3d]/40")}>{f.fromAirport}</div>
                          </div>
                          <div className="flex flex-col items-center gap-1 px-2 min-w-[90px]">
                            <div className={cn("text-[10px] tabular-nums leading-none", selected ? "text-[#c8a24a]" : "text-[#0c1b3d]/50")}>{f.departureDate}</div>
                            <div className={cn("relative w-20 h-px", selected ? "bg-[#c8a24a]/40" : "bg-[#0c1b3d]/15")}>
                              <div className={cn("absolute -top-[2px] left-0 w-[5px] h-[5px] rotate-45 border", selected ? "border-[#c8a24a] bg-[#0c1b3d]" : "border-[#0c1b3d]/30 bg-white")} />
                              <Plane className={cn("absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-90", selected ? "text-[#e9c877]" : "text-[#a07f2c]")} />
                              <div className={cn("absolute -top-[2px] right-0 w-[5px] h-[5px] rotate-45 border", selected ? "border-[#c8a24a] bg-[#0c1b3d]" : "border-[#0c1b3d]/30 bg-white")} />
                            </div>
                            <div className={cn("text-[8px] uppercase tracking-[0.3em] leading-none", selected ? "text-white/40" : "text-[#0c1b3d]/35")}>Direkt</div>
                          </div>
                          <div className="text-left">
                            <div className={cn("text-[15px] font-['Fraunces'] font-semibold leading-tight tabular-nums", selected ? "text-white" : "text-[#0c1b3d]")}>{f.arrivalTime}</div>
                            <div className={cn("text-[9px] uppercase tracking-[0.2em]", selected ? "text-white/45" : "text-[#0c1b3d]/40")}>{f.toAirport}</div>
                          </div>
                        </div>

                        {/* Mobile */}
                        <div className="md:hidden flex-1 min-w-0">
                          <div className={cn("flex items-center gap-1.5 text-[13px] font-semibold tabular-nums", selected ? "text-white" : "text-[#0c1b3d]")}>
                            <span>{f.departureTime}</span>
                            <Plane className={cn("w-2.5 h-2.5 rotate-90 shrink-0", selected ? "text-[#e9c877]" : "text-[#a07f2c]")} />
                            <span>{f.arrivalTime}</span>
                          </div>
                          <div className={cn("text-[10px] truncate", selected ? "text-white/50" : "text-[#0c1b3d]/45")}>{f.fromAirport} → {f.toAirport} · {f.departureDate}</div>
                        </div>

                        {/* Price stub */}
                        <div className="text-right flex flex-col items-end gap-1 shrink-0 pl-5 w-[110px]">
                          <div className="flex items-start gap-[2px] tabular-nums leading-none">
                            <span className={cn("text-[10px] font-semibold mt-[2px]", selected ? "text-[#e9c877]" : "text-[#a07f2c]")}>€</span>
                            <span className={cn("text-[20px] font-['Fraunces'] font-bold tracking-tight", selected ? "text-white" : "text-[#0c1b3d]")}>{fmtM(f.adultPrice)}</span>
                          </div>
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-[2px] rounded-[2px]",
                            selected
                              ? "text-[#e9c877] bg-[#c8a24a]/15 ring-1 ring-[#c8a24a]/40"
                              : f.availableSeats < 10
                              ? "text-amber-800 bg-amber-50 ring-1 ring-amber-300/60"
                              : "text-emerald-800 bg-emerald-50 ring-1 ring-emerald-300/60"
                          )}>
                            +{f.availableSeats} VENDE
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* ÇMIM strip */}
                {selectedFlight && (
                  <div className="mt-1 border border-[#c8a24a]/40 rounded-[4px] overflow-hidden">
                    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#c8a24a]/25 bg-gradient-to-b from-[#faf7ef] to-[#f4efe2]">
                      {[
                        ["Çmim Adult", selectedFlight.adultPrice],
                        ["Çmim Fëmijë", selectedFlight.childPrice],
                        ["Çmim Foshnje", selectedFlight.infantPrice],
                        ["Taksa", selectedFlight.tax],
                      ].map(([label, val]) => (
                        <div key={label as string} className="px-4 py-3 text-center">
                          <div className="text-[9px] uppercase tracking-[0.22em] font-bold text-[#a07f2c]">{label}</div>
                          <div className="text-[17px] font-['Fraunces'] font-semibold text-[#0c1b3d] tabular-nums mt-0.5">€{fmtM(val as number)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ---------- II. Client & Agency ---------- */}
            <section className="bg-white border border-[#0c1b3d]/10 shadow-[0_2px_20px_rgba(12,27,61,0.06)] rounded-[6px]">
              <SectionCrest roman="II" title="Klienti & Agjencia" />
              <div className="px-6 pb-6 grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-5">
                  <RoyalLabel>Emri i klientit *</RoyalLabel>
                  <RoyalInput icon={User} value={customerName} onChange={(e: any) => setCustomerName(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <RoyalLabel>Email</RoyalLabel>
                  <RoyalInput type="email" value={customerEmail} onChange={(e: any) => setCustomerEmail(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <RoyalLabel>Telefon</RoyalLabel>
                  <RoyalInput value={customerPhone} onChange={(e: any) => setCustomerPhone(e.target.value)} />
                </div>

                <div className="col-span-12 md:col-span-6">
                  <RoyalLabel>Agjencia (opsionale)</RoyalLabel>
                  <div className="relative">
                    <button type="button" onClick={() => setAgentPickerOpen(o => !o)}
                      className="w-full h-10 px-3 border border-[#0c1b3d]/15 bg-white flex items-center justify-between rounded-[3px] hover:border-[#c8a24a]/70 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rotate-45 border border-[#c8a24a] bg-[#0c1b3d] flex items-center justify-center shrink-0 rounded-[2px]">
                          <span className="-rotate-45 text-[#e9c877] text-[9px] font-bold">
                            {selectedAgent ? (selectedAgent.company ?? "").slice(0, 2).toUpperCase() : <Plus className="w-3 h-3" />}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-[#0c1b3d] truncate">
                          {selectedAgent ? selectedAgent.company || selectedAgent.name : "Direct Booking"}
                        </span>
                        {selectedAgent && selectedAgent.commission != null && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#c8a24a]/12 text-[#a07f2c] font-bold shrink-0 rounded-[2px] uppercase tracking-wider">
                            Komision {selectedAgent.commission}%
                          </span>
                        )}
                      </div>
                      <ChevronDown className={cn("w-4 h-4 text-[#0c1b3d]/40 shrink-0 transition-transform", agentPickerOpen && "rotate-180")} />
                    </button>
                    {agentPickerOpen && (
                      <div className="absolute z-40 mt-1 w-full border border-[#c8a24a]/40 bg-white shadow-[0_12px_36px_rgba(12,27,61,0.18)] overflow-hidden rounded-[4px]">
                        <div className="max-h-72 overflow-auto py-1">
                          <button type="button" onClick={() => { setAgentId(null); setAgentPickerOpen(false); }}
                            className="w-full flex items-center px-3 py-2 text-sm hover:bg-[#c8a24a]/8 text-left text-[#0c1b3d]">
                            <Check className={cn("mr-2 h-4 w-4 text-[#a07f2c]", !agentId ? "opacity-100" : "opacity-0")} />
                            Direct Booking
                          </button>
                          {agents.map((a) => (
                            <button key={a.id} type="button" onClick={() => { setAgentId(a.id); setAgentPickerOpen(false); }}
                              className="w-full flex items-center px-3 py-2 text-sm hover:bg-[#c8a24a]/8 text-left text-[#0c1b3d]">
                              <Check className={cn("mr-2 h-4 w-4 text-[#a07f2c]", agentId === a.id ? "opacity-100" : "opacity-0")} />
                              {a.name} <span className="text-[#0c1b3d]/40 ml-1">({a.company})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-span-12 md:col-span-3">
                  <RoyalLabel>Komision ($)</RoyalLabel>
                  <RoyalInput type="number" value={commission} onChange={(e: any) => setCommission(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <RoyalLabel>Zbritje (€)</RoyalLabel>
                  <RoyalInput type="number" min={0} step="0.01" placeholder="0" value={discount} onChange={(e: any) => setDiscount(e.target.value)} />
                </div>
                <div className="col-span-12">
                  <RoyalLabel>Shënime të brendshme</RoyalLabel>
                  <RoyalInput placeholder="Kërkesa speciale, alergji, etj..." value={notes} onChange={(e: any) => setNotes(e.target.value)} />
                </div>
              </div>
            </section>

            {/* ---------- III. Passengers ---------- */}
            <section className="bg-white border border-[#0c1b3d]/10 shadow-[0_2px_20px_rgba(12,27,61,0.06)] rounded-[6px]">
              <div className="flex items-start justify-between flex-wrap gap-2 pr-6">
                <SectionCrest roman="III" title="Pasagjerët" sub={`${passengers.length} në listë`} />
                <div className="flex items-center gap-1.5 pt-7">
                  {(["adult", "child", "infant"] as const).map(t => (
                    <button key={t} type="button" onClick={() => appendPax(t)}
                      className="h-8 px-3 text-[11px] uppercase tracking-[0.12em] font-bold text-[#0c1b3d]/70 border border-[#0c1b3d]/15 rounded-[3px] hover:border-[#c8a24a] hover:text-[#a07f2c] hover:bg-[#c8a24a]/[0.06] transition-all flex items-center gap-1">
                      <Plus className="w-3 h-3" /> {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-6 pb-6 flex flex-col gap-3">
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
                      "border overflow-hidden transition-all duration-300 rounded-[4px]",
                      expanded ? "border-[#c8a24a]/70 shadow-[0_4px_18px_rgba(200,162,74,0.15)]" : "border-[#0c1b3d]/12 bg-white hover:border-[#0c1b3d]/25"
                    )}>
                      <div className={cn("px-4 py-3 flex items-center justify-between gap-3 flex-wrap", expanded && "bg-gradient-to-r from-[#faf7ef] to-white")}>
                        <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left">
                          <div className={cn(
                            "w-9 h-9 rotate-45 flex items-center justify-center shrink-0 rounded-[3px] border transition-colors",
                            expanded ? "bg-[#0c1b3d] border-[#c8a24a]" : "bg-[#0c1b3d]/5 border-transparent"
                          )}>
                            <PaxIcon type={paxType} className={cn("w-4 h-4 -rotate-45", expanded ? "text-[#e9c877]" : "text-[#0c1b3d]/55")} />
                          </div>
                          <div className="flex flex-col leading-tight min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-['Fraunces'] text-[15px] font-semibold text-[#0c1b3d] truncate">
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${index + 1}`}
                              </span>
                              <span className={cn(
                                "text-[9px] uppercase tracking-[0.15em] font-bold px-1.5 py-0.5 rounded-[2px] shrink-0",
                                paxType === "infant" ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                                  : paxType === "child" ? "bg-[#c8a24a]/12 text-[#a07f2c] ring-1 ring-[#c8a24a]/40"
                                  : "bg-[#0c1b3d]/6 text-[#0c1b3d]/70 ring-1 ring-[#0c1b3d]/12"
                              )}>
                                {TYPE_LABEL[paxType]}
                              </span>
                            </div>
                            {p.dateOfBirth && (
                              <span className="text-[11px] text-[#0c1b3d]/50">Datëlindja: <span className="font-mono">{p.dateOfBirth}</span></span>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {p.hasSeatSelection && <span title="SEAT" className="w-6 h-6 rounded-[3px] bg-[#0c1b3d]/6 text-[#0c1b3d] flex items-center justify-center"><Armchair className="w-3 h-3" /></span>}
                            {p.hasPriorityBoarding && <span title="Priority" className="w-6 h-6 rounded-[3px] bg-[#c8a24a]/15 text-[#a07f2c] flex items-center justify-center"><Zap className="w-3 h-3" /></span>}
                            {p.hasInsurance && <span title="Sigurim" className="w-6 h-6 rounded-[3px] bg-emerald-50 text-emerald-700 flex items-center justify-center"><ShieldCheck className="w-3 h-3" /></span>}
                            {p.baggageOption === "checked" && <span title="Bagazh" className="w-6 h-6 rounded-[3px] bg-[#0c1b3d]/6 text-[#0c1b3d]/70 flex items-center justify-center"><Briefcase className="w-3 h-3" /></span>}
                          </div>
                          <div className="hidden sm:flex items-center gap-2 pl-3 ml-1 border-l border-[#0c1b3d]/10" onClick={(e) => e.stopPropagation()}>
                            {origPrice != null && (
                              <>
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="text-[9px] uppercase tracking-[0.18em] font-bold text-[#0c1b3d]/35">Origjinal</span>
                                  <span className={cn("text-[11px] font-semibold tabular-nums", hasOverride ? "text-[#0c1b3d]/35 line-through" : "text-[#0c1b3d]/60")}>
                                    €{fmtM(origPrice)}
                                  </span>
                                </div>
                                <ArrowRight className="w-3 h-3 text-[#c8a24a]/60" />
                              </>
                            )}
                            <div className="flex flex-col items-end leading-tight">
                              <span className={cn("text-[9px] uppercase tracking-[0.18em] font-bold", hasOverride ? "text-[#a07f2c]" : "text-[#0c1b3d]/35")}>Çmimi €</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={p.ticketPrice ?? ""}
                                placeholder={origPrice != null ? String(origPrice) : "0.00"}
                                onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                                className={cn(
                                  "w-20 h-7 px-2 text-right rounded-[3px] border text-sm font-bold text-[#0c1b3d] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#c8a24a]/25 focus:border-[#c8a24a]",
                                  hasOverride ? "border-[#c8a24a] bg-[#c8a24a]/8" : "border-[#0c1b3d]/15 bg-white"
                                )}
                              />
                            </div>
                          </div>
                          {index > 0 && (
                            <button type="button" onClick={() => removePax(index)} className="text-[#0c1b3d]/35 hover:text-rose-600 p-1 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                            className={cn("text-[#0c1b3d]/40 hover:text-[#0c1b3d] transition-transform duration-300", expanded && "rotate-180")}>
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="px-4 pb-4 border-t border-[#c8a24a]/25 pt-4 grid grid-cols-12 gap-3 bg-white">
                          <div className="col-span-12 sm:col-span-4">
                            <RoyalLabel>Tipi</RoyalLabel>
                            <select value={p.type} onChange={(e) => updatePax(index, { type: e.target.value as Pax["type"] })}
                              className="h-10 w-full px-3 border border-[#0c1b3d]/15 bg-white text-sm rounded-[3px] hover:border-[#0c1b3d]/30 focus:border-[#c8a24a] focus:ring-2 focus:ring-[#c8a24a]/20 focus:outline-none text-[#0c1b3d]">
                              <option value="adult">I rritur</option>
                              <option value="child">Fëmijë</option>
                              <option value="infant">Foshnje</option>
                            </select>
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <RoyalLabel>Emri *</RoyalLabel>
                            <RoyalInput value={p.firstName} onChange={(e: any) => updatePax(index, { firstName: e.target.value })} />
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <RoyalLabel>Mbiemri *</RoyalLabel>
                            <RoyalInput value={p.lastName} onChange={(e: any) => updatePax(index, { lastName: e.target.value })} />
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <RoyalLabel>Datëlindja</RoyalLabel>
                            <RoyalInput type="date" value={p.dateOfBirth || ""} onChange={(e: any) => updatePax(index, { dateOfBirth: e.target.value })} />
                          </div>

                          {/* Mobile price */}
                          <div className="col-span-12 sm:hidden">
                            <RoyalLabel>Çmimi € {origPrice != null ? `(origjinal €${fmtM(origPrice)})` : ""}</RoyalLabel>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={p.ticketPrice ?? ""}
                              placeholder={origPrice != null ? String(origPrice) : "0.00"}
                              onChange={(e) => updatePax(index, { ticketPrice: e.target.value === "" ? null : e.target.value })}
                              className={cn(
                                "h-10 w-full px-3 text-right rounded-[3px] border text-sm font-bold text-[#0c1b3d] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#c8a24a]/25 focus:border-[#c8a24a]",
                                hasOverride ? "border-[#c8a24a] bg-[#c8a24a]/8" : "border-[#0c1b3d]/15 bg-white"
                              )}
                            />
                          </div>

                          <div className="col-span-12 mt-1">
                            <RoyalLabel>Ekstra</RoyalLabel>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <RoyalToggle
                                on={p.baggageOption === "checked"}
                                onClick={() => updatePax(index, { baggageOption: p.baggageOption === "checked" ? "" : "checked" })}
                                icon={Briefcase} label="Bagazh"
                                price={selectedFlight?.checkedBaggagePrice ? `+€${selectedFlight.checkedBaggagePrice}` : ""}
                              />
                              <RoyalToggle on={p.hasSeatSelection} onClick={() => updatePax(index, { hasSeatSelection: !p.hasSeatSelection })} icon={Armchair} label="SEAT"
                                price={selectedFlight?.seatSelectionPrice ? `+€${selectedFlight.seatSelectionPrice}` : ""} />
                              <RoyalToggle on={p.hasPriorityBoarding} onClick={() => updatePax(index, { hasPriorityBoarding: !p.hasPriorityBoarding })} icon={Zap} label="Priority"
                                price={selectedFlight?.priorityBoardingPrice ? `+€${selectedFlight.priorityBoardingPrice}` : ""} />
                              <RoyalToggle on={p.hasInsurance} onClick={() => updatePax(index, { hasInsurance: !p.hasInsurance })} icon={ShieldCheck} label="Sigurim"
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

          {/* ===== Royal ledger sidebar ===== */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 flex flex-col gap-5">
              <div className="rounded-[6px] overflow-hidden border border-[#c8a24a]/40 shadow-[0_16px_48px_rgba(12,27,61,0.3)]"
                style={{ background: `linear-gradient(165deg, #0a1733 0%, ${INK} 45%, #10224e 100%)` }}>
                {/* Crest header */}
                <div className="px-6 pt-6 pb-4 text-center relative">
                  <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                  <div className="mx-auto w-10 h-10 relative flex items-center justify-center mb-2">
                    <div className="absolute inset-0 rotate-45 border border-[#c8a24a]/60 rounded-[3px]" />
                    <Crown className="w-4 h-4 text-[#e9c877]" />
                  </div>
                  <h3 className="font-['Fraunces'] text-[19px] font-semibold text-white">Përmbledhje Rezervimi</h3>
                  <div className="mt-1 text-[9px] uppercase tracking-[0.4em] text-[#c8a24a]">Kings Travel · I Ri</div>
                  <GildedRule className="mt-4 opacity-60" />
                </div>

                <div className="px-6 pb-2">
                  {selectedFlight ? (
                    <div className="border border-[#c8a24a]/30 rounded-[4px] bg-white/[0.04] p-4 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] uppercase tracking-[0.3em] font-bold text-[#e9c877]">Fluturimi</span>
                        <span className="text-[10px] font-semibold text-white/50 tabular-nums">{selectedFlight.departureDate}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-center">
                          <div className="font-['Fraunces'] text-[22px] font-semibold text-white leading-none">{selectedFlight.fromAirport}</div>
                          <div className="text-[10px] text-white/50 mt-1 tabular-nums">{selectedFlight.departureTime}</div>
                        </div>
                        <div className="flex-1 px-3 flex flex-col items-center">
                          <Plane className="w-3.5 h-3.5 text-[#e9c877] rotate-90" />
                          <div className="w-full h-px my-1" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}88, transparent)` }} />
                          <span className="text-[8px] uppercase tracking-[0.3em] text-white/40">Direkt</span>
                        </div>
                        <div className="text-center">
                          <div className="font-['Fraunces'] text-[22px] font-semibold text-white leading-none">{selectedFlight.toAirport}</div>
                          <div className="text-[10px] text-white/50 mt-1 tabular-nums">{selectedFlight.arrivalTime}</div>
                        </div>
                      </div>
                      <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-white/75">{selectedFlight.airline} {fmtFlightNum(selectedFlight.flightNumber)}</span>
                        <span className="font-mono text-[#c8a24a]">€{fmtM(selectedFlight.adultPrice)} bazë</span>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-white/20 p-4 mb-4 text-center text-xs text-white/50 rounded-[4px]">
                      Zgjidh një fluturim
                    </div>
                  )}

                  {/* Per-passenger */}
                  {selectedFlight && passengers.length > 0 && (
                    <div className="mb-4">
                      <div className="text-[9px] uppercase tracking-[0.3em] font-bold text-[#c8a24a] mb-2">Çmimi për pasagjer</div>
                      {passengers.map((p, i) => {
                        const base = p.type === "adult" ? selectedFlight.adultPrice
                          : p.type === "child" ? selectedFlight.childPrice
                          : selectedFlight.infantPrice;
                        const ov = p.ticketPrice;
                        const hasOv = ov != null && ov !== "" && !Number.isNaN(Number(ov)) && Number(ov) !== Number(base);
                        const finalPrice = hasOv ? Number(ov) : Number(base);
                        return (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/8 last:border-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <PaxIcon type={p.type} className="w-3 h-3 text-[#c8a24a] shrink-0" />
                              <span className="text-[12px] font-medium text-white/80 truncate">
                                {(p.firstName || p.lastName) ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : `Pasagjeri ${i + 1}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 tabular-nums">
                              {hasOv && <span className="text-[10px] text-white/35 line-through">€{fmtM(base)}</span>}
                              <span className={cn("text-[13px] font-bold", hasOv ? "text-[#e9c877]" : "text-white/85")}>€{fmtM(finalPrice)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Totals */}
                  <div className="tabular-nums">
                    <SumRow label={`Biletat × ${passengers.length}`} value={`€${fmtM(totals.ticket)}`} />
                    {totals.discount > 0 && (
                      <SumRow label={`Zbritje Agjenti (${totals.discountPct}%)`} value={`−€${fmtM(totals.discount)}`} tone="gold" />
                    )}
                    {totals.manualDiscount > 0 && (
                      <SumRow label="Zbritje manuale" value={`−€${fmtM(totals.manualDiscount)}`} tone="rose" />
                    )}
                    <SumRow label="Taksa" value={`€${fmtM(totals.tax)}`} />
                    <SumRow label="Ekstra" value={`€${fmtM(totals.extras)}`} />
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-white/50">Markup</span>
                      <input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)}
                        className="w-24 h-8 px-2 text-right rounded-[3px] border border-[#c8a24a]/40 bg-white/5 text-sm font-semibold text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#c8a24a]/30 focus:border-[#c8a24a]" />
                    </div>
                  </div>

                  {/* Grand total */}
                  <div className="mt-5 pt-4 border-t border-[#c8a24a]/30">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-[#c8a24a]">Total Klienti</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-[#c8a24a] font-semibold">€</span>
                        <span className="font-['Fraunces'] text-[40px] font-bold text-white tabular-nums leading-none">{fmtM(totals.total)}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-white/45 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rotate-45 bg-[#c8a24a]" />
                      Pagesa menaxhohet pas konfirmimit
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="px-6 py-5 mt-2 border-t border-white/10 flex flex-col gap-2">
                  <button type="submit" disabled={!selectedFlight}
                    className="h-12 text-[13px] uppercase tracking-[0.2em] font-bold text-[#0c1b3d] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:shadow-[0_6px_28px_rgba(200,162,74,0.5)] hover:-translate-y-[1px] rounded-[3px]"
                    style={{ background: `linear-gradient(135deg, #f0d38b, #e9c877 25%, ${GOLD} 60%, ${GOLD_DEEP})` }}>
                    Konfirmo Rezervimin <ArrowRight className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => noop("/bookings")}
                    className="h-9 text-[12px] uppercase tracking-[0.15em] font-semibold text-white/50 hover:text-white transition-colors">
                    Anulo
                  </button>
                </div>
              </div>

              {selectedAgent && (
                <div className="border border-[#c8a24a]/40 bg-gradient-to-br from-[#faf7ef] to-white p-4 rounded-[6px] flex items-start gap-3">
                  <div className="w-8 h-8 rotate-45 border border-[#c8a24a] bg-[#0c1b3d] flex items-center justify-center shrink-0 rounded-[3px]">
                    <Users className="w-3.5 h-3.5 -rotate-45 text-[#e9c877]" />
                  </div>
                  <div className="min-w-0 pl-1">
                    <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#a07f2c] mb-0.5">Agjenti i Zgjedhur</div>
                    <div className="text-[12px] text-[#0c1b3d]/80 leading-relaxed font-medium">
                      {selectedAgent.name} · {selectedAgent.company}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer flourish */}
        <div className="relative max-w-[1400px] mx-auto px-8 pb-10">
          <GildedRule />
          <div className="mt-3 text-center text-[9px] uppercase tracking-[0.4em] text-[#0c1b3d]/35">
            Kings Travel · Tiranë · Që nga 2004
          </div>
        </div>
      </form>
    </div>
  );
}
