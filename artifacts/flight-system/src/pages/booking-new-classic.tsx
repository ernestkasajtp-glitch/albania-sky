import { useState, useMemo, useEffect, useRef } from "react";
import { fmtM } from "@/lib/utils";
import { fmtFlightNum } from "@/lib/utils";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getFlightDiscount, applyFlightDiscount, flightDiscountLabel, bookingDiscountChannel } from "@/lib/flightDiscount";
import { useListFlights, useListAgents, useCreateBooking, getListBookingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { dobAgeError } from "@/lib/paxAge";
import { Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { NAME_REGEX, NAME_ERROR } from "@/lib/nameValidation";

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

export default function BookingNew() {
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
  // Fshi agjentin e CitizenPlane (Nesti Agjensi) — rezervimet vijnë vetëm automatikisht nga importi
  const agents = agentsRaw?.filter((a: any) => a.company !== "Nesti Agjensi");
  const createBooking = useCreateBooking();

  const form = useForm<z.infer<typeof bookingSchema>>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      markup: 0,
      commission: 0,
      discount: 0,
      passengers: [{ type: "adult", firstName: "", lastName: "", hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "passengers"
  });

  const watchedFlightId = form.watch("flightId");
  const watchedPassengers = form.watch("passengers");
  const watchedMarkup = form.watch("markup") || 0;
  const watchedManualDiscount = Number(form.watch("discount") || 0);
  const watchedAgentId = form.watch("agentId");

  const selectedFlight = useMemo(() => {
    return flights?.find((f: any) => f.id === watchedFlightId);
  }, [flights, watchedFlightId]);

  const selectedAgent = useMemo(() => {
    if (!watchedAgentId) return null;
    return agents?.find(a => a.id === Number(watchedAgentId)) ?? null;
  }, [agents, watchedAgentId]);

  // Auto-fill kontaktin primar me të dhënat e agjensisë kur zgjidhet agjenti.
  // Mbahet shënim çfarë u plotësua automatikisht, që të mos mbishkruhen ndryshimet manuale të userit.
  // Sinkronizo customerName me emrin e pasagjerit të parë (firstName + lastName).
  // Mbishkruan VETËM nëse customerName është bosh ose përputhet me sinkronizimin e mëparshëm
  // (kështu nëse useri e ndryshon vetë, mbetet i pacenuar).
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

  // Auto-fill VETËM email/telefon nga agjencia (jo emrin — emri i klientit duhet të jetë pasagjeri/klienti aktual)
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
      if (cur.email === "" || cur.email === lastAutoFill.current.email) {
        form.setValue("customerEmail", newEmail);
      }
      if (cur.phone === "" || cur.phone === lastAutoFill.current.phone) {
        form.setValue("customerPhone", newPhone);
      }
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
    let ticketGross = 0;   // Σ base price (gross), informational
    let effSum = 0;        // Σ per-passenger effective price (discount + markup folded)
    let markupTotal = 0;   // watchedMarkup × passengers (per-person markup)
    let extrasCost = 0;
    let flightDiscTotal = 0; // flight-level discount, applied AFTER agency computation
    const fd = getFlightDiscount(selectedFlight, bookingDiscountChannel(selectedAgent));

    watchedPassengers.forEach(p => {
      const base = p.type === "child" ? selectedFlight.childPrice
        : p.type === "infant" ? selectedFlight.infantPrice
        : selectedFlight.adultPrice;
      const discountedBase = agentDiscountType === "fixed"
        ? Math.max(0, base - (agentDiscountFixed > 0 ? agentDiscountFixed : 0))
        : base * (1 - agentDiscountPct / 100);
      const eff = Math.round(Math.max(0, discountedBase + watchedMarkup + base * agentMarkupPct / 100) * 100) / 100;
      ticketGross += base;
      effSum += eff;
      if (fd) flightDiscTotal += eff - applyFlightDiscount(Math.round(eff), fd);
      markupTotal += watchedMarkup + base * agentMarkupPct / 100;

      if (p.baggageOption === "checked" && selectedFlight.checkedBaggagePrice) extrasCost += selectedFlight.checkedBaggagePrice;
      if (p.hasSeatSelection && selectedFlight.seatSelectionPrice) extrasCost += selectedFlight.seatSelectionPrice;
      if (p.hasPriorityBoarding && selectedFlight.priorityBoardingPrice) extrasCost += selectedFlight.priorityBoardingPrice;
      if (p.hasInsurance && selectedFlight.insurancePrice) extrasCost += selectedFlight.insurancePrice;
    });

    const tax = selectedFlight.tax * watchedPassengers.length;
    const manualDiscount = Math.max(0, Math.round(watchedManualDiscount * 100) / 100);
    markupTotal = Math.round(markupTotal * 100) / 100;
    // Pure agent discount = gross − effective + markup (markup cancels), kept exactly consistent
    // with effSum so the breakdown lines always add up to the total.
    const discount = Math.round((ticketGross - effSum + markupTotal) * 100) / 100;
    flightDiscTotal = Math.round(flightDiscTotal * 100) / 100;
    const total = Math.round((effSum - flightDiscTotal + tax + extrasCost - manualDiscount) * 100) / 100;

    return {
      flightDiscount: flightDiscTotal, flightDiscountInfo: fd,
      ticket: ticketGross,
      tax,
      extras: extrasCost,
      markup: watchedMarkup,
      discount,
      discountPct: agentDiscountPct,
      discountFixed: agentDiscountFixed,
      discountType: agentDiscountType,
      manualDiscount,
      total,
    };
  })();

  const onSubmit = (values: z.infer<typeof bookingSchema>) => {
    // Validim moshe sipas datëlindjes (foshnjë <2 vjeç, fëmijë 2–11) në datën e fluturimit
    for (const p of values.passengers) {
      const ageErr = dobAgeError(p.type, p.dateOfBirth, selectedFlight?.departureDate);
      if (ageErr) {
        toast({ title: "Datëlindje e pavlefshme", description: ageErr, variant: "destructive" });
        return;
      }
    }
    // Transform empty strings to null for optional fields
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
      }))
    };

    createBooking.mutate({ data }, {
      onSuccess: (res) => {
        toast({ title: "Booking created successfully" });
        queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
        setLocation(`/bookings/${res.id}`);
      },
      onError: (err: any) => {
        toast({ title: "Error creating booking", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Booking</h1>
        <p className="text-muted-foreground">Issue a new flight reservation.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              
              <Card>
                <CardHeader>
                  <CardTitle>Flight Selection</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField control={form.control} name="flightId" render={({ field }) => {
                    const matchTxt = (val: string, q: string) => {
                      if (!q) return true;
                      return (val ?? "").toLowerCase().includes(q.toLowerCase());
                    };
                    const hasSearch = !!(searchFrom || searchTo || searchDate);
                    const filtered = !hasSearch ? [] : (flights ?? []).filter((f: any) => {
                      const fromOk = !searchFrom || matchTxt(f.fromCity, searchFrom) || matchTxt(f.fromAirport, searchFrom);
                      const toOk = !searchTo || matchTxt(f.toCity, searchTo) || matchTxt(f.toAirport, searchTo);
                      const dateOk = !searchDate || f.departureDate === searchDate;
                      return fromOk && toOk && dateOk;
                    });
                    return (
                      <FormItem className="flex flex-col">
                        <FormLabel>Fluturimi</FormLabel>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Nga</label>
                            <Input value={searchFrom} onChange={(e) => setSearchFrom(e.target.value)} placeholder="Aeroporti / Qyteti" />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Për</label>
                            <Input value={searchTo} onChange={(e) => setSearchTo(e.target.value)} placeholder="Aeroporti / Qyteti" />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Data</label>
                            <Input type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} />
                          </div>
                        </div>
                        <FormControl>
                          <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
                            {!hasSearch ? (
                              <div className="p-4 text-sm text-muted-foreground text-center">Plotësoni fushat sipër për të kërkuar fluturim.</div>
                            ) : filtered.length === 0 ? (
                              <div className="p-4 text-sm text-muted-foreground text-center">Asnjë fluturim nuk u gjet.</div>
                            ) : filtered.map((f: any) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => field.onChange(f.id)}
                                className={cn(
                                  "w-full text-left p-3 flex items-center justify-between gap-2 text-sm transition-colors",
                                  f.isConfirmed
                                    ? field.value === f.id
                                      ? "bg-emerald-200 hover:bg-emerald-200 ring-1 ring-inset ring-emerald-600"
                                      : "bg-emerald-100 hover:bg-emerald-200 ring-1 ring-inset ring-emerald-300"
                                    : field.value === f.id
                                    ? "bg-blue-100 hover:bg-blue-100 ring-1 ring-inset ring-blue-400"
                                    : "bg-gradient-to-r from-blue-50 to-sky-50/70 hover:from-blue-100 hover:to-sky-100/80"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <Check className={cn("h-4 w-4", field.value === f.id ? "opacity-100 text-blue-600" : "opacity-0")} />
                                  <span>
                                    {f.isConfirmed && <span title="Fluturim i Konfirmuar" className="mr-1.5 inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-300"><span className="inline-flex items-center justify-center bg-black rounded w-3.5 h-3.5 text-[10px] leading-none flex-shrink-0">⭐</span> Konfirmuar</span>}
                                    <strong>{f.airline} {fmtFlightNum(f.flightNumber)}</strong> — {f.fromCity} ({f.fromAirport}) → {f.toCity} ({f.toAirport}) — {f.departureDate}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground">€{fmtM(f.adultPrice)}</span>
                              </button>
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />

                  {selectedFlight && (
                    <div className="mt-4 p-4 bg-muted rounded-md text-sm">
                      <div className="grid grid-cols-2 gap-4">
                        <div><strong>Prices:</strong> Adult/Child (2+): €{fmtM(selectedFlight.adultPrice)} | Infant (&lt;2 vjeç): €{fmtM(selectedFlight.infantPrice)}</div>
                        <div><strong>Tax:</strong> €{fmtM(selectedFlight.tax)}</div>
                        <div><strong>Available Seats:</strong> {selectedFlight.availableSeats}</div>
                        <div><strong>Status:</strong> {selectedFlight.status}</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Customer Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem><FormLabel>Primary Contact Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="customerEmail" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="customerPhone" render={({ field }) => (
                      <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="agentId" render={({ field }) => {
                      const current = field.value ? agents?.find(a => a.id === Number(field.value)) : null;
                      return (
                        <FormItem className="flex flex-col">
                          <FormLabel>Agent (Optional)</FormLabel>
                          <Popover open={agentPickerOpen} onOpenChange={setAgentPickerOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button type="button" variant="outline" role="combobox"
                                  className={cn("w-full justify-between font-normal", !current && "text-muted-foreground")}>
                                  {current ? `${current.name} (${current.company})` : "Direct Booking"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                                <CommandInput placeholder="Kërko agjentin..." />
                                <CommandList className="max-h-72">
                                  <CommandEmpty>S'u gjet asnjë agjent.</CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem value="direct booking" onSelect={() => { field.onChange(null); setAgentPickerOpen(false); }}>
                                      <Check className={cn("mr-2 h-4 w-4", !field.value ? "opacity-100" : "opacity-0")} />
                                      Direct Booking
                                    </CommandItem>
                                    {agents?.map(a => (
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
                    <FormField control={form.control} name="commission" render={({ field }) => (
                      <FormItem><FormLabel>Commission ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem><FormLabel>Notes</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Passengers</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ type: "adult", firstName: "", lastName: "", hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false })}>
                    <Plus className="mr-2 h-4 w-4" /> Add Passenger
                  </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                  {fields.map((field, index) => (
                    <div key={field.id} className="p-4 border rounded-md relative">
                      {index > 0 && (
                        <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => remove(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <FormField control={form.control} name={`passengers.${index}.type`} render={({ field }) => (
                          <FormItem>
                            <FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="adult">Adult</SelectItem>
                                <SelectItem value="child">Child</SelectItem>
                                <SelectItem value="infant">Infant</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`passengers.${index}.firstName`} render={({ field }) => (
                          <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name={`passengers.${index}.lastName`} render={({ field }) => (
                          <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <FormField control={form.control} name={`passengers.${index}.dateOfBirth`} render={({ field }) => (
                          <FormItem><FormLabel>DOB</FormLabel><FormControl><Input type="date" {...field} value={field.value || ''} /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name={`passengers.${index}.passportNumber`} render={({ field }) => (
                          <FormItem><FormLabel>Passport #</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name={`passengers.${index}.nationality`} render={({ field }) => (
                          <FormItem><FormLabel>Nationality</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl></FormItem>
                        )} />
                      </div>

                      <div className="flex flex-wrap gap-4 pt-2 border-t">
                        <FormField control={form.control} name={`passengers.${index}.baggageOption`} render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <select className="border rounded px-2 py-1 text-sm bg-background" value={field.value || ""} onChange={field.onChange}>
                                <option value="">No checked bag</option>
                                <option value="checked">Checked Bag (+${selectedFlight?.checkedBaggagePrice || 0})</option>
                              </select>
                            </FormControl>
                          </FormItem>
                        )} />
                        
                        <FormField control={form.control} name={`passengers.${index}.hasSeatSelection`} render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            <div className="space-y-1 leading-none"><FormLabel className="font-normal text-sm">Seat Selection (+${selectedFlight?.seatSelectionPrice || 0})</FormLabel></div>
                          </FormItem>
                        )} />
                        
                        <FormField control={form.control} name={`passengers.${index}.hasPriorityBoarding`} render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            <div className="space-y-1 leading-none"><FormLabel className="font-normal text-sm">Priority Boarding (+${selectedFlight?.priorityBoardingPrice || 0})</FormLabel></div>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name={`passengers.${index}.hasInsurance`} render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            <div className="space-y-1 leading-none"><FormLabel className="font-normal text-sm">Insurance (+${selectedFlight?.insurancePrice || 0})</FormLabel></div>
                          </FormItem>
                        )} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

            </div>

            <div className="md:col-span-1">
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                  <CardDescription>Live pricing calculation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tickets x{watchedPassengers.length}</span>
                    {totals.discount > 0 ? (
                      <span className="flex items-center gap-2">
                        <span className="line-through text-muted-foreground text-xs">€{fmtM(totals.ticket)}</span>
                        <span className="font-semibold text-green-700">€{fmtM(totals.ticket - totals.discount)}</span>
                      </span>
                    ) : (
                      <span>€{fmtM(totals.ticket)}</span>
                    )}
                  </div>
                  {totals.discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600 font-medium bg-green-50 rounded-md px-2 py-1">
                      <span className="flex items-center gap-1">
                        <span>🏷️</span>
                        <span>
                          {totals.discountType === "fixed"
                            ? `Zbritje Agjenti (−€${fmtM(totals.discountFixed)})`
                            : `Zbritje Agjenti (${totals.discountPct}%)`}
                        </span>
                      </span>
                      <span>−€{fmtM(totals.discount)}</span>
                    </div>
                  )}
                  {totals.flightDiscount > 0 && totals.flightDiscountInfo && (
                    <div className="flex justify-between text-sm text-green-600 font-medium bg-green-50 rounded-md px-2 py-1">
                      <span>Zbritje fluturimi ({flightDiscountLabel(totals.flightDiscountInfo)})</span>
                      <span>−€{fmtM(totals.flightDiscount)}</span>
                    </div>
                  )}
                  {totals.manualDiscount > 0 && (
                    <div className="flex justify-between text-sm text-rose-700 font-medium bg-rose-50 rounded-md px-2 py-1">
                      <span>Zbritje (manuale)</span>
                      <span>−€{fmtM(totals.manualDiscount)}</span>
                    </div>
                  )}
                  <FormField control={form.control} name="discount" render={({ field }) => (
                    <FormItem className="pt-2">
                      <div className="flex items-center justify-between gap-2">
                        <FormLabel className="text-sm">Zbritje (€)</FormLabel>
                        <div className="w-24">
                          <FormControl>
                            <Input type="number" min={0} step="1" {...field}
                              value={field.value === 0 ? "" : field.value}
                              onChange={e => field.onChange(e.target.value === "" ? 0 : e.target.value)}
                              placeholder="0" className="h-8 text-right" />
                          </FormControl>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Çmimi i biletës − Zbritja = Çmimi i shitjes</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Taxes & Fees</span>
                    <span>€{fmtM(totals.tax)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Extras</span>
                    <span>€{fmtM(totals.extras)}</span>
                  </div>
                  
                  <FormField control={form.control} name="markup" render={({ field }) => (
                    <FormItem className="pt-2">
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-sm">Agency Markup</FormLabel>
                        <div className="w-24">
                          <FormControl><Input type="number" className="h-8 text-right" {...field} /></FormControl>
                        </div>
                      </div>
                    </FormItem>
                  )} />

                  <Separator />
                  
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>€{fmtM(totals.total)}</span>
                  </div>

                  <Button type="submit" className="w-full mt-4" size="lg" disabled={createBooking.isPending || !selectedFlight}>
                    {createBooking.isPending ? "Processing..." : "Create Booking"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
