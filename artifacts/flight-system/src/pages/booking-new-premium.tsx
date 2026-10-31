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
  Check, ChevronRight, Receipt, BadgePercent, Sparkles,
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

  // RHF may retain the passengers array identity while nested fields change.
  // This small calculation must follow each render, not array reference equality.
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
    <div className="-mx-4 -my-4 md:-mx-6 md:-my-6 min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
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
                <button type="button" onClick={() => setLocation("/bookings")}
                  className="h-9 px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Anulo</button>
                <button type="submit" disabled={createBooking.isPending || !selectedFlight}
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

                <FormField control={form.control} name="flightId" render={({ field }) => (
                  <FormItem>
                    <FormControl>
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
                        ) : filtered.slice(0, 30).map((f: any) => {
                          const selected = field.value === f.id;
                          const dep = fmtAmPm(f.departureTime) || "—";
                          const arr = fmtAmPm(f.arrivalTime) || "—";
                          return (
                            <button key={f.id} type="button" onClick={() => field.onChange(f.id)}
                              className={cn(
                                "group relative w-full text-left rounded-md border transition-all duration-150",
                                f.isConfirmed
                                  ? selected
                                    ? "border-emerald-600 bg-emerald-200 shadow-[0_1px_10px_rgba(5,150,105,0.24)] ring-1 ring-emerald-600/40 hover:bg-emerald-200"
                                    : "border-emerald-400 bg-emerald-100 hover:bg-emerald-200 hover:border-emerald-500"
                                  : selected
                                  ? "border-blue-500 bg-gradient-to-r from-blue-100 to-sky-50 shadow-[0_1px_10px_rgba(37,99,235,0.18)] ring-1 ring-blue-500/25 hover:from-blue-100 hover:to-sky-50"
                                  : "border-blue-200 bg-gradient-to-r from-blue-50/90 to-sky-50/60 hover:from-blue-100 hover:to-sky-50 hover:border-blue-400 hover:shadow-[0_1px_8px_rgba(37,99,235,0.14)]"
                              )}
                            >
                              {/* Shirit ari majtas kur rreshti eshte i zgjedhur — pamje premium */}
                              <div className={cn(
                                "absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md transition-all",
                                selected
                                  ? f.isConfirmed
                                    ? "bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-400"
                                    : "bg-gradient-to-b from-blue-400 via-blue-600 to-cyan-400"
                                  : f.isConfirmed
                                  ? "bg-emerald-400"
                                  : "bg-blue-200 group-hover:bg-blue-400"
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
                                    {f.availableSeats} vende
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </FormControl>
                    <div className="px-5 pb-3"><FormMessage /></div>
                  </FormItem>
                )} />

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
                    <FormField control={form.control} name="customerName" render={({ field }) => (
                      <FormItem><FormControl><RawInput icon={User} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="col-span-12 md:col-span-4 rounded-xl border-l-4 border-indigo-400 bg-indigo-50/40 p-3 pl-4">
                    <FieldLabel><span className="text-indigo-700">Email</span></FieldLabel>
                    <FormField control={form.control} name="customerEmail" render={({ field }) => (
                      <FormItem><FormControl><RawInput type="email" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="col-span-12 md:col-span-3 rounded-xl border-l-4 border-cyan-400 bg-cyan-50/40 p-3 pl-4">
                    <FieldLabel><span className="text-cyan-700">Telefon</span></FieldLabel>
                    <FormField control={form.control} name="customerPhone" render={({ field }) => (
                      <FormItem><FormControl><RawInput {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="col-span-12 md:col-span-6 rounded-xl border-l-4 border-emerald-400 bg-emerald-50/40 p-3 pl-4">
                    <FieldLabel><span className="text-emerald-700">Agjencia (opsionale)</span></FieldLabel>
                    <FormField control={form.control} name="agentId" render={({ field }) => {
                      const current = field.value ? agents?.find((a: any) => a.id === Number(field.value)) : null;
                      const initials = current ? (current.company ?? current.name ?? "").slice(0, 2).toUpperCase() : "—";
                      return (
                        <FormItem>
                          <Popover open={agentPickerOpen} onOpenChange={setAgentPickerOpen}>
                            <PopoverTrigger asChild>
                              <button type="button"
                                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between hover:border-slate-300">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                    {current ? initials : <Plus className="w-3 h-3" />}
                                  </div>
                                  <span className="text-sm font-medium text-slate-900 truncate">
                                    {current ? current.company || current.name : "Direct Booking"}
                                  </span>
                                  {current && (current as any).commission != null && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-semibold shrink-0">
                                      Komision {(current as any).commission}%
                                    </span>
                                  )}
                                </div>
                                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command filter={(v, s) => v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0}>
                                <CommandInput placeholder="Kërko agjentin..." />
                                <CommandList className="max-h-72">
                                  <CommandEmpty>S'u gjet asnjë agjent.</CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem value="direct booking" onSelect={() => { field.onChange(null); setAgentPickerOpen(false); }}>
                                      <Check className={cn("mr-2 h-4 w-4", !field.value ? "opacity-100" : "opacity-0")} />
                                      Direct Booking
                                    </CommandItem>
                                    {agents?.map((a: any) => (
                                      <CommandItem key={a.id} value={`${a.name} ${a.company}`}
                                        onSelect={() => { field.onChange(a.id); setAgentPickerOpen(false); }}>
                                        <Check className={cn("mr-2 h-4 w-4", Number(field.value) === a.id ? "opacity-100" : "opacity-0")} />
                                        {a.name} <span className="text-muted-foreground ml-1">({a.company})</span>
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
                  <div className="col-span-12 md:col-span-3 rounded-xl border-l-4 border-violet-400 bg-violet-50/40 p-3 pl-4">
                    <FieldLabel><span className="text-violet-700">Komision ($)</span></FieldLabel>
                    <FormField control={form.control} name="commission" render={({ field }) => (
                      <FormItem><FormControl><RawInput type="number" icon={BadgePercent} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="col-span-12 md:col-span-3 rounded-xl border-l-4 border-amber-400 bg-amber-50/40 p-3 pl-4">
                    <FieldLabel><span className="text-amber-700">Zbritje (€)</span></FieldLabel>
                    <FormField control={form.control} name="discount" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RawInput type="number" min={0} step="1" placeholder="0" {...field}
                            value={field.value === 0 ? "" : field.value}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.onChange(e.target.value === "" ? 0 : e.target.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="col-span-12 rounded-xl border-l-4 border-slate-400 bg-slate-50/60 p-3 pl-4">
                    <FieldLabel><span className="text-slate-700">Shënime të brendshme</span></FieldLabel>
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem><FormControl><RawInput placeholder="Kërkesa speciale, alergji, etj..." {...field} value={field.value || ""} /></FormControl></FormItem>
                    )} />
                  </div>
                </div>
              </section>

              {/* Passengers */}
              <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
                <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center"><Users className="w-4 h-4" /></div>
                    <h3 className="text-sm font-bold text-slate-900">Pasagjerët</h3>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">{fields.length}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(["adult", "child", "infant"] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => { append({ type: t, firstName: "", lastName: "", hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false }); setExpandedIdx(fields.length); }}
                        className="h-8 px-2.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                        <Plus className="w-3 h-3" /> {TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </header>

                <div className="p-4 flex flex-col gap-3">
                  {fields.map((field, index) => {
                    const p = watchedPassengers?.[index] ?? ({} as any);
                    const expanded = expandedIdx === index;
                    const paxType = p.type || "adult";
                    const origPrice = selectedFlight
                      ? (paxType === "adult" ? selectedFlight.adultPrice : paxType === "child" ? selectedFlight.childPrice : selectedFlight.infantPrice)
                      : null;
                    return (
                      <div key={field.id} className={cn(
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
                              const override = (p as any).ticketPrice;
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
                                    <FormField control={form.control} name={`passengers.${index}.ticketPrice` as any} render={({ field: f }) => (
                                      <FormItem className="m-0">
                                        <FormControl>
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={f.value == null || f.value === "" ? "" : wholeMoneyInput(String(f.value))}
                                            placeholder={origPrice != null ? fmtM(origPrice) : "0"}
                                            onChange={(e) => {
                                              const next = wholeMoneyInput(e.target.value);
                                              f.onChange(next === "" ? null : next);
                                            }}
                                            className={cn(
                                              "w-20 h-7 px-2 text-right rounded-md border-2 text-sm font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500",
                                              hasOverride ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"
                                            )}
                                          />
                                        </FormControl>
                                      </FormItem>
                                    )} />
                                  </div>
                                </div>
                              );
                            })()}
                            {index > 0 && (
                              <button type="button" onClick={() => remove(index)} className="text-slate-400 hover:text-rose-600 p-1">
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
                              <FormField control={form.control} name={`passengers.${index}.type`} render={({ field: f }) => (
                                <FormItem>
                                  <FormControl>
                                    <select value={f.value} onChange={(e) => f.onChange(e.target.value)}
                                      className="h-10 w-full px-3 rounded-lg border border-slate-200 bg-white text-sm hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none">
                                      <option value="adult">I rritur</option>
                                      <option value="child">Fëmijë</option>
                                      <option value="infant">Foshnje</option>
                                    </select>
                                  </FormControl>
                                </FormItem>
                              )} />
                            </div>
                            <div className="col-span-12 sm:col-span-4">
                              <FieldLabel>Emri *</FieldLabel>
                              <FormField control={form.control} name={`passengers.${index}.firstName`} render={({ field: f }) => (
                                <FormItem><FormControl><RawInput {...f} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </div>
                            <div className="col-span-12 sm:col-span-4">
                              <FieldLabel>Mbiemri *</FieldLabel>
                              <FormField control={form.control} name={`passengers.${index}.lastName`} render={({ field: f }) => (
                                <FormItem><FormControl><RawInput {...f} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </div>

                            <div className="col-span-12 sm:col-span-4">
                              <FieldLabel>Datëlindja</FieldLabel>
                              <FormField control={form.control} name={`passengers.${index}.dateOfBirth`} render={({ field: f }) => (
                                <FormItem><FormControl><RawInput type="date" {...f} value={f.value || ""} /></FormControl></FormItem>
                              )} />
                            </div>

                            {/* Çmimi i modifikuar — në telefon fusha e header-it është e fshehur, prandaj del këtu */}
                            <div className="col-span-12 sm:hidden">
                              <FieldLabel>Çmimi € {origPrice != null ? `(origjinal €${fmtM(origPrice)})` : ""}</FieldLabel>
                              <FormField control={form.control} name={`passengers.${index}.ticketPrice` as any} render={({ field: f }) => {
                                const hasOverride = f.value != null && f.value !== "" && !Number.isNaN(Number(f.value)) && (origPrice == null || Number(f.value) !== Number(origPrice));
                                return (
                                  <FormItem>
                                    <FormControl>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={f.value == null || f.value === "" ? "" : wholeMoneyInput(String(f.value))}
                                        placeholder={origPrice != null ? fmtM(origPrice) : "0"}
                                        onChange={(e) => {
                                          const next = wholeMoneyInput(e.target.value);
                                          f.onChange(next === "" ? null : next);
                                        }}
                                        className={cn(
                                          "h-10 w-full px-3 text-right rounded-lg border-2 text-sm font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500",
                                          hasOverride ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"
                                        )}
                                      />
                                    </FormControl>
                                  </FormItem>
                                );
                              }} />
                            </div>

                            <div className="col-span-12 mt-1">
                              <FieldLabel>Ekstra</FieldLabel>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <FormField control={form.control} name={`passengers.${index}.baggageOption`} render={({ field: f }) => (
                                  <ToggleBtn
                                    on={f.value === "checked"}
                                    onClick={() => f.onChange(f.value === "checked" ? "" : "checked")}
                                    icon={Briefcase}
                                    label="Bagazh"
                                    price={selectedFlight?.checkedBaggagePrice ? `+€${selectedFlight.checkedBaggagePrice}` : ""}
                                  />
                                )} />
                                <FormField control={form.control} name={`passengers.${index}.hasSeatSelection`} render={({ field: f }) => (
                                  <ToggleBtn on={!!f.value} onClick={() => f.onChange(!f.value)} icon={Armchair} label="SEAT"
                                    price={selectedFlight?.seatSelectionPrice ? `+€${selectedFlight.seatSelectionPrice}` : ""} />
                                )} />
                                <FormField control={form.control} name={`passengers.${index}.hasPriorityBoarding`} render={({ field: f }) => (
                                  <ToggleBtn on={!!f.value} onClick={() => f.onChange(!f.value)} icon={Zap} label="Priority"
                                    price={selectedFlight?.priorityBoardingPrice ? `+€${selectedFlight.priorityBoardingPrice}` : ""} />
                                )} />
                                <FormField control={form.control} name={`passengers.${index}.hasInsurance`} render={({ field: f }) => (
                                  <ToggleBtn on={!!f.value} onClick={() => f.onChange(!f.value)} icon={ShieldCheck} label="Sigurim"
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
                    {selectedFlight && watchedPassengers.length > 0 && (
                      <div className="space-y-1 text-sm tabular-nums mb-3">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Çmimi për pasagjer</div>
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
                                {showStrike && (
                                  <span className="text-[10px] text-slate-400 line-through decoration-slate-300">€{fmtM(base)}</span>
                                )}
                                <span className={cn("text-[13px] font-bold", showStrike ? "text-emerald-700" : "text-slate-700")}>€{fmtM(finalPrice)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Totals breakdown */}
                    <div className="space-y-2 text-sm tabular-nums">
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
                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Markup</span>
                        <FormField control={form.control} name="markup" render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <input type="number" {...field}
                                className="w-24 h-8 px-2 text-right rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500" />
                            </FormControl>
                          </FormItem>
                        )} />
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
                    <button type="submit" disabled={createBooking.isPending || !selectedFlight}
                      className="h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-sm shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      {createBooking.isPending ? "Duke procesuar..." : "Konfirmo Rezervimin"} <ArrowRight className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setLocation("/bookings")}
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
                          {(selectedAgent as any).name} · {(selectedAgent as any).company}
                          {agentDiscountPct > 0 && ` · Zbritje ${agentDiscountPct}%`}
                          {agentDiscountFixed > 0 && ` · Zbritje €${agentDiscountFixed}`}
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
