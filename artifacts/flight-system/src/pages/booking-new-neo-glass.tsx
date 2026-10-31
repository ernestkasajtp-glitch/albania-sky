import { useState, useMemo, useEffect, useRef } from "react";
import { fmtM, fmtFlightNum, fmtAmPm, cn, wholeMoneyInput } from "@/lib/utils";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getFlightDiscount, applyFlightDiscount, flightDiscountLabel, bookingDiscountChannel } from "@/lib/flightDiscount";
import { useListFlights, useListAgents, useCreateBooking, getListBookingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { dobAgeError } from "@/lib/paxAge";
import { NAME_REGEX, NAME_ERROR } from "@/lib/nameValidation";
import {
  Plane, Search, Calendar, ArrowRight, Users, User, Baby, Plus, Trash2,
  Briefcase, ShieldCheck, Armchair, Zap, ChevronDown, Building2, FileText,
  Check, ChevronRight, Receipt, BadgePercent, Sparkles, Mail, Phone,
} from "lucide-react";

const passengerSchema = z.object({
  type: z.enum(["adult", "child", "infant"]),
  firstName: z.string().min(1, "Required").regex(NAME_REGEX, NAME_ERROR),
  lastName: z.string().min(1, "Required").regex(NAME_REGEX, NAME_ERROR),
  dateOfBirth: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  passportNumber: z.string().optional().nullable(),
  passportExpiry: z.string().optional().nullable(),
  baggageOption: z.string().optional().nullable(),
  hasSeatSelection: z.boolean().default(false),
  hasPriorityBoarding: z.boolean().default(false),
  hasInsurance: z.boolean().default(false),
  ticketPrice: z.coerce.number().optional().nullable(),
});

const bookingSchema = z.object({
  flightId: z.coerce.number().min(1, "Flight is required"),
  agentId: z.coerce.number().optional().nullable(),
  customerName: z.string().min(1, "Required").regex(NAME_REGEX, NAME_ERROR),
  customerEmail: z.string().email().optional().or(z.literal("")).nullable(),
  customerPhone: z.string().optional().nullable(),
  markup: z.coerce.number().min(0).default(0),
  commission: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  notes: z.string().optional().nullable(),
  passengers: z.array(passengerSchema).min(1, "At least one passenger is required"),
});

type FormVals = z.infer<typeof bookingSchema>;

const TYPE_LABEL: Record<string, string> = { adult: "I rritur", child: "Fëmijë", infant: "Foshnje" };

// Consistent readable numeric color used for EVERY amount, total, counter and quantity.
// Numbers are never colored by state or value; state is conveyed by labels/icons only.
const NUM = "text-slate-100";

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
  "ring-1 ring-white/10 hover:ring-white/20 focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus:bg-white/[0.09]",
  "focus:outline-none focus-visible:outline-none transition-all duration-200 [color-scheme:dark]"
);

export default function BookingNewNeoGlass() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [searchDate, setSearchDate] = useState("");

  // Ngarko fluturimet e hapura vetëm një herë; kërkimi sipas qytetit,
  // aeroportit dhe datës bëhet lokalisht për përgjigje të menjëhershme.
  const openFlightsQuery: any = { status: "open", limit: "1000" };
  const { data: flightsResp } = useListFlights(openFlightsQuery);
  const flights = Array.isArray(flightsResp) ? flightsResp : (flightsResp as any)?.data ?? [];
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const { data: agentsRaw } = useListAgents();
  const agents = agentsRaw?.filter((a: any) => a.company !== "Nesti Agjensi");
  const createBooking = useCreateBooking();

  const form = useForm<FormVals>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      markup: 0,
      commission: 0,
      discount: 0,
      passengers: [{ type: "adult", firstName: "", lastName: "", hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "passengers" });

  const watchedFlightId = form.watch("flightId");
  const watchedPassengers = form.watch("passengers");
  const watchedMarkup = form.watch("markup") || 0;
  const watchedManualDiscount = Number(form.watch("discount") || 0);
  const watchedAgentId = form.watch("agentId");

  const selectedFlight = useMemo(
    () => flights?.find((f: any) => f.id === watchedFlightId),
    [flights, watchedFlightId]
  );

  const selectedAgent = useMemo(() => {
    if (!watchedAgentId) return null;
    return agents?.find((a: any) => a.id === Number(watchedAgentId)) ?? null;
  }, [agents, watchedAgentId]);

  const lastSyncedName = useRef<string>("");
  useEffect(() => {
    const first = watchedPassengers?.[0];
    if (!first) return;
    const newName = `${first.firstName ?? ""} ${first.lastName ?? ""}`.trim();
    if (!newName) return;
    const cur = form.getValues("customerName") || "";
    if (cur === "" || cur === lastSyncedName.current) {
      form.setValue("customerName", newName, { shouldValidate: true });
      lastSyncedName.current = newName;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPassengers?.[0]?.firstName, watchedPassengers?.[0]?.lastName]);

  const lastAutoFill = useRef<{ email: string; phone: string }>({ email: "", phone: "" });
  useEffect(() => {
    const cur = {
      email: form.getValues("customerEmail") || "",
      phone: form.getValues("customerPhone") || "",
    };
    if (selectedAgent) {
      const a = selectedAgent as any;
      const newEmail = a.email || "";
      const newPhone = a.phone || "";
      if (cur.email === "" || cur.email === lastAutoFill.current.email) form.setValue("customerEmail", newEmail);
      if (cur.phone === "" || cur.phone === lastAutoFill.current.phone) form.setValue("customerPhone", newPhone);
      lastAutoFill.current = { email: newEmail, phone: newPhone };
      // Auto-fill markup nga agjenti
      const agentMarkup = Number((selectedAgent as any).markup ?? 0);
      form.setValue("markup", agentMarkup, { shouldValidate: true });
    } else {
      if (cur.email === lastAutoFill.current.email && lastAutoFill.current.email !== "") form.setValue("customerEmail", "");
      if (cur.phone === lastAutoFill.current.phone && lastAutoFill.current.phone !== "") form.setValue("customerPhone", "");
      lastAutoFill.current = { email: "", phone: "" };
      form.setValue("markup", 0, { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent?.id, (selectedAgent as any)?.markup]);

  const agentDiscountType  = (selectedAgent as any)?.discountType  ?? "percent";
  const agentDiscountPct   = Number((selectedAgent as any)?.discountPercent ?? 0);
  const agentDiscountFixed = Number((selectedAgent as any)?.discountFixed   ?? 0);
  const agentMarkupPct     = Number((selectedAgent as any)?.markupPercent    ?? 0);

  // Nested passenger edits can keep RHF's array reference unchanged.
  const totals = (() => {
    if (!selectedFlight) return { ticket: 0, tax: 0, extras: 0, markup: watchedMarkup, discount: 0, discountPct: 0, discountFixed: 0, discountType: "percent", manualDiscount: watchedManualDiscount, total: 0, flightDiscount: 0, flightDiscountInfo: null as ReturnType<typeof getFlightDiscount> };
    // Agent discount AND markup are folded into each passenger's effective price PER PERSON,
    // mirroring the backend exactly so the total shown == total charged == total stored.
    // A per-passenger price override is FINAL — no discount/markup is applied to a typed price.
    let ticketGross = 0;   // Σ base (non-override) + override (final), informational
    let effSum = 0;        // Σ per-passenger effective price
    let markupTotal = 0;   // watchedMarkup × non-override passengers
    let extrasCost = 0;
    let flightDiscTotal = 0; // flight-level discount, applied AFTER agency computation / override
    const fd = getFlightDiscount(selectedFlight, bookingDiscountChannel(selectedAgent));
    watchedPassengers.forEach(p => {
      const base = p.type === "adult" ? selectedFlight.adultPrice
        : p.type === "child" ? selectedFlight.childPrice
        : selectedFlight.infantPrice;
      const override = (p as any).ticketPrice;
      const hasOverride = override != null && override !== "" && !Number.isNaN(Number(override));
      if (hasOverride) {
        const wholeOverride = Math.round(Number(override));
        ticketGross += wholeOverride;
        effSum += wholeOverride;
        flightDiscTotal += wholeOverride - applyFlightDiscount(wholeOverride, fd);
      } else {
        const discountedBase = agentDiscountType === "fixed"
          ? Math.max(0, base - (agentDiscountFixed > 0 ? agentDiscountFixed : 0))
          : base * (1 - agentDiscountPct / 100);
        const eff = Math.round(Math.max(0, discountedBase + watchedMarkup + base * agentMarkupPct / 100));
        ticketGross += Math.round(base);
        effSum += eff;
        flightDiscTotal += eff - applyFlightDiscount(eff, fd);
        markupTotal += Math.round(watchedMarkup + base * agentMarkupPct / 100);
      }
      if (p.baggageOption === "checked" && selectedFlight.checkedBaggagePrice) extrasCost += Math.round(selectedFlight.checkedBaggagePrice);
      if (p.hasSeatSelection && selectedFlight.seatSelectionPrice) extrasCost += Math.round(selectedFlight.seatSelectionPrice);
      if (p.hasPriorityBoarding && selectedFlight.priorityBoardingPrice) extrasCost += Math.round(selectedFlight.priorityBoardingPrice);
      if (p.hasInsurance && selectedFlight.insurancePrice) extrasCost += Math.round(selectedFlight.insurancePrice);
    });
    const tax = Math.round(selectedFlight.tax) * watchedPassengers.length;
    const manualDiscount = Math.max(0, Math.round(watchedManualDiscount));
    markupTotal = Math.round(markupTotal);
    const discount = Math.round(ticketGross - effSum + markupTotal);
    const total = Math.round(effSum - flightDiscTotal + tax + extrasCost - manualDiscount);
    return {
      flightDiscount: flightDiscTotal, flightDiscountInfo: fd,
      ticket: ticketGross, tax, extras: extrasCost, markup: watchedMarkup,
      discount, discountPct: agentDiscountPct, discountFixed: agentDiscountFixed, discountType: agentDiscountType,
      manualDiscount, total,
    };
  })();

  const onSubmit = (values: FormVals) => {
    const data = {
      ...values,
      discount: Math.round(Number(values.discount || 0)),
      agentId: values.agentId || null,
      customerEmail: values.customerEmail || null,
      customerPhone: values.customerPhone || null,
      notes: values.notes || null,
      passengers: values.passengers.map(p => ({
        ...p,
        dateOfBirth: p.dateOfBirth || null,
        nationality: p.nationality || null,
        passportNumber: p.passportNumber || null,
        passportExpiry: p.passportExpiry || null,
        baggageOption: p.baggageOption || null,
        ticketPrice: (p as any).ticketPrice != null && (p as any).ticketPrice !== "" && !Number.isNaN(Number((p as any).ticketPrice))
          ? Math.round(Number((p as any).ticketPrice)) : null,
      })),
    };
    // Validim moshe sipas datëlindjes (foshnjë <2 vjeç, fëmijë 2–11) në datën e fluturimit
    for (const p of values.passengers) {
      const ageErr = dobAgeError(p.type, p.dateOfBirth, selectedFlight?.departureDate);
      if (ageErr) {
        toast({ title: "Datëlindje e pavlefshme", description: ageErr, variant: "destructive" });
        return;
      }
    }
    createBooking.mutate({ data }, {
      onSuccess: (res) => {
        toast({ title: "Booking created successfully" });
        queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
        setLocation(`/bookings/${res.id}`);
      },
      onError: (err: any) => {
        toast({ title: "Error creating booking", description: err.message, variant: "destructive" });
      },
    });
  };

  // Visual: which pax card is expanded (UI-only state, no functional change)
  const [expandedIdx, setExpandedIdx] = useState<number>(0);

  const stepFlight = !!selectedFlight;
  const stepPax = stepFlight && watchedPassengers.every(p => p.firstName && p.lastName);

  const hasSearch = !!(searchFrom || searchTo || searchDate);
  const matchTxt = (val: string, q: string) => !q ? true : (val ?? "").toLowerCase().includes(q.toLowerCase());
  const filtered = !hasSearch ? [] : (flights ?? []).filter((f: any) => {
    const fromOk = !searchFrom || matchTxt(f.fromCity, searchFrom) || matchTxt(f.fromAirport, searchFrom);
    const toOk = !searchTo || matchTxt(f.toCity, searchTo) || matchTxt(f.toAirport, searchTo);
    const dateOk = !searchDate || f.departureDate === searchDate;
    return fromOk && toOk && dateOk;
  });

  return (
    <div className="-mx-4 -my-4 md:-mx-6 md:-my-6 relative min-h-screen antialiased text-slate-100 bg-[#070b1c] overflow-x-clip selection:bg-cyan-300/30">
      {/* Spectral background */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute -top-48 -left-40 w-[42rem] h-[42rem] rounded-full opacity-40 blur-[110px]"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.5), transparent 65%)" }} />
        <div className="absolute top-1/3 -right-56 w-[46rem] h-[46rem] rounded-full opacity-35 blur-[130px]"
          style={{ background: "radial-gradient(circle, rgba(167,139,250,0.5), transparent 65%)" }} />
        <div className="absolute -bottom-64 left-1/4 w-[40rem] h-[40rem] rounded-full opacity-25 blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(52,211,153,0.45), transparent 65%)" }} />
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "linear-gradient(rgba(148,163,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,255,0.6) 1px, transparent 1px)", backgroundSize: "72px 72px" }} />
        <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="relative z-10">
          {/* ===== Top bar ===== */}
          <header className="sticky top-0 z-40 backdrop-blur-2xl bg-[#070b1c]/60 border-b border-white/[0.07]">
            <div className="px-4 md:px-8 py-3 flex items-center justify-between gap-3 max-w-[1440px] mx-auto">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400/25 via-sky-500/20 to-violet-500/25 ring-1 ring-cyan-300/30 flex items-center justify-center shadow-[0_0_28px_-4px_rgba(56,189,248,0.55)]">
                  <Plane className="w-4 h-4 text-cyan-200 -rotate-45" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] uppercase tracking-[0.32em] font-semibold text-cyan-300/70">KINGS TRAVEL · OPS</span>
                  <span className="text-sm font-bold tracking-wide text-white">Rezervim i Ri</span>
                </div>
              </div>
              <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-2 text-[11px] tracking-wider text-slate-400">
                <span>OPERACIONET</span>
                <ChevronRight className="w-3 h-3 text-cyan-300/60" aria-hidden="true" />
                <span>REZERVIMET</span>
                <ChevronRight className="w-3 h-3 text-cyan-300/60" aria-hidden="true" />
                <span className="text-cyan-200" aria-current="page">I RI</span>
              </nav>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setLocation("/bookings")}
                  className="h-9 px-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">Anulo</button>
                <button type="submit" disabled={createBooking.isPending || !selectedFlight}
                  className="hidden sm:flex h-9 px-3.5 text-sm font-semibold text-cyan-100 rounded-xl items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed bg-white/[0.06] ring-1 ring-cyan-300/25 hover:ring-cyan-300/50 hover:bg-cyan-400/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Krijo
                </button>
              </div>
            </div>
            {/* Stepper */}
            <div className="px-4 md:px-8 pb-3 max-w-[1440px] mx-auto">
              <ol className="flex items-center gap-3 max-w-4xl">
                <Step n={1} label="Fluturimi" done={stepFlight} active={!stepFlight} />
                <StepLine done={stepFlight} />
                <Step n={2} label="Pasagjerët" done={stepPax} active={stepFlight && !stepPax} />
                <StepLine done={stepPax} />
                <Step n={3} label="Konfirmim" done={false} active={stepPax} />
              </ol>
            </div>
          </header>

          {/* ===== Body ===== */}
          <div className="px-4 md:px-8 py-7 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1440px] mx-auto">
            <div className="lg:col-span-8 flex flex-col gap-6">

              {/* ---- Flight selection ---- */}
              <section className={cn("rounded-3xl overflow-hidden", glass)} aria-label="Zgjidh fluturimin">
                <div className="h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" aria-hidden="true" />
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
                  <span className="text-[10px] tracking-[0.25em] text-slate-500">
                    GATE <span className={NUM}>01</span>
                  </span>
                </header>

                {/* Search */}
                <div className="px-6 py-4 grid grid-cols-12 gap-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                  <div className="col-span-12 md:col-span-4 relative">
                    <Plane className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-300/60 pointer-events-none" aria-hidden="true" />
                    <input value={searchFrom} onChange={e => setSearchFrom(e.target.value)} placeholder="Nga (qytet/aeroport)"
                      aria-label="Nga (qytet ose aeroport)" className={cn(glassInput, "pl-10 pr-3")} />
                  </div>
                  <div className="col-span-12 md:col-span-4 relative">
                    <Plane className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-300/60 rotate-90 pointer-events-none" aria-hidden="true" />
                    <input value={searchTo} onChange={e => setSearchTo(e.target.value)} placeholder="Për (qytet/aeroport)"
                      aria-label="Për (qytet ose aeroport)" className={cn(glassInput, "pl-10 pr-3")} />
                  </div>
                  <div className="col-span-10 md:col-span-3 relative">
                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
                    <input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)}
                      aria-label="Data e fluturimit" className={cn(glassInput, "pl-10 pr-3")} />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <div className="h-10 w-full rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-[#070b1c] flex items-center justify-center shadow-[0_0_24px_-4px_rgba(56,189,248,0.7)]">
                      <Search className="w-4 h-4" aria-hidden="true" />
                    </div>
                  </div>
                </div>

                {/* Flight boards */}
                <FormField control={form.control} name="flightId" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="p-5 flex flex-col gap-3">
                        {!hasSearch ? (
                          <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
                            <Search className="w-6 h-6 mx-auto text-slate-600 mb-2" aria-hidden="true" />
                            <p className="text-sm text-slate-400">Plotësoni fushat sipër për të kërkuar fluturim.</p>
                          </div>
                        ) : filtered.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
                            <p className="text-sm text-slate-400">Asnjë fluturim nuk u gjet.</p>
                          </div>
                        ) : filtered.slice(0, 30).map((f: any) => {
                          const selected = field.value === f.id;
                          const dep = fmtAmPm(f.departureTime) || "—";
                          const arr = fmtAmPm(f.arrivalTime) || "—";
                          return (
                            <button key={f.id} type="button" onClick={() => field.onChange(f.id)}
                              aria-pressed={selected}
                              className={cn(
                                "group relative w-full text-left rounded-2xl transition-all duration-300 overflow-hidden",
                                "bg-white/[0.04] ring-1 backdrop-blur-md hover:-translate-y-0.5",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                                f.isConfirmed
                                  ? selected
                                    ? "ring-emerald-300/90 bg-emerald-400/35 shadow-[0_0_38px_-8px_rgba(52,211,153,0.72)] hover:bg-emerald-400/40"
                                    : "ring-emerald-300/70 bg-emerald-400/27 hover:ring-emerald-200/90 hover:bg-emerald-400/35"
                                  : selected
                                  ? "ring-blue-300/70 bg-blue-400/20 shadow-[0_0_38px_-8px_rgba(59,130,246,0.60)] hover:bg-blue-400/25"
                                  : "ring-blue-300/35 bg-blue-400/10 hover:ring-blue-300/60 hover:bg-blue-400/16"
                              )}
                            >
                              {selected && (
                                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" aria-hidden="true" />
                              )}
                              <div className="px-4 py-3 flex items-center gap-4">
                                <div className={cn(
                                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ring-1",
                                  selected ? "bg-cyan-400/20 ring-cyan-300/40 shadow-[0_0_18px_-2px_rgba(56,189,248,0.6)]" : "bg-white/[0.06] ring-white/10 group-hover:ring-cyan-300/30"
                                )}>
                                  <Plane className={cn("w-4 h-4 -rotate-45 transition-colors", selected ? "text-cyan-200" : "text-slate-400 group-hover:text-cyan-200")} aria-hidden="true" />
                                </div>
                                <div className="shrink-0 min-w-0 w-[98px]">
                                  <div className="text-[12px] font-bold tracking-wider text-white truncate leading-tight flex items-center gap-1.5">
                                    {f.airline}
                                    {f.isConfirmed && (
                                      <span title="Fluturim i Konfirmuar" className="inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] shrink-0" role="img" aria-label="Fluturim i konfirmuar" />
                                    )}
                                  </div>
                                  <div className={cn("text-[10px] tracking-widest", NUM)}>{fmtFlightNum(f.flightNumber)}</div>
                                </div>
                                {/* Desktop route */}
                                <div className="hidden md:flex items-center gap-4 flex-1 justify-center min-w-0">
                                  <div className="text-right">
                                    <div className={cn("text-[15px] font-bold leading-tight tabular-nums", NUM)}>{dep}</div>
                                    <div className="text-[9px] uppercase tracking-[0.2em] text-cyan-300/70">{f.fromAirport || f.fromCity}</div>
                                  </div>
                                  <div className="flex flex-col items-center gap-1 px-2 min-w-[92px]">
                                    <div className={cn("text-[10px] leading-none tabular-nums", NUM)}>{f.departureDate}</div>
                                    <div className="relative w-20 h-px bg-gradient-to-r from-cyan-300/0 via-cyan-300/60 to-violet-400/0">
                                      <div className="absolute -top-[2.5px] left-0 w-[5px] h-[5px] rounded-full bg-cyan-300 shadow-[0_0_6px_rgba(56,189,248,0.9)]" />
                                      <Plane className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 text-white rotate-90 drop-shadow-[0_0_5px_rgba(56,189,248,0.9)]" aria-hidden="true" />
                                      <div className="absolute -top-[2.5px] right-0 w-[5px] h-[5px] rounded-full bg-violet-300 shadow-[0_0_6px_rgba(167,139,250,0.9)]" />
                                    </div>
                                    <div className="text-[7.5px] uppercase tracking-[0.3em] text-slate-500 leading-none">Direkt</div>
                                  </div>
                                  <div className="text-left">
                                    <div className={cn("text-[15px] font-bold leading-tight tabular-nums", NUM)}>{arr}</div>
                                    <div className="text-[9px] uppercase tracking-[0.2em] text-violet-300/70">{f.toAirport || f.toCity}</div>
                                  </div>
                                </div>
                                {/* Mobile route */}
                                <div className="md:hidden flex-1 min-w-0">
                                  <div className={cn("flex items-center gap-1.5 text-[14px] font-bold tabular-nums leading-tight", NUM)}>
                                    <span>{dep}</span>
                                    <Plane className="w-2.5 h-2.5 text-cyan-300 rotate-90 shrink-0" aria-hidden="true" />
                                    <span>{arr}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate">{(f.fromAirport || f.fromCity)} → {(f.toAirport || f.toCity)} · {f.departureDate}</div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1 shrink-0 pl-4 border-l border-white/10">
                                  <div className="flex items-start gap-[2px] tabular-nums leading-none">
                                    <span className={cn("text-[10px] font-bold mt-[2px]", NUM)}>€</span>
                                    <span className={cn("text-[19px] font-bold tracking-tight", NUM)}>{fmtM(f.adultPrice)}</span>
                                  </div>
                                  <span className={cn(
                                    "inline-flex items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-[0.15em] rounded-full px-2 py-[2px] ring-1",
                                    f.availableSeats < 10
                                      ? "text-amber-200 bg-amber-400/10 ring-amber-300/30"
                                      : "text-emerald-200 bg-emerald-400/10 ring-emerald-300/30"
                                  )}>
                                    <span className={cn("w-1 h-1 rounded-full", f.availableSeats < 10 ? "bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.9)]" : "bg-emerald-300 shadow-[0_0_6px_rgba(52,211,153,0.9)]")} aria-hidden="true" />
                                    <span className={NUM}>{f.availableSeats}</span> VENDE
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </FormControl>
                    <div className="px-6 pb-3"><FormMessage /></div>
                  </FormItem>
                )} />

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
              <section className={cn("rounded-3xl", glass)} aria-label="Klienti dhe agjencia">
                <div className="h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent rounded-t-3xl" aria-hidden="true" />
                <header className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-400/15 text-violet-300 ring-1 ring-violet-300/30 flex items-center justify-center"><Building2 className="w-4 h-4" /></div>
                  <h3 className="text-sm font-bold tracking-wide text-white uppercase">Klienti & Agjencia</h3>
                </header>
                <div className="p-6 grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-5">
                    <GLabel accent="text-cyan-300" htmlFor="customerName">Emri i klientit *</GLabel>
                    <FormField control={form.control} name="customerName" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" aria-hidden="true" />
                            <input id="customerName" {...field} className={cn(glassInput, "pl-10 pr-3")} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <GLabel accent="text-violet-300" htmlFor="customerEmail">Email</GLabel>
                    <FormField control={form.control} name="customerEmail" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" aria-hidden="true" />
                            <input id="customerEmail" type="email" {...field} value={field.value || ""} className={cn(glassInput, "pl-10 pr-3")} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <GLabel accent="text-sky-300" htmlFor="customerPhone">Telefon</GLabel>
                    <FormField control={form.control} name="customerPhone" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" aria-hidden="true" />
                            <input id="customerPhone" {...field} value={field.value || ""} className={cn(glassInput, "pl-10 pr-3")} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="col-span-12 md:col-span-6">
                    <GLabel accent="text-emerald-300">Agjencia (opsionale)</GLabel>
                    <FormField control={form.control} name="agentId" render={({ field }) => {
                      const current = field.value ? agents?.find((a: any) => a.id === Number(field.value)) : null;
                      const initials = current ? ((current as any).company ?? (current as any).name ?? "").slice(0, 2).toUpperCase() : "—";
                      return (
                        <FormItem>
                          <Popover open={agentPickerOpen} onOpenChange={setAgentPickerOpen}>
                            <PopoverTrigger asChild>
                              <button type="button"
                                className={cn(glassInput, "px-3 flex items-center justify-between text-left")}>
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-400/40 to-violet-500/40 ring-1 ring-white/20 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                    {current ? initials : <Plus className="w-3 h-3" aria-hidden="true" />}
                                  </div>
                                  <span className="text-sm font-semibold text-white truncate">
                                    {current ? (current as any).company || (current as any).name : "Direct Booking"}
                                  </span>
                                  {current && (current as any).commission != null && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-400/15 text-violet-200 ring-1 ring-violet-300/25 font-semibold shrink-0">
                                      Komision <span className={NUM}>{(current as any).commission}</span>%
                                    </span>
                                  )}
                                </div>
                                <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform", agentPickerOpen && "rotate-180")} aria-hidden="true" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0 border-white/15 bg-[#0d1330]/95 backdrop-blur-2xl text-slate-100" align="start">
                              <Command filter={(v, s) => v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0} className="bg-transparent text-slate-100">
                                <CommandInput placeholder="Kërko agjentin..." />
                                <CommandList className="max-h-72">
                                  <CommandEmpty>S'u gjet asnjë agjent.</CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem value="direct booking" onSelect={() => { field.onChange(null); setAgentPickerOpen(false); }}>
                                      <Check className={cn("mr-2 h-4 w-4 text-cyan-300", !field.value ? "opacity-100" : "opacity-0")} />
                                      Direct Booking
                                    </CommandItem>
                                    {agents?.map((a: any) => (
                                      <CommandItem key={a.id} value={`${a.name} ${a.company}`}
                                        onSelect={() => { field.onChange(a.id); setAgentPickerOpen(false); }}>
                                        <Check className={cn("mr-2 h-4 w-4 text-cyan-300", Number(field.value) === a.id ? "opacity-100" : "opacity-0")} />
                                        {a.name} <span className="text-slate-400 ml-1">({a.company})</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      );
                    }} />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <GLabel accent="text-fuchsia-300" htmlFor="commission">Komision ($)</GLabel>
                    <FormField control={form.control} name="commission" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <BadgePercent className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" aria-hidden="true" />
                            <input id="commission" type="number" {...field} className={cn(glassInput, "pl-10 pr-3 tabular-nums")} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <GLabel accent="text-amber-300" htmlFor="discount">Zbritje (€)</GLabel>
                    <FormField control={form.control} name="discount" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <input id="discount" type="number" min={0} step="1" placeholder="0" {...field}
                            value={field.value === 0 ? "" : field.value}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.onChange(e.target.value === "" ? 0 : e.target.value)}
                            className={cn(glassInput, "px-3 tabular-nums")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="col-span-12">
                    <GLabel accent="text-slate-300" htmlFor="notes">Shënime të brendshme</GLabel>
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <input id="notes" placeholder="Kërkesa speciale, alergji, etj..." {...field} value={field.value || ""} className={cn(glassInput, "px-3")} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>
              </section>

              {/* ---- Passengers ---- */}
              <section className={cn("rounded-3xl", glass)} aria-label="Pasagjerët">
                <div className="h-px bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent rounded-t-3xl" aria-hidden="true" />
                <header className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-300/30 flex items-center justify-center"><Users className="w-4 h-4" /></div>
                    <h3 className="text-sm font-bold tracking-wide text-white uppercase">Pasagjerët</h3>
                    <span className={cn("px-2 py-0.5 rounded-lg text-[11px] font-bold bg-white/[0.08] ring-1 ring-white/10 tabular-nums", NUM)}>{fields.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(["adult", "child", "infant"] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => { append({ type: t, firstName: "", lastName: "", hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false }); setExpandedIdx(fields.length); }}
                        className="h-8 px-3 text-xs font-semibold text-slate-200 bg-white/[0.05] ring-1 ring-white/12 rounded-xl hover:ring-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100 transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
                        <Plus className="w-3 h-3" aria-hidden="true" /> {TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </header>

                <div className="p-5 flex flex-col gap-3">
                  {fields.map((field, index) => {
                    const p = watchedPassengers?.[index] ?? ({} as any);
                    const expanded = expandedIdx === index;
                    const paxType = p.type || "adult";
                    const origPrice = selectedFlight
                      ? (paxType === "adult" ? selectedFlight.adultPrice : paxType === "child" ? selectedFlight.childPrice : selectedFlight.infantPrice)
                      : null;
                    const override = (p as any).ticketPrice;
                    const hasOverride = override != null && override !== "" && !Number.isNaN(Number(override)) && (origPrice == null || Number(override) !== Number(origPrice));
                    return (
                      <div key={field.id} className={cn(
                        "rounded-2xl overflow-hidden transition-all duration-300 ring-1",
                        expanded
                          ? "ring-cyan-300/35 bg-cyan-400/[0.05] shadow-[0_0_34px_-10px_rgba(56,189,248,0.5)]"
                          : "ring-white/10 bg-white/[0.03] hover:ring-white/20"
                      )}>
                        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                          <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                            aria-expanded={expanded}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
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
                                <span className="text-[11px] text-slate-400">Datëlindja: <span className={cn("tabular-nums", NUM)}>{p.dateOfBirth}</span></span>
                              )}
                            </div>
                          </button>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              {p.hasSeatSelection && <span title="SEAT" className="w-6 h-6 rounded-lg bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-300/25 flex items-center justify-center" role="img" aria-label="Zgjedhje vendi"><Armchair className="w-3 h-3" /></span>}
                              {p.hasPriorityBoarding && <span title="Priority" className="w-6 h-6 rounded-lg bg-amber-400/15 text-amber-300 ring-1 ring-amber-300/25 flex items-center justify-center" role="img" aria-label="Hipje me përparësi"><Zap className="w-3 h-3" /></span>}
                              {p.hasInsurance && <span title="Sigurim" className="w-6 h-6 rounded-lg bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/25 flex items-center justify-center" role="img" aria-label="Sigurim"><ShieldCheck className="w-3 h-3" /></span>}
                              {p.baggageOption === "checked" && <span title="Bagazh" className="w-6 h-6 rounded-lg bg-white/[0.08] text-slate-300 ring-1 ring-white/15 flex items-center justify-center" role="img" aria-label="Bagazh"><Briefcase className="w-3 h-3" /></span>}
                            </div>
                            <div className="hidden sm:flex items-center gap-2.5 pl-3 ml-1 border-l border-white/10" onClick={(e) => e.stopPropagation()}>
                              {origPrice != null && (
                                <>
                                  <div className="flex flex-col items-end leading-tight">
                                    <span className="text-[8px] uppercase tracking-[0.2em] font-bold text-slate-500">Origjinal</span>
                                    <span className={cn("text-[11px] font-semibold tabular-nums", NUM, hasOverride && "line-through")}>
                                      €{fmtM(origPrice)}
                                    </span>
                                  </div>
                                  <ArrowRight className="w-3 h-3 text-slate-600" aria-hidden="true" />
                                </>
                              )}
                              <div className="flex flex-col items-end leading-tight">
                                <span className={cn("text-[8px] uppercase tracking-[0.2em] font-bold", hasOverride ? "text-emerald-300" : "text-slate-500")}>Çmimi €</span>
                                <FormField control={form.control} name={`passengers.${index}.ticketPrice` as any} render={({ field: f }) => (
                                  <FormItem className="m-0">
                                    <FormControl>
                                      <input
                                        type="text" inputMode="numeric"
                                        aria-label={`Çmimi për pasagjerin ${index + 1}`}
                                        value={f.value == null || f.value === "" ? "" : wholeMoneyInput(String(f.value))}
                                        placeholder={origPrice != null ? fmtM(origPrice) : "0"}
                                        onChange={(e) => {
                                          const next = wholeMoneyInput(e.target.value);
                                          f.onChange(next === "" ? null : next);
                                        }}
                                        className={cn(
                                          "w-20 h-7 px-2 text-right rounded-lg text-sm font-bold tabular-nums focus:outline-none focus-visible:outline-none transition-all",
                                          NUM,
                                          hasOverride
                                            ? "bg-emerald-400/10 ring-1 ring-emerald-300/50 focus-visible:ring-2 focus-visible:ring-emerald-300/60"
                                            : "bg-white/[0.06] ring-1 ring-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                                        )}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )} />
                              </div>
                            </div>
                            {index > 0 && (
                              <button type="button" onClick={() => remove(index)} aria-label={`Hiq pasagjerin ${index + 1}`}
                                className="text-slate-500 hover:text-rose-400 p-1 transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button type="button" onClick={() => setExpandedIdx(expanded ? -1 : index)}
                              aria-label={expanded ? "Mbyll detajet" : "Hap detajet"}
                              className={cn("text-slate-500 hover:text-cyan-200 transition-transform duration-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60", expanded && "rotate-180")}>
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div className="px-4 pb-5 pt-4 border-t border-white/[0.07] grid grid-cols-12 gap-3">
                            <div className="col-span-12 sm:col-span-4">
                              <GLabel htmlFor={`pax-type-${index}`}>Tipi</GLabel>
                              <FormField control={form.control} name={`passengers.${index}.type`} render={({ field: f }) => (
                                <FormItem>
                                  <FormControl>
                                    <select id={`pax-type-${index}`} value={f.value} onChange={(e) => f.onChange(e.target.value)}
                                      className={cn(glassInput, "px-3 appearance-none bg-[#0d1330]")}>
                                      <option value="adult">I rritur</option>
                                      <option value="child">Fëmijë</option>
                                      <option value="infant">Foshnje</option>
                                    </select>
                                  </FormControl>
                                </FormItem>
                              )} />
                            </div>
                            <div className="col-span-12 sm:col-span-4">
                              <GLabel htmlFor={`pax-first-${index}`}>Emri *</GLabel>
                              <FormField control={form.control} name={`passengers.${index}.firstName`} render={({ field: f }) => (
                                <FormItem><FormControl><input id={`pax-first-${index}`} {...f} className={cn(glassInput, "px-3")} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </div>
                            <div className="col-span-12 sm:col-span-4">
                              <GLabel htmlFor={`pax-last-${index}`}>Mbiemri *</GLabel>
                              <FormField control={form.control} name={`passengers.${index}.lastName`} render={({ field: f }) => (
                                <FormItem><FormControl><input id={`pax-last-${index}`} {...f} className={cn(glassInput, "px-3")} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </div>
                            <div className="col-span-12 sm:col-span-4">
                              <GLabel htmlFor={`pax-dob-${index}`}>Datëlindja</GLabel>
                              <FormField control={form.control} name={`passengers.${index}.dateOfBirth`} render={({ field: f }) => (
                                <FormItem><FormControl><input id={`pax-dob-${index}`} type="date" {...f} value={f.value || ""} className={cn(glassInput, "px-3")} /></FormControl></FormItem>
                              )} />
                            </div>

                            {/* Price override — mobile */}
                            <div className="col-span-12 sm:hidden">
                              <GLabel htmlFor={`pax-price-${index}`}>Çmimi € {origPrice != null ? `(origjinal €${fmtM(origPrice)})` : ""}</GLabel>
                              <FormField control={form.control} name={`passengers.${index}.ticketPrice` as any} render={({ field: f }) => {
                                const hasOverrideM = f.value != null && f.value !== "" && !Number.isNaN(Number(f.value)) && (origPrice == null || Number(f.value) !== Number(origPrice));
                                return (
                                  <FormItem>
                                    <FormControl>
                                      <input
                                        id={`pax-price-${index}`}
                                        type="text" inputMode="numeric"
                                        value={f.value == null || f.value === "" ? "" : wholeMoneyInput(String(f.value))}
                                        placeholder={origPrice != null ? fmtM(origPrice) : "0"}
                                        onChange={(e) => {
                                          const next = wholeMoneyInput(e.target.value);
                                          f.onChange(next === "" ? null : next);
                                        }}
                                        className={cn(glassInput, "px-3 text-right font-bold tabular-nums", hasOverrideM && "ring-emerald-300/50")}
                                      />
                                    </FormControl>
                                  </FormItem>
                                );
                              }} />
                            </div>

                            <div className="col-span-12 mt-1">
                              <GLabel>Ekstra</GLabel>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                                <FormField control={form.control} name={`passengers.${index}.baggageOption`} render={({ field: f }) => (
                                  <ExtraChip on={f.value === "checked"}
                                    onClick={() => f.onChange(f.value === "checked" ? "" : "checked")}
                                    icon={Briefcase} label="Bagazh"
                                    price={selectedFlight?.checkedBaggagePrice ? `+€${selectedFlight.checkedBaggagePrice}` : ""} />
                                )} />
                                <FormField control={form.control} name={`passengers.${index}.hasSeatSelection`} render={({ field: f }) => (
                                  <ExtraChip on={!!f.value} onClick={() => f.onChange(!f.value)} icon={Armchair} label="SEAT"
                                    price={selectedFlight?.seatSelectionPrice ? `+€${selectedFlight.seatSelectionPrice}` : ""} />
                                )} />
                                <FormField control={form.control} name={`passengers.${index}.hasPriorityBoarding`} render={({ field: f }) => (
                                  <ExtraChip on={!!f.value} onClick={() => f.onChange(!f.value)} icon={Zap} label="Priority"
                                    price={selectedFlight?.priorityBoardingPrice ? `+€${selectedFlight.priorityBoardingPrice}` : ""} />
                                )} />
                                <FormField control={form.control} name={`passengers.${index}.hasInsurance`} render={({ field: f }) => (
                                  <ExtraChip on={!!f.value} onClick={() => f.onChange(!f.value)} icon={ShieldCheck} label="Sigurim"
                                    price={selectedFlight?.insurancePrice ? `+€${selectedFlight.insurancePrice}` : ""} />
                                )} />
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
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-300/0 via-cyan-300/80 to-violet-300/0" aria-hidden="true" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Receipt className="w-4 h-4 text-cyan-200" aria-hidden="true" />
                        <h3 className="text-sm font-bold text-white tracking-wide uppercase">Përmbledhje Rezervimi</h3>
                      </div>
                      <span className="text-[9px] uppercase font-bold tracking-[0.2em] px-2 py-1 rounded-full bg-cyan-300 text-[#070b1c] shadow-[0_0_16px_rgba(103,232,249,0.6)]">I Ri</span>
                    </div>
                  </header>
                  <div className="p-6">
                    {/* Boarding-pass flight summary */}
                    {selectedFlight ? (
                      <div className="relative rounded-2xl bg-white/[0.04] ring-1 ring-cyan-300/20 p-4 mb-5 overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-cyan-400/15 blur-2xl pointer-events-none" aria-hidden="true" />
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[9px] uppercase font-bold text-cyan-300 tracking-[0.28em]">Fluturimi</span>
                          <span className={cn("text-[10px] tabular-nums", NUM)}>{selectedFlight.departureDate}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-center">
                            <div className={cn("text-2xl font-bold leading-none tracking-tight", NUM)}>{selectedFlight.fromAirport || selectedFlight.fromCity}</div>
                            <div className={cn("text-[10px] mt-1 tabular-nums", NUM)}>{fmtAmPm(selectedFlight.departureTime)}</div>
                          </div>
                          <div className="flex-1 px-3 flex flex-col items-center">
                            <Plane className="w-3.5 h-3.5 text-white rotate-90 drop-shadow-[0_0_6px_rgba(56,189,248,0.9)]" aria-hidden="true" />
                            <div className="w-full h-px bg-gradient-to-r from-cyan-300/10 via-cyan-300/60 to-violet-300/10 my-1" aria-hidden="true" />
                            <span className="text-[9px] uppercase tracking-[0.3em] text-slate-500">Direkt</span>
                          </div>
                          <div className="text-center">
                            <div className={cn("text-2xl font-bold leading-none tracking-tight", NUM)}>{selectedFlight.toAirport || selectedFlight.toCity}</div>
                            <div className={cn("text-[10px] mt-1 tabular-nums", NUM)}>{fmtAmPm(selectedFlight.arrivalTime)}</div>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-dashed border-white/15 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-200">{selectedFlight.airline} <span className={NUM}>{fmtFlightNum(selectedFlight.flightNumber)}</span></span>
                          <span className={cn("tabular-nums", NUM)}>€{fmtM(selectedFlight.adultPrice)} bazë</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/15 p-5 mb-5 text-center text-xs text-slate-400">
                        Zgjidh një fluturim
                      </div>
                    )}

                    {/* Per-passenger */}
                    {selectedFlight && watchedPassengers.length > 0 && (
                      <div className="space-y-1 text-sm tabular-nums mb-4">
                        <div className="text-[9px] uppercase tracking-[0.28em] font-bold text-slate-500 mb-2">Çmimi për pasagjer</div>
                        {watchedPassengers.map((p, i) => {
                          const base = p.type === "adult" ? selectedFlight.adultPrice
                            : p.type === "child" ? selectedFlight.childPrice
                            : selectedFlight.infantPrice;
                          const ov = (p as any).ticketPrice;
                          const hasOv = ov != null && ov !== "" && !Number.isNaN(Number(ov)) && Number(ov) !== Number(base);
                          // Same per-passenger math as totals: override (whole €) or agency discount+markup, then flight discount.
                          const agencyEff = agentDiscountType === "fixed"
                            ? Math.max(0, base - (agentDiscountFixed > 0 ? agentDiscountFixed : 0))
                            : base * (1 - agentDiscountPct / 100);
                          const isOv = ov != null && ov !== "" && !Number.isNaN(Number(ov)); // matches totals (override even if = base)
                          const preFd = isOv ? Math.round(Number(ov))
                            : Math.round(Math.max(0, agencyEff + watchedMarkup + base * agentMarkupPct / 100));
                          const finalPrice = applyFlightDiscount(preFd, totals.flightDiscountInfo);
                          const showStrike = hasOv || finalPrice !== Math.round(Number(base));
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
                              <div className="flex items-center gap-1.5 tabular-nums">
                                {showStrike && (
                                  <span className={cn("text-[10px] line-through", NUM)}>€{fmtM(base)}</span>
                                )}
                                <span className={cn("text-[13px] font-bold", NUM)}>€{fmtM(finalPrice)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Totals */}
                    <div className="space-y-2.5 text-sm tabular-nums">
                      <SumRow label={`Biletat × ${watchedPassengers.length}`} value={`€${fmtM(totals.ticket)}`} />
                      {totals.discount > 0 && (
                        <SumRow
                          label={totals.discountType === "fixed" ? `Zbritje Agjenti (−€${fmtM(totals.discountFixed)})` : `Zbritje Agjenti (${totals.discountPct}%)`}
                          value={`−€${fmtM(totals.discount)}`} tone="green"
                        />
                      )}
                      {totals.flightDiscount > 0 && totals.flightDiscountInfo && (
                        <SumRow label={`Zbritje fluturimi (${flightDiscountLabel(totals.flightDiscountInfo)})`} value={`−€${fmtM(totals.flightDiscount)}`} tone="green" />
                      )}
                      {totals.manualDiscount > 0 && (
                        <SumRow label="Zbritje manuale" value={`−€${fmtM(totals.manualDiscount)}`} tone="rose" />
                      )}
                      <SumRow label="Taksa" value={`€${fmtM(totals.tax)}`} />
                      <SumRow label="Ekstra" value={`€${fmtM(totals.extras)}`} />
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-slate-400">Markup</span>
                        <FormField control={form.control} name="markup" render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <input type="number" {...field} aria-label="Markup"
                                className={cn(glassInput, "w-24 h-8 px-2 text-right font-semibold tabular-nums")} />
                            </FormControl>
                          </FormItem>
                        )} />
                      </div>
                    </div>

                    {/* Total */}
                    <div className="mt-5 pt-4 border-t border-white/10">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.28em]">Total Klienti</span>
                        <div className="flex items-baseline gap-1">
                          <span className={cn("text-sm font-bold", NUM)}>€</span>
                          <span className={cn("text-4xl font-bold tabular-nums tracking-tight drop-shadow-[0_0_18px_rgba(56,189,248,0.35)]", NUM)}>{fmtM(totals.total)}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]" aria-hidden="true" />
                        Pagesa menaxhohet pas konfirmimit
                      </div>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="px-6 py-5 border-t border-white/[0.07] bg-white/[0.02] flex flex-col gap-2.5">
                    <button type="submit" disabled={createBooking.isPending || !selectedFlight}
                      className="group h-12 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 text-[#070b1c] font-bold text-sm tracking-wide shadow-[0_0_36px_-6px_rgba(56,189,248,0.8)] hover:shadow-[0_0_48px_-4px_rgba(56,189,248,0.95)] hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b1c]">
                      {createBooking.isPending ? "Duke procesuar..." : "Konfirmo Rezervimin"} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setLocation("/bookings")}
                      className="h-9 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">Anulo</button>
                  </div>
                </div>

                {selectedAgent && (
                  <div className="rounded-2xl bg-gradient-to-br from-violet-400/[0.1] to-fuchsia-400/[0.06] ring-1 ring-violet-300/25 backdrop-blur-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400/40 to-fuchsia-500/40 ring-1 ring-violet-300/40 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-violet-100" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-violet-100 mb-0.5">Agjenti i Zgjedhur</div>
                        <div className="text-[11px] text-violet-200/80 leading-relaxed">
                          {(selectedAgent as any).name} · {(selectedAgent as any).company}
                          {agentDiscountPct > 0 && <> · Zbritje <span className={NUM}>{agentDiscountPct}</span>%</>}
                          {agentDiscountFixed > 0 && <> · Zbritje €<span className={NUM}>{agentDiscountFixed}</span></>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

// ============ Helper components ============

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <li className="flex items-center gap-2.5">
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all tabular-nums",
        done ? "bg-emerald-400/20 ring-1 ring-emerald-300/50 shadow-[0_0_16px_-2px_rgba(52,211,153,0.6)]"
          : active ? "bg-cyan-400/20 ring-1 ring-cyan-300/60 shadow-[0_0_20px_-2px_rgba(56,189,248,0.7)]"
          : "bg-white/[0.05] ring-1 ring-white/10",
        NUM
      )}>
        {done ? <Check className="w-4 h-4" /> : n}
      </div>
      <div className="hidden sm:flex flex-col leading-tight">
        <span className={cn("text-[9px] uppercase font-bold tracking-[0.22em]",
          active ? "text-cyan-300" : done ? "text-emerald-300" : "text-slate-600"
        )}>Hapi <span className={NUM}>{n}</span></span>
        <span className={cn("text-sm font-semibold",
          active || done ? "text-white" : "text-slate-500"
        )}>{label}</span>
      </div>
    </li>
  );
}

function StepLine({ done }: { done: boolean }) {
  return (
    <li className="flex-1 h-px relative overflow-hidden rounded-full bg-white/10" aria-hidden="true">
      <div className={cn("absolute inset-0 transition-all duration-500", done ? "bg-gradient-to-r from-emerald-300/70 to-cyan-300/70" : "bg-transparent")} />
    </li>
  );
}

function GLabel({ children, accent, htmlFor }: { children: React.ReactNode; accent?: string; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className={cn("text-[9px] uppercase tracking-[0.24em] font-bold mb-1.5 block", accent ?? "text-slate-400")}>{children}</label>;
}

function ExtraChip({ on, onClick, icon: Icon, label, price }: {
  on: boolean; onClick: () => void; icon: any; label: string; price?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-left ring-1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
        on
          ? "ring-emerald-300/50 bg-emerald-400/[0.09] shadow-[0_0_20px_-6px_rgba(52,211,153,0.55)]"
          : "ring-white/10 bg-white/[0.04] hover:ring-white/25 hover:bg-white/[0.06]"
      )}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
          on ? "bg-emerald-400/25 text-emerald-200" : "bg-white/[0.07] text-slate-400"
        )}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        </div>
        <div className="flex flex-col items-start leading-tight min-w-0">
          <span className={cn("text-[12px] font-semibold truncate", on ? "text-emerald-100" : "text-slate-300")}>{label}</span>
          {price && <span className={cn("text-[10px] tabular-nums", NUM)}>{price}</span>}
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
      <div className={cn("text-base font-bold tabular-nums mt-0.5", NUM)}>{value}</div>
    </div>
  );
}

function SumRow({ label, value, tone }: { label: string; value: string; tone?: "green" | "rose" }) {
  return (
    <div className={cn(
      "flex justify-between items-center text-sm",
      tone === "green" && "bg-emerald-400/[0.08] ring-1 ring-emerald-300/20 rounded-lg px-2.5 py-1",
      tone === "rose" && "bg-rose-400/[0.08] ring-1 ring-rose-300/20 rounded-lg px-2.5 py-1"
    )}>
      <span className={cn(
        tone === "green" && "text-emerald-300 font-medium",
        tone === "rose" && "text-rose-300 font-medium",
        !tone && "text-slate-400"
      )}>{label}</span>
      <span className={cn("font-semibold tabular-nums", NUM)}>{value}</span>
    </div>
  );
}
