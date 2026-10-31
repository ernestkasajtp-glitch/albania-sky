import { GoogleMonitoringBadge } from "@/components/GoogleMonitoringToggle";
import { deriveFlightArrivalDate } from "@/lib/flightArrivalDate";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { FlightLayoutTable, initialFlightLayout, type FlightLayout } from "@/components/FlightLayoutTable";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtM, fmtAmPm, fmtDateTimeAmPm } from "@/lib/utils";
import { fmtFlightNum } from "@/lib/utils";
import { GOOGLE_PRICE_DEFAULT_TTL_MS, readGooglePriceLS, writeGooglePriceLS, googlePriceLsKey, normalizeGooglePrice, resolveGooglePriceDisplay, type GooglePriceValue } from "@/lib/googlePriceCache";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { FlightSidePanel } from "@/components/FlightSidePanel";
import { SuspectFlightRecheck } from "@/components/SuspectFlightRecheck";
import { FlightGroupBadges } from "@/components/FlightGroupBadges";
import { useAgencyGroups } from "@/components/AgencyGroups";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronsUpDown, Pencil } from "lucide-react";
import { parseGoogleScheduleAlert } from "@/lib/googleScheduleAlert";
import {
  useDeleteFlight, useDuplicateFlight,
  useToggleFlightSales, useCreateFlight, useUpdateFlight,
  useGetFlight, useListBookings,
  getGetFlightQueryOptions, getListBookingsQueryOptions,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFlightDiscount } from "@/lib/flightDiscount";
import { FlightDiscountBadge } from "@/components/FlightDiscountBadge";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { confirmDangerDialog, confirmDialog } from "@/lib/confirm";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Plus, Edit, Copy, Power, Trash2, Upload, Download,
  MapPin, Plane, PlaneTakeoff, PlaneLanding, Calendar, CalendarRange, Activity,
  Users, X, Loader2, ArrowRight, ChevronDown, Minus, CheckSquare, Square,
  ChevronLeft, ChevronRight, Tag, ToggleLeft, RefreshCw, Clock, Send, Globe,
  AlertTriangle, ChevronUp, FileText, Columns3, Check, Ban, Armchair, Lock,
} from "lucide-react";
import { FlightNotesHoverBadge } from "@/components/FlightNotes";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { airportCity, lookupAirport } from "@/lib/airports";
import { useAdminAuth } from "@/context/AdminAuthContext";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

// ─── Schema ─────────────────────────────────────────────────────────────────
const flightSchema = z.object({
  airline: z.string().min(1, "Required"),
  flightNumber: z.string().min(1, "Required"),
  fromCity: z.string().min(1, "Required"),
  toCity: z.string().min(1, "Required"),
  departureDate: z.string().min(1, "Required"),
  departureTime: z.string().min(1, "Required"),
  arrivalDate: z.string().min(1, "Required"),
  arrivalTime: z.string().min(1, "Required"),
  adultPrice: z.coerce.number().min(0).transform(v => Math.round(v)),
  childPrice: z.coerce.number().min(0).transform(v => Math.round(v)),
  infantPrice: z.coerce.number().min(0).transform(v => Math.round(v)),
  tax: z.coerce.number().min(0).transform(v => Math.round(v)),
  totalSeats: z.coerce.number().min(0),
  checkedBaggageCount: z.coerce.number().min(0).default(0),
  checkedBaggageKg: z.coerce.number().min(0).default(0),
  checkedBaggagePrice: z.coerce.number().min(0).default(0).transform(v => Math.round(v)),
  status: z.string().default("open"),
  isConfirmed: z.boolean().default(false),
  excludeFromGoogleRule: z.boolean().default(false),
  // Çmim neto informativ (vetëm admin) — s'ndikon në asnjë llogaritje.
  netPrice: z.preprocess(
    (v) => (v === "" || v == null ? null : Math.round(Number(v))),
    z.number().min(0).nullable(),
  ).default(null),
});
type FlightForm = z.infer<typeof flightSchema>;

const defaultValues: FlightForm = {
  airline: "", flightNumber: "", fromCity: "", toCity: "",
  departureDate: format(new Date(), "yyyy-MM-dd"),
  departureTime: "10:00",
  arrivalDate: format(new Date(), "yyyy-MM-dd"),
  arrivalTime: "12:00",
  adultPrice: 0, childPrice: 0, infantPrice: 35, tax: 0,
  totalSeats: 20,
  checkedBaggageCount: 0, checkedBaggageKg: 0, checkedBaggagePrice: 0,
  status: "open", isConfirmed: false, excludeFromGoogleRule: false,
  netPrice: null,
};

// Called only by schedule edits, never on form initialization or unrelated edits.
function syncArrivalDate(form: UseFormReturn<FlightForm>) {
  const depDate = form.getValues("departureDate");
  const depTime = form.getValues("departureTime");
  const arrTime = form.getValues("arrivalTime");
  const arrDate = form.getValues("arrivalDate");
  const expected = deriveFlightArrivalDate(depDate, depTime, arrTime);
  if (expected && arrDate !== expected) form.setValue("arrivalDate", expected, { shouldDirty: true });
}

// ─── Status helpers ──────────────────────────────────────────────────────────
const statusDot: Record<string, string> = {
  open: "bg-green-500",
  closed: "bg-orange-400",
  soldout: "bg-red-500",
};

function seatAlertLabel(detail: unknown, missCount: unknown): string {
  const base = String(detail || "Pak vende në Google").replace(/\s*\(\d+\/\d+\)\s*$/, "");
  const count = Number.isFinite(Number(missCount)) ? Math.max(0, Number(missCount)) : 0;
  return `${base} (${count}/3)`;
}

// ─── FlightForm Dialog ───────────────────────────────────────────────────────
type GoogleSearchResultRow = {
  flightNumber: string; airline: string;
  departureTime: string; arrivalTime: string;
  googlePrice: number | null;
};

function googleSearchKey(fromCity: string, toCity: string, date: string): string {
  return JSON.stringify([fromCity.trim().toUpperCase(), toCity.trim().toUpperCase(), date]);
}

function FlightFormDialog({
  open, onOpenChange, initial, onSave, title, googleSearch,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  initial?: FlightForm; onSave: (v: FlightForm, repeatUntil?: string) => void; title: string;
  googleSearch?: boolean; // shfaq "Kërko nga Google" + "Përsërit deri më" (vetëm krijim)
}) {
  const { user } = useAdminAuth();
  const { toast } = useToast();
  const form = useForm<FlightForm>({
    resolver: zodResolver(flightSchema),
    defaultValues: initial ?? defaultValues,
  });
  const [gLoading, setGLoading] = useState(false);
  const [gResults, setGResults] = useState<GoogleSearchResultRow[] | null>(null);
  const [gSearchStatus, setGSearchStatus] = useState<string | null>(null);
  const [repeatUntil, setRepeatUntil] = useState("");
  const repeatStartDate = form.watch("departureDate");
  useEffect(() => {
    if (googleSearch && repeatUntil && repeatStartDate && repeatUntil < repeatStartDate) {
      setRepeatUntil("");
    }
  }, [googleSearch, repeatStartDate, repeatUntil]);
  const googleSearchLockRef = useRef(false);
  const googleSearchGenerationRef = useRef(0);
  const googleSearchAbortRef = useRef<AbortController | null>(null);
  const activeGoogleSearchKeyRef = useRef<string | null>(null);
  const googleResultsSearchKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const googleSearchInputKey = googleSearchKey(
    form.watch("fromCity") ?? "",
    form.watch("toCity") ?? "",
    form.watch("departureDate") ?? "",
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      googleSearchGenerationRef.current += 1;
      googleSearchAbortRef.current?.abort();
    };
  }, []);

  // Auto-sync: childPrice always equals adultPrice
  const adultPrice = form.watch("adultPrice");
  useEffect(() => {
    form.setValue("childPrice", adultPrice, { shouldValidate: false });
  }, [adultPrice]);

  // Rifillim i pastër sa herë hapet dialogu.
  useEffect(() => {
    if (open) {
      googleSearchGenerationRef.current += 1;
      googleSearchAbortRef.current?.abort();
      googleSearchAbortRef.current = null;
      googleSearchLockRef.current = false;
      activeGoogleSearchKeyRef.current = null;
      googleResultsSearchKeyRef.current = null;
      setGLoading(false);
      setGResults(null);
      setGSearchStatus(null);
      setRepeatUntil("");
      return;
    }
    if (googleSearchLockRef.current) {
      googleSearchGenerationRef.current += 1;
      googleSearchAbortRef.current?.abort();
      googleSearchAbortRef.current = null;
      googleSearchLockRef.current = false;
      activeGoogleSearchKeyRef.current = null;
      setGLoading(false);
    }
    googleResultsSearchKeyRef.current = null;
    setGResults(null);
    setGSearchStatus(null);
  }, [open]);

  useEffect(() => {
    const activeKey = activeGoogleSearchKeyRef.current;
    if (!open || !activeKey || activeKey === googleSearchInputKey) return;
    googleSearchGenerationRef.current += 1;
    googleSearchAbortRef.current?.abort();
    googleSearchAbortRef.current = null;
    googleSearchLockRef.current = false;
    activeGoogleSearchKeyRef.current = null;
    setGLoading(false);
    setGSearchStatus("Aeroportet ose data ndryshuan — nis një kërkim të ri për rezultatet përkatëse.");
  }, [googleSearchInputKey, open]);

  // Krijim i ri: mbush automatikisht "Bagazhi i Kontrolluar" me rregullin
  // default nga Cilësimet (1 copë / 20 kg / 60 € nëse s'është ndryshuar) —
  // vetëm kur fushat janë ende të paprekura (0/0/0).
  useEffect(() => {
    if (!open || initial) return;
    // Formë e freskët në çdo hapje krijimi — një dialog i mbyllur në mes nuk
    // lë vlera të vjetra që bllokojnë auto-plotësimin e radhës.
    form.reset(defaultValues);
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/settings/default-baggage`, { credentials: "include" });
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (cancelled) return;
        const v = form.getValues();
        if (Number(v.checkedBaggageCount) === 0 && Number(v.checkedBaggageKg) === 0 && Number(v.checkedBaggagePrice) === 0) {
          form.setValue("checkedBaggageCount", Number(d.count) || 0);
          form.setValue("checkedBaggageKg", Number(d.kg) || 0);
          form.setValue("checkedBaggagePrice", Number(d.price) || 0);
        }
      } catch { /* pa lidhje → lëri 0 */ }
    })();
    return () => { cancelled = true; };
  }, [open, initial]);

  const handleGoogleSearch = async () => {
    if (googleSearchLockRef.current) return;
    const fromCity = form.getValues("fromCity").trim().toUpperCase();
    const toCity = form.getValues("toCity").trim().toUpperCase();
    const date = form.getValues("departureDate");
    if (!fromCity || !toCity || !date) {
      toast({ title: "Plotëso Nga, Për dhe Datën e nisjes para kërkimit.", variant: "destructive" });
      return;
    }
    googleSearchLockRef.current = true;
    const generation = ++googleSearchGenerationRef.current;
    const searchKey = googleSearchKey(fromCity, toCity, date);
    activeGoogleSearchKeyRef.current = searchKey;
    const controller = new AbortController();
    googleSearchAbortRef.current?.abort();
    googleSearchAbortRef.current = controller;
    setGLoading(true);
    setGSearchStatus("Duke nisur kërkimin në Google…");
    try {
      const r = await fetch(`${API_BASE}/flights/google-search/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fromCity, toCity, date }),
        signal: controller.signal,
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data?.error ?? "Kërkimi në Google dështoi.");
      }
      if (!data?.jobId) throw new Error("Serveri nuk ktheu identifikuesin e kërkimit.");
      setGSearchStatus(data.status === "running" ? "Duke kërkuar oraret dhe çmimet…" : "Kërkimi u vendos në radhë…");

      for (;;) {
        await new Promise(resolve => setTimeout(resolve, 900));
        const poll = await fetch(`${API_BASE}/flights/google-search/jobs/${encodeURIComponent(data.jobId)}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const progress = await poll.json();
        if (!poll.ok) throw new Error(progress?.error ?? "Nuk mund të lexohet progresi i kërkimit.");
        if (!mountedRef.current || generation !== googleSearchGenerationRef.current) return;
        if (progress.status === "queued") {
          setGSearchStatus("Kërkimi pret radhën e Google…");
          continue;
        }
        if (progress.status === "running") {
          setGSearchStatus("Duke kërkuar oraret dhe çmimet…");
          continue;
        }
        if (progress.status === "failed") throw new Error(progress.error ?? "Kërkimi në Google dështoi.");
        if (progress.status !== "completed") throw new Error("Serveri ktheu gjendje të panjohur për kërkimin.");
        if (searchKey !== googleSearchKey(
          form.getValues("fromCity"),
          form.getValues("toCity"),
          form.getValues("departureDate"),
        )) {
          setGSearchStatus("Aeroportet ose data ndryshuan — rezultatet e kërkimit të vjetër nuk u aplikuan.");
          break;
        }
        googleResultsSearchKeyRef.current = searchKey;
        setGResults(progress.flights ?? []);
        setGSearchStatus(
          progress.flights?.length
            ? `Kërkimi përfundoi — ${progress.flights.length} fluturime u gjetën.`
            : "Kërkimi përfundoi — Google nuk gjeti fluturime për këtë rrugë/datë.",
        );
        break;
      }
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current || generation !== googleSearchGenerationRef.current) return;
      const message = error instanceof Error ? error.message : "Lidhja me serverin dështoi.";
      setGSearchStatus("Kërkimi dështoi.");
      toast({ title: "Gabim", description: message, variant: "destructive" });
    } finally {
      if (generation === googleSearchGenerationRef.current) {
        googleSearchLockRef.current = false;
        googleSearchAbortRef.current = null;
        activeGoogleSearchKeyRef.current = null;
        if (mountedRef.current) setGLoading(false);
      }
    }
  };

  const applyGoogleFlight = (f: GoogleSearchResultRow) => {
    if (googleResultsSearchKeyRef.current !== googleSearchKey(
      form.getValues("fromCity"),
      form.getValues("toCity"),
      form.getValues("departureDate"),
    )) {
      toast({ title: "Kërko përsëri", description: "Aeroportet ose data kanë ndryshuar që nga ky rezultat.", variant: "destructive" });
      return;
    }
    form.setValue("airline", f.airline || form.getValues("airline"));
    form.setValue("flightNumber", f.flightNumber);
    if (/^\d{2}:\d{2}$/.test(f.departureTime)) form.setValue("departureTime", f.departureTime);
    if (/^\d{2}:\d{2}$/.test(f.arrivalTime)) form.setValue("arrivalTime", f.arrivalTime);
    syncArrivalDate(form);
    if (f.googlePrice != null && f.googlePrice > 0) {
      const p = Math.round(f.googlePrice);
      form.setValue("adultPrice", p as any);
      form.setValue("childPrice", p as any);
    }
    toast({ title: `U zgjodh ${f.flightNumber} — kontrollo të dhënat dhe ruaje.` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => {
            if (googleSearch && repeatUntil && repeatUntil < v.departureDate) {
              toast({ title: "Data e përsëritjes nuk mund të jetë para datës së nisjes", variant: "destructive" });
              return;
            }
            onSave(v, googleSearch && repeatUntil ? repeatUntil : undefined);
          })} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              {(["airline", "flightNumber", "fromCity", "toCity"] as const).map(name => (
                <FormField key={name} control={form.control} name={name} render={({ field }) => (
                  <FormItem>
                    <FormLabel>{name === "flightNumber" ? "Flight No." : name === "fromCity" ? "From City" : name === "toCity" ? "To City" : "Airline"}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ))}
              <FormField control={form.control} name="departureDate" render={({ field }) => (
                <FormItem><FormLabel>Dep. Date</FormLabel><FormControl>
                  <DatePicker value={field.value} onChange={v => {
                    field.onChange(v);
                    syncArrivalDate(form);
                  }} />
                </FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="departureTime" render={({ field }) => (
                <FormItem><FormLabel>Dep. Time</FormLabel><FormControl><Input type="time" {...field} onChange={e => { field.onChange(e); syncArrivalDate(form); }} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="arrivalDate" render={({ field }) => {
                const depDate = form.watch("departureDate");
                return (
                  <FormItem><FormLabel>Arr. Date</FormLabel><FormControl>
                    <DatePicker value={field.value} min={depDate || undefined} onChange={v => { field.onChange(v); syncArrivalDate(form); }} />
                  </FormControl><FormMessage /></FormItem>
                );
              }} />
              <FormField control={form.control} name="arrivalTime" render={({ field }) => (
                <FormItem><FormLabel>Arr. Time</FormLabel><FormControl><Input type="time" {...field} onChange={e => { field.onChange(e); syncArrivalDate(form); }} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            {googleSearch && (
              <div className="border rounded-lg p-3 space-y-2 bg-blue-50/40">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-blue-600" /> Kërko nga Google
                  </p>
                  <Button type="button" size="sm" variant="outline" data-testid="button-google-flight-search" disabled={gLoading} onClick={handleGoogleSearch}>
                    {gLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Duke kërkuar...</> : "Kërko fluturimet"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Plotëso Nga, Për dhe Datën e nisjes — pastaj zgjidh një fluturim nga lista për të mbushur formën automatikisht.</p>
                {gSearchStatus && <p role="status" data-testid="status-google-flight-search" className="text-xs text-muted-foreground">{gSearchStatus}</p>}
                {gResults !== null && googleResultsSearchKeyRef.current === googleSearchInputKey && (
                  gResults.length === 0
                    ? <p className="text-xs text-muted-foreground italic">Google nuk gjeti fluturime për këtë rrugë/datë.</p>
                    : <div className="max-h-44 overflow-y-auto divide-y rounded-md border bg-white">
                        {gResults.map((f, i) => (
                          <button key={`${f.flightNumber}-${i}`} type="button" onClick={() => applyGoogleFlight(f)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-blue-50 transition-colors">
                            <div className="min-w-0">
                              <span className="text-sm font-semibold">{f.flightNumber}</span>
                              <span className="text-xs text-muted-foreground ml-2">{f.airline}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm tabular-nums">{f.departureTime} – {f.arrivalTime}</span>
                              <span className="text-sm font-semibold text-blue-700 w-14 text-right">{f.googlePrice != null ? `€${Math.round(f.googlePrice)}` : "—"}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              {(["adultPrice", "infantPrice", "tax"] as const).map(name => (
                <FormField key={name} control={form.control} name={name} render={({ field }) => (
                  <FormItem>
                    <FormLabel>{name === "adultPrice" ? "Adult $" : name === "infantPrice" ? "Infant $" : "Tax $"}</FormLabel>
                    <FormControl><Input type="number" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ))}
              {/* Çmimi Neto — informativ, vetëm admin */}
              {user?.role === "admin" && (
                <FormField control={form.control} name="netPrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Çmimi Neto € (informativ)</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="0" placeholder="—"
                        value={field.value ?? ""} onChange={e => field.onChange(e.target.value)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bagazhi i Kontrolluar</p>
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="checkedBaggageCount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nr. copë</FormLabel>
                    <FormControl><Input type="number" min="0" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="checkedBaggageKg" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pesha (kg)</FormLabel>
                    <FormControl><Input type="number" min="0" step="0.5" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="checkedBaggagePrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Çmimi €</FormLabel>
                    <FormControl><Input type="number" min="0" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
            <FormField control={form.control} name="totalSeats" render={({ field }) => (
              <FormItem>
                <FormLabel>Total Seats</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => field.onChange(Math.max(0, Number(field.value) - 1))}>−</Button>
                    <Input type="number" {...field} className="text-center w-20 h-8" />
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => field.onChange(Number(field.value) + 1)}>+</Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <FormControl>
                  <select {...field} className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
                    <option value="open">Open (Bookable)</option>
                    <option value="closed">Closed (Pending)</option>
                    <option value="soldout">Sold Out</option>
                  </select>
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="isConfirmed" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={!!field.value} onChange={e => field.onChange(e.target.checked)}
                      className="w-4 h-4 rounded accent-amber-500" />
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center bg-black rounded w-4 h-4 text-xs leading-none flex-shrink-0">⭐</span> Fluturim i Konfirmuar
                    </span>
                  </label>
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="excludeFromGoogleRule" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <label className="flex items-start gap-2 cursor-pointer select-none rounded-lg border px-3 py-2.5 hover:bg-rose-50/60 transition-colors">
                    <input type="checkbox" checked={!!field.value} onChange={e => field.onChange(e.target.checked)}
                      className="w-4 h-4 rounded accent-rose-500 mt-0.5" />
                    <span className="text-sm font-medium">
                      Përjashto nga rregulli i çmimit të Google
                      <span className="block text-xs font-normal text-muted-foreground">Çmimi i këtij fluturimi nuk ndryshohet automatikisht nga Google.</span>
                    </span>
                  </label>
                </FormControl>
              </FormItem>
            )} />
            {googleSearch && (
              <div className="border rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Përsërit deri më... (opsionale)</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <DatePicker value={repeatUntil} min={repeatStartDate || undefined} restrictToMin onChange={v => setRepeatUntil(v)} />
                  </div>
                  {repeatUntil && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRepeatUntil("")}><X className="h-4 w-4" /></Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">Pas krijimit, i njëjti fluturim krijohet automatikisht edhe në datat e tjera (deri në këtë datë) ku Google e gjen — me të njëjtat çmime, vende dhe bagazh. Maksimumi 62 ditë.</p>
              </div>
            )}
            <Button type="submit" className="w-full">Save Flight</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Excel Import Dialog ─────────────────────────────────────────────────────
function ImportDialog({ open, onOpenChange, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/flights/import`, { method: "POST", body: form, credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      setResult(json);
      toast({ title: `Imported ${json.imported} flight(s)` });
      onDone();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["Airline","Airline Code","Flight Number","From City","To City","Departure Date","Departure Time","Arrival Date","Arrival Time","Adult Price","Infant Price","Tax","Total Seats","Baggage","Status"],
      ["WIZZ AIR","W4","5047","TIA","BLQ","15-08-2026","06:00","15-08-2026","07:45",130,35,0,180,"1-20-80","open"],
      ["WIZZ AIR","W4","5048","TIA","BLQ","16-08-2026","06:00","16-08-2026","07:45",130,35,0,180,"1-20-80","open"],
    ]);
    ws["!cols"] = [14,12,14,10,10,16,14,14,12,12,12,8,12,12,10].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Flights Template");
    XLSX.writeFile(wb, "flights_template.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Import Flights from Excel</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Upload an Excel (.xlsx) or CSV (.csv) file. Supports two formats automatically:
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
              <p className="font-semibold text-blue-800 mb-1">Format 1 — Segment columns</p>
              <p className="text-blue-700">Your existing list with<br /><code className="font-mono">segment_1_origin_airport</code><br /><code className="font-mono">segment_1_destination_airport</code><br />etc. — imported directly with IATA codes.</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
              <p className="font-semibold text-gray-700 mb-1">Format 2 — Simple columns</p>
              <p className="text-gray-600">Airline, Flight Number,<br />From City, To City,<br />Departure Date/Time,<br />Adult Price, Total Seats...</p>
            </div>
          </div>
          <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
            <p className="font-semibold text-amber-800">Formati i Datës — pranohen të dy:</p>
            <p className="text-amber-700 font-mono">DD-MM-YYYY &nbsp;(p.sh. 15-08-2026) ✅</p>
            <p className="text-amber-700 font-mono">YYYY-MM-DD &nbsp;(p.sh. 2026-08-15) ✅</p>
          </div>
          <p className="text-xs text-muted-foreground bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Airport codes IATA (TIA, BLQ, IST, LHR etj.) pranohen direkt — sistemi i njeh automatikisht.
          </p>
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-full">
            <Download className="h-4 w-4 mr-2" /> Download Template (Excel .xlsx)
          </Button>
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">Click to select file or drag & drop</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</> : "Choose File"}
            </Button>
          </div>
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-green-800">Import complete</p>
              <p className="text-green-700">Imported: {result.imported} | Skipped: {result.skipped}</p>
              {result.errors?.length > 0 && (
                <ul className="mt-2 text-xs text-red-600 space-y-0.5">
                  {result.errors.slice(0, 5).map((e: string, i: number) => <li key={i}>• {e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Flight Side Panel — moved to @/components/FlightSidePanel ───────────────

// ─── PassengerSelector ───────────────────────────────────────────────────────
function PassengerSelector({ adults, children, infants, onChange }: {
  adults: number; children: number; infants: number;
  onChange: (a: number, c: number, i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = adults + children + infants;
  const parts: string[] = [];
  if (adults > 0) parts.push(`${adults} Adult${adults > 1 ? "ë" : ""}`);
  if (children > 0) parts.push(`${children} Fëmijë`);
  if (infants > 0) parts.push(`${infants} Infant${infants > 1 ? "ë" : ""}`);
  const isActive = total > 0;
  const label = parts.length > 0 ? parts.join(", ") : "Pasagjerët";

  const rows: [string, string, number, (v: number) => void][] = [
    ["Adult", "12+ vjeç", adults, v => onChange(v, children, infants)],
    ["Fëmijë", "2–11 vjeç", children, v => onChange(adults, v, infants)],
    ["Infant", "0–2 vjeç", infants, v => onChange(adults, children, v)],
  ];

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-sm transition-colors ${
          isActive ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:text-foreground"
        }`}>
        <Users className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate max-w-[140px]">{label}</span>
        {isActive && <X className="h-3 w-3 ml-0.5 shrink-0" onClick={e => { e.stopPropagation(); onChange(0, 0, 0); setOpen(false); }} />}
        {!isActive && <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-50 mt-1.5 w-56 bg-white border border-input rounded-xl shadow-xl p-3 space-y-3">
            {rows.map(([lbl, sub, count, set]) => (
              <div key={lbl} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">{lbl}</div>
                  <div className="text-xs text-muted-foreground">{sub}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => count > 0 && set(count - 1)}
                    className="w-6 h-6 rounded-full border border-input flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-4 text-center text-sm font-bold">{count}</span>
                  <button type="button" onClick={() => set(count + 1)}
                    className="w-6 h-6 rounded-full border border-input flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setOpen(false)}
              className="w-full bg-primary text-primary-foreground text-xs font-medium py-1.5 rounded-lg transition-colors">
              Konfirmo
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Multi-city selector with search ────────────────────────────────────────
function MultiCitySelect({ options, value, onChange, placeholder, icon, onOpen, loading, error }: {
  options: string[]; value: string[]; onChange: (v: string[]) => void;
  placeholder: string; icon?: React.ReactNode;
  onOpen?: () => void; loading?: boolean; error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const toggle = (code: string) => {
    onChange(value.includes(code) ? value.filter(c => c !== code) : [...value, code]);
    setSearch("");
  };
  const label = value.length === 0 ? placeholder
    : value.length <= 3 ? value.join(", ")
    : `${value.slice(0, 3).join(", ")} +${value.length - 3}`;

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (next) onOpen?.(); }}>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm min-w-[140px] max-w-[240px] text-left hover:border-foreground/40 transition-colors ${value.length > 0 ? "border-primary/50 bg-primary/5" : ""}`}>
          {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
          <span className={`flex-1 truncate ${value.length > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>{label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-52" align="start">
        <div className="p-2 border-b">
          <input
            autoFocus
            placeholder="Kërko..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-sm outline-none bg-transparent placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {value.length > 0 && (
            <button onClick={() => onChange([])} className="w-full text-left text-xs text-muted-foreground px-2 py-1 hover:bg-muted rounded mb-1">
              Pastro zgjedhjen ({value.length})
            </button>
          )}
          {loading ? <p className="text-xs text-muted-foreground px-2 py-2">Duke ngarkuar aeroportet...</p>
            : error ? <p role="alert" className="text-xs text-destructive px-2 py-2">Aeroportet nuk u ngarkuan. Rihape listën për të provuar përsëri.</p>
            : filtered.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">Nuk u gjet</p>}
          {!loading && !error && filtered.map(code => (
            <label key={code} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
              <Checkbox checked={value.includes(code)} onCheckedChange={() => toggle(code)} />
              <span>{code}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Reads the currently verified Google Flights price for a single flight row.
function GooglePriceCell({ from, to, date, flightNumber, flightId, onResolved, ttlMs = GOOGLE_PRICE_DEFAULT_TTL_MS, bulkReady = true, bulkError = false, skip = false }: {
  from?: string | null; to?: string | null; date?: string | null; flightNumber?: string | null;
  flightId?: number; onResolved?: (id: number, price: number | null) => void; ttlMs?: number; bulkReady?: boolean; bulkError?: boolean; skip?: boolean;
}) {
  const queryClient = useQueryClient();
  // Hold off any per-row network request until the page's single bulk preload has
  // settled. Cached values (from the bulk hydrate or localStorage initialData)
  // still render immediately; only genuinely-uncached rows fetch, after the bulk.
  // `skip` (sold-out flights) suppresses any Google price request entirely — a
  // sold-out flight can no longer be sold, so there is no reason to spend quota.
  const enabled = !!from && !!to && !!date && bulkReady && !skip;
  const lsKey = googlePriceLsKey(from, to, date, flightNumber) ?? "";
  // Read a previously-stored price (valid for the configured TTL) so it renders instantly after a full page reload.
  const cachedLs = useMemo(() => (lsKey ? readGooglePriceLS(lsKey, ttlMs) : null), [lsKey, ttlMs]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["google-flight-price", from, to, date, flightNumber],
    enabled,
    staleTime: ttlMs,
    gcTime: ttlMs,
    retry: false,
    initialData: cachedLs ? normalizeGooglePrice(cachedLs) : undefined,
    initialDataUpdatedAt: cachedLs ? cachedLs.ts : undefined,
    queryFn: async (): Promise<{ price: number | null; specific: boolean; stale: boolean }> => {
      const params = new URLSearchParams({ from: String(from), to: String(to), date: String(date) });
      if (flightNumber) params.set("flightNumber", String(flightNumber));
      const res = await fetch(`${API_BASE}/flights/google-price?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j?.error || "Gabim");
      }
      const j = await res.json();
      const value = normalizeGooglePrice(j);
      if (lsKey) writeGooglePriceLS(lsKey, { ...value, ts: Date.now() });
      return value;
    },
  });

  const display = resolveGooglePriceDisplay(data, isError || bulkError);
  const price = enabled ? display.price : null;
  const retryPrice = () => bulkError
    ? queryClient.refetchQueries({ queryKey: ["google-prices-bulk"] })
    : refetch();
  useEffect(() => {
    if (flightId != null && onResolved && (data !== undefined || isError || bulkError || skip)) {
      onResolved(flightId, price);
    }
  }, [flightId, onResolved, data, isError, bulkError, skip, price]);

  if (!enabled) return <span className="text-muted-foreground/50">—</span>;
  // Spinner only when there is no value at all yet — cached values (memory or localStorage)
  // render immediately, but failed/stale results never expose historical numbers.
  const loading = isLoading && data === undefined;

  if (loading && !bulkError) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground inline-block" />;
  }
  if (display.unavailableLabel) {
    return (
      <button type="button" onClick={retryPrice} title="Riprovo" data-testid={`status-google-price-${flightId}`} className="text-amber-600 hover:underline text-xs">
        S’ka çmim
      </button>
    );
  }
  if (price == null) {
    return (
      <button type="button" onClick={retryPrice} title="Riprovo" data-testid={`status-google-price-${flightId}`} className="text-muted-foreground/60 hover:underline text-xs">
        S’ka çmim
      </button>
    );
  }
  const tier = price < 150 ? "low" : price <= 200 ? "mid" : "high";
  const badgeCfg = {
    low: {
      outer: "bg-gradient-to-br from-yellow-50 to-amber-100 border border-amber-300/80 text-amber-800 shadow-sm shadow-amber-200/60",
      dot: "bg-amber-400",
    },
    mid: {
      outer: "bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-300/80 text-orange-800 shadow-sm shadow-orange-200/60",
      dot: "bg-orange-400",
    },
    high: {
      outer: "bg-gradient-to-br from-red-50 to-rose-100 border border-red-300/80 text-red-700 shadow-sm shadow-red-200/60",
      dot: "bg-red-500",
    },
  }[tier];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xl font-bold text-xs tracking-tight ${badgeCfg.outer}`}>
        <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${badgeCfg.dot}`} />
        <span className="tabular-nums">€{fmtM(price)}</span>
        {data && !data.specific && <span className="font-normal opacity-60" title="Çmimi më i ulët për këtë rrugë në këtë datë">min</span>}
      </span>
    </span>
  );
}

const FLIGHT_COLUMN_DEFS = [
  { key: "route",      label: "Route",           adminOnly: false },
  { key: "date",       label: "Date",            adminOnly: false },
  { key: "flightNo",   label: "Flight Number",   adminOnly: false },
  { key: "seats",      label: "Number of Seats", adminOnly: false },
  { key: "price",      label: "One Way",         adminOnly: false },
  { key: "baggage",    label: "Bagazh",          adminOnly: false },
  { key: "google",     label: "Google",           adminOnly: false },
  { key: "groups",     label: "Grupet",          adminOnly: true },
  { key: "sales",      label: "Shitje",           adminOnly: true },
  { key: "net",        label: "Neto",             adminOnly: true },
  { key: "commission", label: "Komisioni",        adminOnly: true },
] as const;
type FlightColumnKey = (typeof FLIGHT_COLUMN_DEFS)[number]["key"];
type FlightVisibleColumns = Record<FlightColumnKey, boolean>;
const FINANCIAL_COLUMN_KEYS = ["sales", "net", "commission"] as const;

type PdfFlightColumn = {
  key: FlightColumnKey;
  header: string;
  width: number;
  align?: "left" | "center" | "right";
  textColor?: [number, number, number];
  value: (flight: any) => string;
};

// ─── Flight Report PDF Generator ─────────────────────────────────────────────
function generateFlightReportPdf(
  flights: any[],
  opts: { visibleColumns: FlightVisibleColumns },
): jsPDF {
  const { visibleColumns } = opts;
  const now = fmtDateTimeAmPm(new Date(), { dateOptions: { dateStyle: "full" } });
  const fmtDate = (d: string, t: string, arr: string) => {
    try {
      let iso = d;
      const dmy = iso.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmy) iso = `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
      const dt = new Date(`${iso}T${t}:00`);
      const datePart = dt.toLocaleDateString("sq-AL", { day: "numeric", month: "short", year: "numeric" });
      return `${datePart} ${fmtAmPm(t)}-${fmtAmPm(arr)}`;
    } catch { return `${d} ${fmtAmPm(t)}`; }
  };

  const columns: PdfFlightColumn[] = [];
  if (visibleColumns.route) {
    columns.push({ key: "route", header: "Rruga", width: 26, value: f => `${f.fromCity} > ${f.toCity}` });
  }
  if (visibleColumns.date) {
    columns.push({ key: "date", header: "Data & Ora", width: 30, value: f => fmtDate(f.departureDate, f.departureTime, f.arrivalTime) });
  }
  if (visibleColumns.flightNo) {
    columns.push({ key: "flightNo", header: "Fluturimi", width: 16, value: f => f.flightNumber });
  }
  if (visibleColumns.seats) {
    columns.push(
      { key: "seats", header: "Tot.", width: 11, align: "center", value: f => String(f.totalSeats) },
      { key: "seats", header: "Shit.", width: 11, align: "center", textColor: [220, 38, 38], value: f => String(f.soldSeats) },
      { key: "seats", header: "Lira", width: 11, align: "center", textColor: [22, 163, 74], value: f => String(f.availableSeats) },
    );
  }
  if (visibleColumns.price) {
    columns.push(
      { key: "price", header: "Adulte", width: 16, align: "right", value: f => `EUR${fmtM(f.adultPrice)}` },
      { key: "price", header: "Infant", width: 14, align: "right", value: f => `EUR${fmtM(f.infantPrice)}` },
    );
  }
  if (visibleColumns.baggage) {
    columns.push({
      key: "baggage",
      header: "Bag",
      width: 18,
      align: "right",
      value: f => f.checkedBaggagePrice != null
        ? `EUR${fmtM(f.checkedBaggagePrice)}${f.checkedBaggageKg ? `/${f.checkedBaggageKg}kg` : ""}`
        : "-",
    });
  }
  if (visibleColumns.google) {
    columns.push({
      key: "google",
      header: "Google",
      width: 15,
      align: "right",
      textColor: [29, 106, 173],
      value: f => f.googlePrice != null ? `EUR${f.googlePrice}` : "-",
    });
  }
  if (visibleColumns.sales) {
    columns.push({
      key: "sales",
      header: "Shitje",
      width: 18,
      align: "right",
      value: f => `EUR${fmtM(f.salesTotal)}`,
    });
  }
  if (visibleColumns.net) {
    columns.push({
      key: "net",
      header: "Neto",
      width: 18,
      align: "right",
      textColor: [124, 58, 237],
      value: f => f.salesNetTotal == null
        ? (Number(f.salesBookingCount) > 0 ? "Mungon" : "-")
        : `EUR${fmtM(f.salesNetTotal)}`,
    });
  }
  if (visibleColumns.commission) {
    columns.push({
      key: "commission",
      header: "Komisioni",
      width: 18,
      align: "right",
      textColor: [22, 163, 74],
      value: f => {
        const commission = Number(f.salesCommissionTotal) || 0;
        return `${commission < 0 ? "-" : ""}EUR${fmtM(Math.abs(commission))}`;
      },
    });
  }

  const totalColumnWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const orientation = totalColumnWidth > 186 ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usable = pageW - margin * 2;

  // ── Header bar ──────────────────────────────────────────────────────────
  doc.setFillColor(30, 58, 95);
  doc.rect(margin, margin, usable, 13, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Raport Fluturimesh - Kings Travel", margin + 3, margin + 8.5);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(now, margin + usable - 2, margin + 8.5, { align: "right" });

  // ── Summary stats ────────────────────────────────────────────────────────
  const totalSeats = flights.reduce((s, f) => s + f.totalSeats, 0);
  const totalSold  = flights.reduce((s, f) => s + f.soldSeats, 0);
  const totalFree  = flights.reduce((s, f) => s + f.availableSeats, 0);
  const stats = [
    { label: "Fluturime", val: String(flights.length), color: [30, 58, 95] as [number,number,number] },
    { label: "Vende Totale", val: String(totalSeats), color: [30, 58, 95] as [number,number,number] },
    { label: "Shitura", val: String(totalSold), color: [220, 38, 38] as [number,number,number] },
    { label: "Te Lira", val: String(totalFree), color: [22, 163, 74] as [number,number,number] },
  ];
  const boxW = (usable - 3) / 4;
  const boxY = margin + 15;
  stats.forEach((s, i) => {
    const bx = margin + i * (boxW + 1);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(bx, boxY, boxW, 10, 1, 1, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...s.color);
    doc.text(s.val, bx + boxW / 2, boxY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(s.label, bx + boxW / 2, boxY + 8.5, { align: "center" });
  });

  // ── Data table ───────────────────────────────────────────────────────────
  const headers = columns.map(column => column.header);
  const rows = flights.map(flight => columns.map(column => column.value(flight)));
  const colStyles: Record<number, object> = Object.fromEntries(
    columns.map((column, index) => [
      index,
      {
        cellWidth: column.width,
        halign: column.align ?? "left",
        ...(column.textColor ? { textColor: column.textColor } : {}),
        ...(column.key === "flightNo" || (column.key === "seats" && column.header === "Lira")
          ? { fontStyle: "bold" }
          : {}),
      },
    ]),
  );
  const commissionColumnIndex = columns.findIndex(column => column.key === "commission");

  autoTable(doc, {
    startY: boxY + 12,
    head: [headers],
    body: rows,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 7,
      cellPadding: { top: 1.8, right: 2.5, bottom: 1.8, left: 2.5 },
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      textColor: [30, 41, 59],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: [255, 255, 255],
      fontSize: 6.5,
      fontStyle: "bold",
      cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
      halign: "center",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: colStyles,
    didParseCell: data => {
      if (
        data.section === "body"
        && data.column.index === commissionColumnIndex
        && Number(flights[data.row.index]?.salesCommissionTotal) < 0
      ) {
        data.cell.styles.textColor = [220, 38, 38];
      }
    },
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.text(`Kings Travel — Flight Management System`, margin, pageH - 7);
    doc.text(`Faqe ${i} / ${pageCount}`, margin + usable, pageH - 7, { align: "right" });
  }

  return doc;
}

export default function FlightsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Routes for dynamic airport filtering
  const routesQuery = useQuery<{ from: string; to: string }[]>({
    queryKey: ["flight-filter-routes"],
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/routes`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Aeroportet nuk u ngarkuan");
      const routes = await response.json();
      if (!Array.isArray(routes) || routes.some(r => typeof r?.from !== "string" || typeof r?.to !== "string")) {
        throw new Error("Lista e aeroporteve është e pavlefshme");
      }
      return routes;
    },
  });
  const allRoutes = routesQuery.data ?? [];

  // Configurable Google-price refresh interval (hours) → TTL in ms for cache/localStorage.
  const { data: gpTtlData } = useQuery({
    queryKey: ["google-price-ttl"],
    staleTime: 60_000,
    queryFn: async (): Promise<{ hours: number }> => {
      const r = await fetch(`${API_BASE}/settings/google-price-ttl`, { credentials: "include" });
      if (!r.ok) return { hours: 6 };
      return r.json();
    },
  });
  const googleTtlMs = Math.max(0.25, Number(gpTtlData?.hours ?? 6)) * 60 * 60 * 1000;

  const { data: upcomingDaysData } = useQuery<{ days: number }>({
    queryKey: ["upcoming-days"],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/settings/upcoming-days`, { credentials: "include" });
      if (!r.ok) return { days: 7 };
      return r.json();
    },
  });
  const soonDays = upcomingDaysData?.days ?? 7;
  const todayStr = new Date().toISOString().slice(0, 10);
  const soonEndStr = (() => { const d = new Date(todayStr + "T00:00:00"); d.setDate(d.getDate() + soonDays); return d.toISOString().slice(0, 10); })();

  // Pre-load ALL cached Google prices in one bulk request so per-row cells never
  // need to individually re-fetch on every filter change. Refreshes once per TTL.
  const { isFetched: bulkFetched, isError: bulkError } = useQuery<Array<{
    flightId: number; from: string; to: string; date: string;
    flightNumber: string | null; price: number | null; specific: boolean; stale: boolean;
  }>>({
    queryKey: ["google-prices-bulk"],
    staleTime: googleTtlMs,
    gcTime: googleTtlMs,
    retry: false,
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/flights/google-prices-bulk`, { credentials: "include" });
      if (!r.ok) throw new Error("Nuk u verifikuan çmimet Google.");
      const data = (await r.json()) as Array<{
        flightId: number; from: string; to: string; date: string;
        flightNumber: string | null; price: number | null; specific: boolean; stale: boolean;
      }>;
      // Hydrate every per-row cell's react-query cache + localStorage BEFORE this
      // promise resolves, so by the time `bulkReady` flips true the cells already
      // see fresh data and never fire their own request (closes the cold-load race).
      for (const entry of data) {
        const value = normalizeGooglePrice(entry);
        queryClient.setQueryData(
          ["google-flight-price", entry.from, entry.to, entry.date, entry.flightNumber],
          value,
        );
        const lsKey = googlePriceLsKey(entry.from, entry.to, entry.date, entry.flightNumber);
        if (lsKey) writeGooglePriceLS(lsKey, { ...value, ts: Date.now() });
      }
      return data;
    },
  });
  // Per-row Google price cells wait for this one bulk preload to settle before
  // making any individual request — this prevents a cold-load storm of N
  // /flights/google-price calls (one per visible row) that saturates the DB pool
  // and slows the whole system. After the bulk hydrates react-query + localStorage,
  // already-cached rows render instantly with zero extra requests.
  const bulkReady = bulkFetched;

  // Filters
  const [fromCities, setFromCities] = useState<string[]>([]);
  const [toCities, setToCities] = useState<string[]>([]);
  const [airlineFlightNo, setAirlineFlightNo] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [alertFilter, setAlertFilter] = useState("all");
  // Filtri "Shitjet e jashtme": all / open (hapura jashtë) / blocked (bllokuara jashtë).
  // Mund të para-zgjidhet nga URL: /flights?external=blocked (linku "Fluturime të Bllokuara").
  // Filtri i dukshmërisë në Booking Engine: all / visible (të pafshehura) / hidden (të fshehura).
  const [beFilter, setBeFilter] = useState<"all" | "visible" | "hidden">("all");
  const [externalFilter, setExternalFilter] = useState<"all" | "open" | "blocked">(() => {
    const p = new URLSearchParams(window.location.search).get("external");
    return p === "blocked" ? "blocked" : p === "open" ? "open" : "all";
  });
  // Nëse klikohet linku i menusë ndërsa jemi tashmë te /flights, ndryshon vetëm query-string-u —
  // dëgjojmë ndryshimet e URL-së dhe sinkronizojmë filtrin.
  useEffect(() => {
    const sync = () => {
      if (!window.location.pathname.includes("/flights")) return;
      const sp = new URLSearchParams(window.location.search);
      const p = sp.get("external");
      setExternalFilter(p === "blocked" ? "blocked" : p === "open" ? "open" : "all");
      const t = sp.get("tab");
      if (t === "booked") setTab("booked");
      else if (t === "suspicious") setTab("suspicious");
      else if (t === "norule") setTab("norule");
      else if (t === "nogroup") setTab("nogroup");
      else if (t === "scheduleerror") setTab("scheduleerror");
      else setTab(prev => (prev === "booked" || prev === "suspicious" || prev === "norule" ? "bookable" : prev));
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("pushState" as any, sync);
    window.addEventListener("replaceState" as any, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("pushState" as any, sync);
      window.removeEventListener("replaceState" as any, sync);
    };
  }, []);
  // Flight-price range (server-side: adultPrice). Google-price range (client-side: per-row prices).
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minGooglePrice, setMinGooglePrice] = useState("");
  const [maxGooglePrice, setMaxGooglePrice] = useState("");
  // "Çmim i Ri" tab only: filter by the per-row Diferenca (candidate − displayed Google).
  const [minDiff, setMinDiff] = useState("");
  const [maxDiff, setMaxDiff] = useState("");
  // Skeda mund të para-zgjidhet nga URL: /flights?tab=booked (linku "Fluturime të Konfirmuara").
  const [tab, setTab] = useState<"all" | "pending" | "bookable" | "soldout" | "past" | "soon" | "alerts" | "confirmed" | "duplicates" | "booked" | "noprice" | "newprice" | "stale" | "excluded" | "suspicious" | "norule" | "nogroup" | "scheduleerror">(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "scheduleerror" ? "scheduleerror" : t === "nogroup" ? "nogroup" : t === "booked" ? "booked" : t === "suspicious" ? "suspicious" : t === "norule" ? "norule" : "bookable";
  });
  const [seatBooking, setSeatBooking] = useState<"" | "with" | "without" | "noseat" | "withseat">("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [paxAdults, setPaxAdults] = useState(0);
  const [paxChildren, setPaxChildren] = useState(0);
  const [paxInfants, setPaxInfants] = useState(0);

  // Dynamic airport codes for filter dropdowns (multi-select aware)
  const filteredFromCodes = toCities.length > 0
    ? [...new Set(allRoutes.filter(r => toCities.includes(r.to)).map(r => r.from))].sort()
    : [...new Set(allRoutes.map(r => r.from))].sort();
  const filteredToCodes = fromCities.length > 0
    ? [...new Set(allRoutes.filter(r => fromCities.includes(r.from)).map(r => r.to))].sort()
    : [...new Set(allRoutes.map(r => r.to))].sort();

  // Dialogs
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { user, hasPermission } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
  const flightGroups = useAgencyGroups(isAdmin);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [detailFlightId, setDetailFlightId] = useState<number | null>(null);
  const [detailFlightData, setDetailFlightData] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<"details" | "edit">("details");

  // Pagination
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkSeatsOpen, setBulkSeatsOpen] = useState(false);
  const [bulkPriceValue, setBulkPriceValue] = useState("");
  const [bulkChildPriceValue, setBulkChildPriceValue] = useState("");
  const [bulkInfantPriceValue, setBulkInfantPriceValue] = useState("");
  const [bulkBagPriceValue, setBulkBagPriceValue] = useState("");
  const [bulkBagKgValue, setBulkBagKgValue] = useState("");
  const [bulkStatusValue, setBulkStatusValue] = useState("open");
  const [bulkSeatsValue, setBulkSeatsValue] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [sortKey, setSortKey] = useState<"route" | "date" | "flightNo" | "seats" | "price" | "baggage" | "google" | "alert" | "newprice" | "diff">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── Configurable visible columns (persisted; baggage hidden by default) ──
  const COLUMN_DEFS = FLIGHT_COLUMN_DEFS;
  const flightLayoutKey = `flights.layout.v1.${user?.id ?? "anonymous"}`;
  const [flightLayout, setFlightLayout] = useState<FlightLayout>(initialFlightLayout);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(flightLayoutKey) || "null");
      setFlightLayout(saved?.layout?.order instanceof Array && saved?.layout?.widths ? saved.layout : initialFlightLayout);
      if (saved?.visible) setVisibleCols(prev => ({ ...prev, ...saved.visible }));
    } catch { setFlightLayout(initialFlightLayout); }
  }, [flightLayoutKey]);
  type ColKey = FlightColumnKey;
  const COL_STORAGE_KEY = "flights.visibleColumns.v1";
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(() => {
    const defaults: Record<ColKey, boolean> = {
      route: true, groups: true, date: true, flightNo: true, seats: true, price: true, baggage: false, google: true,
      sales: true, net: true, commission: true,
    };
    try {
      const raw = localStorage.getItem(COL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<ColKey, boolean>>;
        return { ...defaults, ...parsed };
      }
    } catch {}
    return defaults;
  });
  useEffect(() => {
    try { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(visibleCols)); } catch {}
  }, [visibleCols]);
  const toggleCol = (key: ColKey) => setVisibleCols(prev => ({ ...prev, [key]: !prev[key] }));
  const colVisible = (key: ColKey) => visibleCols[key];
  const selectableColumnDefs = COLUMN_DEFS.filter(column => !column.adminOnly || isAdmin);
  const tableColSpan = 1 + selectableColumnDefs.filter(column => visibleCols[column.key]).length + 1;
  const financialColumnCount = isAdmin ? FINANCIAL_COLUMN_KEYS.filter(colVisible).length : 0;
  const mainLayoutColumns = ["select", ...COLUMN_DEFS.filter(c => (!c.adminOnly || isAdmin) && colVisible(c.key)).map(c => c.key), "actions"];
  const newPriceLayoutColumns = ["select", "route", "flightNo", "date", "price", "google",
    ...(isAdmin && colVisible("groups") ? ["groups"] : []), "newprice", "diff",
    ...FINANCIAL_COLUMN_KEYS.filter(c => isAdmin && colVisible(c))];
  const [applyingSchedule, setApplyingSchedule] = useState<Set<number>>(new Set());

  // Apply the exact full Google schedule; legacy time-only alerts need a recheck.
  const applyGoogleSchedule = async (f: any) => {
    const schedule = parseGoogleScheduleAlert(f.scheduleAlertDetail || "");
    if (!schedule) {
      toast({ title: "S'u gjet orari i ri", description: "Përdor faqen 'Kontrolli i Orarit'.", variant: "destructive" });
      return;
    }
    const newDep = schedule.departureTime, newArr = schedule.arrivalTime;
    setApplyingSchedule(prev => new Set(prev).add(f.id));
    try {
      const res = await fetch(`${API_BASE}/flights/${f.id}/sync-schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(schedule),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Dështoi përditësimi");
      toast({ title: "Orari u përditësua", description: `Nisja ${schedule.departureDate} ${fmtAmPm(newDep)} – Mbërritja ${schedule.arrivalDate} ${fmtAmPm(newArr)}` });
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast({ title: "Gabim", description: e.message, variant: "destructive" });
    } finally {
      setApplyingSchedule(prev => { const s = new Set(prev); s.delete(f.id); return s; });
    }
  };

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Sortable header cell for the "Çmim i Ri" tab table — mirrors the classic list's
  // header (click to sort, dual asc/desc arrow indicator).
  const newPriceTh = (k: typeof sortKey, label: string, align: "left" | "right" = "left") => (
    <th className={`px-4 py-3 font-medium whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => handleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === k ? "text-foreground" : ""}`}
      >
        {label}
        <span className="flex flex-col leading-[0] ml-0.5">
          <svg className={`h-2 w-2 ${sortKey === k && sortDir === "asc" ? "text-primary" : "text-muted-foreground/40"}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 0L8 4H0L4 0z"/></svg>
          <svg className={`h-2 w-2 ${sortKey === k && sortDir === "desc" ? "text-primary" : "text-muted-foreground/40"}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 4L0 0H8L4 4z"/></svg>
        </span>
      </button>
    </th>
  );

  // Google price column is fetched per-row on the client; collect prices here so we can sort by them.
  const [googlePrices, setGooglePrices] = useState<Record<number, number | null>>({});
  // googlePrices feeds ONLY the Google-price filter and the Google sort. Each row's
  // GooglePriceCell renders its own price independently, so when neither feature is
  // active (the common case — e.g. plain destination filtering) collecting prices here
  // is pointless and forces a full list re-render for every one of up to 50 sequential
  // per-row resolutions (a re-render storm). Gate updates behind a ref so normal
  // filtering stays smooth; repopulate from the query cache when a feature turns on.
  const googleFeatureActiveRef = useRef(false);
  const reportGooglePrice = useCallback((id: number, price: number | null) => {
    if (!googleFeatureActiveRef.current) return;
    setGooglePrices(prev => (prev[id] === price ? prev : { ...prev, [id]: price }));
  }, []);
  // "Çmim i Ri" tab: capture the Google price each row actually displays (same
  // cache/LS source as the classic list) so the Diferenca column compares the new
  // candidate against the EXACT value shown in "Google i Ruajtur" — never a stale
  // DB-only baseline that would leave display and diff out of sync. Always on
  // (this tab needs every row's value); dedup guard avoids re-render loops.
  const [newTabGoogle, setNewTabGoogle] = useState<Record<number, number | null>>({});
  const reportNewTabGoogle = useCallback((id: number, price: number | null) => {
    setNewTabGoogle(prev => (prev[id] === price ? prev : { ...prev, [id]: price }));
  }, []);
  // The server doesn't know about the client-side sorts ("google", and the "Çmim i Ri"
  // tab's "newprice"/"diff" columns); keep date order server-side and re-sort on the
  // client. Direction is also pinned in those modes so toggling asc/desc doesn't
  // trigger a pointless refetch.
  const isClientSort = sortKey === "google" || sortKey === "newprice" || sortKey === "diff";
  const serverSortKey = isClientSort ? "date" : sortKey;
  const serverSortDir = isClientSort ? "asc" : sortDir;

  const openDetail = (id: number, tab: "details" | "edit" = "details", flight?: any) => {
    setDetailFlightId(id);
    setDetailTab(tab);
    if (flight) setDetailFlightData(flight);
  };

  const prefetchFlight = useCallback((id: number) => {
    queryClient.prefetchQuery(getGetFlightQueryOptions(id));
    queryClient.prefetchQuery(getListBookingsQueryOptions({ flightId: id } as any));
  }, [queryClient]);

  // Tab → status mapping
  const tabStatus: Record<string, string> = {
    scheduleerror: "all",
    nogroup: "all",
    all: "all", bookable: "open", pending: "closed", soldout: "soldout", past: "all", soon: "open", alerts: "all", confirmed: "all", duplicates: "all", booked: "open", noprice: "all", newprice: "open", stale: "all", excluded: "all", suspicious: "all", norule: "all",
  };
  // An explicit dropdown status selection wins over the tab's default status, so
  // picking e.g. "Sold Out" while on the Bookable tab actually filters to sold-out
  // flights instead of being silently ignored.
  const effectiveStatus = statusFilter !== "all" ? statusFilter : tabStatus[tab] !== "all" ? tabStatus[tab] : undefined;
  // Default view shows upcoming flights (by date); "past" shows only past flights;
  // "Njoftime" uses "future" so already-departed flights (by date+time) drop off.
  // "soon" shows only flights within the next N days (N from settings).
  const timeframe = tab === "soon" ? "soon" : tab === "past" ? "past" : (tab === "scheduleerror" || tab === "nogroup" || tab === "alerts" || tab === "duplicates" || tab === "confirmed" || tab === "booked" || tab === "noprice" || tab === "stale" || tab === "excluded" || tab === "newprice" || tab === "suspicious" || tab === "norule") ? "future" : "upcoming";
  // "Dublikate" tab → only flights that are duplicates of another (route+date+time+flightNo).
  const duplicatesOnly = tab === "duplicates";
  // "Konfirmuar" tab → only flights whose Njoftime alert was acknowledged (Confirm).
  const confirmedOnly = tab === "confirmed";
  // "Të Konfirmuara" tab → only flights that have at least one confirmed booking.
  const bookedOnly = tab === "booked";
  // "Pa Çmim" tab → only flights whose Google price resolved to nothing ("S'ka").
  const noPriceOnly = tab === "noprice";
  const staleOnly = tab === "stale";
  // "Përjashtuar Online" tab → only flights excluded from the automatic Google price rule.
  const excludedOnly = tab === "excluded";
  // "Fluturime të dyshimta" → fluturime të ardhshme ku Google nuk i gjeti / kontrolli dështoi.
  const suspiciousOnly = tab === "suspicious";
  const noRuleOnly = tab === "norule";
  const scheduleErrorOnly = tab === "scheduleerror";
  // "Njoftime" tab shows only upcoming flights that carry a schedule alert. The dropdown
  // can narrow it to changed/cancelled; any other value (all/none) still means "any alert"
  // so the tab never leaks alert-free flights.
  const effectiveAlert = tab === "alerts"
    ? (alertFilter === "changed" || alertFilter === "cancelled" || alertFilter === "seats" ? alertFilter : "any")
    : alertFilter;

  // Debounce text filters so we don't fire on every keystroke
  const [debouncedAirlineFlightNo,setDebouncedAirlineFlightNo]= useState("");
  useEffect(() => { const t = setTimeout(() => { setDebouncedAirlineFlightNo(airlineFlightNo); setPage(1); }, 400); return () => clearTimeout(t); }, [airlineFlightNo]);

  // Debounce the flight-price range so typing doesn't refetch on every keystroke.
  const [debouncedMinPrice, setDebouncedMinPrice] = useState("");
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState("");
  useEffect(() => { const t = setTimeout(() => { setDebouncedMinPrice(minPrice); setDebouncedMaxPrice(maxPrice); setPage(1); }, 400); return () => clearTimeout(t); }, [minPrice, maxPrice]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [effectiveStatus, timeframe, startDate, endDate, seatBooking, selectedDays, paxAdults, paxChildren, fromCities, toCities, minGooglePrice, maxGooglePrice, effectiveAlert, duplicatesOnly, confirmedOnly, bookedOnly, noPriceOnly, staleOnly, excludedOnly, suspiciousOnly, noRuleOnly, scheduleErrorOnly, externalFilter, beFilter, selectedGroupId]);
  useEffect(() => { setSelectedIds(new Set()); }, [selectedGroupId]);
  useEffect(() => {
    if (selectedGroupId && selectedGroupId !== "none" && flightGroups.data && !flightGroups.data.some(group => String(group.id) === selectedGroupId)) {
      setSelectedGroupId("");
    }
  }, [selectedGroupId, flightGroups.data]);
  // Clear bulk selection whenever the tab changes (esp. entering/leaving "Çmim i Ri").
  useEffect(() => { setSelectedIds(new Set()); }, [tab]);
  // "Çmim i Ri" keeps selection STRICTLY to the rows currently visible: clear it on
  // any page / page-size / filter change so "Updato Çmimet" can never promote a
  // candidate for a flight hidden on another page or behind a changed filter.
  // (Classic tabs intentionally support cross-page select-all, so this is gated.)
  useEffect(() => {
    if (tab === "newprice") setSelectedIds(new Set());
  }, [tab, page, perPage, effectiveStatus, timeframe, startDate, endDate, seatBooking, selectedDays, paxAdults, paxChildren, fromCities, toCities, minGooglePrice, maxGooglePrice, effectiveAlert, duplicatesOnly, confirmedOnly, bookedOnly, noPriceOnly, staleOnly, excludedOnly, suspiciousOnly, externalFilter, beFilter, debouncedAirlineFlightNo, debouncedMinPrice, debouncedMaxPrice, selectedGroupId]);

  // "Çmim i Ri" range filters (Diferenca + Google) are computed client-side from the
  // new-price candidates, so the server cannot paginate by them. When one is active we
  // load the WHOLE matching set (page 1, huge limit) and paginate the FILTERED result
  // on the client — otherwise the filter only ever sees the current 50-row page and
  // looks broken across a multi-page dataset.
  const numActive = (s: string) => s.trim() !== "" && !Number.isNaN(parseFloat(s));
  const newTabRangeActive =
    tab === "newprice" &&
    (numActive(minDiff) || numActive(maxDiff) || numActive(minGooglePrice) || numActive(maxGooglePrice));
  const effectiveLimit = newTabRangeActive ? 100000 : perPage;
  const effectivePage  = newTabRangeActive ? 1 : page;
  // Reset to page 1 whenever a range filter changes so the client-paginated view starts
  // at the top of the freshly filtered set.
  useEffect(() => { setPage(1); }, [minDiff, maxDiff, minGooglePrice, maxGooglePrice]);

  // Server-side query: pagination + filtering + sorting
  const flightsQueryKey = ["flights-paginated", paxAdults + paxChildren, selectedGroupId, tab, fromCities.join(","), toCities.join(","), debouncedAirlineFlightNo, startDate, endDate, effectiveStatus, timeframe, seatBooking, selectedDays.join(","), effectivePage, effectiveLimit, serverSortKey, serverSortDir, debouncedMinPrice, debouncedMaxPrice, effectiveAlert, duplicatesOnly, confirmedOnly, bookedOnly, noPriceOnly, staleOnly, excludedOnly, suspiciousOnly, scheduleErrorOnly, externalFilter, beFilter, soonDays];

  const { data: flightsResponse, isLoading, isFetching, isPlaceholderData, isSuccess } = useQuery({
    queryKey: flightsQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromCities.length > 0)    params.set("fromCity",    fromCities.join(","));
      if (toCities.length > 0)      params.set("toCity",      toCities.join(","));
      if (isAdmin && selectedGroupId) params.set("agencyGroupId", selectedGroupId);
      if (isAdmin && tab === "nogroup") params.set("noGroup", "true");
      if (debouncedAirlineFlightNo) params.set("search",      debouncedAirlineFlightNo);
      if (startDate)                params.set("startDate",   startDate);
      if (endDate)                  params.set("endDate",     endDate);
      if (effectiveStatus)          params.set("status",      effectiveStatus);
      params.set("timeframe", timeframe);
      if (seatBooking)              params.set("seatBooking", seatBooking);
      if (paxAdults + paxChildren > 0) params.set("exactSeats", String(paxAdults + paxChildren));
      if (selectedDays.length > 0)  params.set("days", selectedDays.join(","));
      if (debouncedMinPrice)        params.set("minPrice", debouncedMinPrice);
      if (debouncedMaxPrice)        params.set("maxPrice", debouncedMaxPrice);
      if (effectiveAlert === "any") params.set("anyAlert", "true");
      else if (effectiveAlert !== "all") params.set("scheduleAlert", effectiveAlert);
      if (tab === "alerts") params.set("anyAlert", "true");
      if (duplicatesOnly)           params.set("duplicates", "true");
      if (confirmedOnly)            params.set("confirmed", "true");
      if (bookedOnly)               params.set("bookedConfirmed", "true");
      if (noPriceOnly)              params.set("noGooglePrice", "true");
      if (staleOnly)                params.set("staleGooglePrice", "true");
      if (excludedOnly)             params.set("excludedFromGoogle", "true");
      if (suspiciousOnly)           params.set("suspicious", "true");
      if (noRuleOnly)               params.set("noGoogleRule", "true");
      if (scheduleErrorOnly)        params.set("scheduleError", "true");
      if (tab === "newprice") params.set("googleMonitoringOnly", "true");
      if (externalFilter === "blocked") params.set("externalBlocked", "true");
      else if (externalFilter === "open") params.set("externalBlocked", "false");
      if (beFilter === "hidden")    params.set("beVisible", "false");
      else if (beFilter === "visible") params.set("beVisible", "true");
      params.set("includeSalesSummary", "true");
      params.set("page",    String(effectivePage));
      params.set("limit",   String(effectiveLimit));
      params.set("sortKey", serverSortKey);
      params.set("sortDir", serverSortDir);
      const resp = await fetch(`${API_BASE}/flights?${params}`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to fetch flights");
      return resp.json();
    },
    // A group's old rows must never masquerade as results for a newly selected group.
    placeholderData: (prev: any, previousQuery) => previousQuery?.queryKey[2] === selectedGroupId && previousQuery?.queryKey[1] === paxAdults + paxChildren ? prev : undefined,
    staleTime: 10_000,
  });

  const flights: any[]           = flightsResponse?.data       ?? [];
  const total: number            = flightsResponse?.total      ?? 0;
  const totalPages: number       = flightsResponse?.totalPages ?? 1;
  const serverCounts             = flightsResponse?.counts     ?? {};

  const counts = {
    scheduleerror: serverCounts.scheduleerror ?? 0,
    nogroup: serverCounts.nogroup ?? 0,
    all:     serverCounts.all     ?? 0,
    bookable:serverCounts.open    ?? 0,
    pending: serverCounts.closed  ?? 0,
    soldout: serverCounts.soldout ?? 0,
    past:    serverCounts.past    ?? 0,
    soon:    serverCounts.soon    ?? 0,
    alerts:  serverCounts.alerts  ?? 0,
    confirmed: serverCounts.confirmed ?? 0,
    duplicates: serverCounts.duplicates ?? 0,
    booked: serverCounts.booked ?? 0,
    noprice: serverCounts.noprice ?? 0,
    suspicious: serverCounts.suspicious ?? 0,
    norule: serverCounts.norule ?? 0,
    stale: serverCounts.stale ?? 0,
    // "Çmim i Ri" shows only ACTIVE upcoming flights (open status, not departed),
    // so its badge mirrors the open-count, not the all-count.
    newprice: serverCounts.newprice ?? serverCounts.open ?? 0,
    excluded: serverCounts.excluded ?? 0,
  };

  const tabOptions = ["all", "pending", "bookable", "soldout", "past", "soon", "alerts", "excluded",
    ...(counts.scheduleerror > 0 ? ["scheduleerror"] as const : []),
    ...(isAdmin && counts.nogroup > 0 ? ["nogroup"] as const : []),
    ...(tab === "booked" ? ["booked"] as const : []),
    "noprice", "suspicious", "norule", "newprice", "stale", "duplicates"] as const;
  const countsReady = isSuccess && !isPlaceholderData && flightsResponse?.counts != null;
  const visibleTabs = tabOptions.filter(t => !countsReady || counts[t] > 0);
  const fallbackTab = countsReady && counts[tab] === 0 ? visibleTabs[0] : undefined;
  useEffect(() => {
    // Never redirect from a loading, failed, or previous-query response.
    // If every category is empty, keep the empty table without any tab buttons.
    if (isFetching || !fallbackTab) return;
    setTab(fallbackTab);
    setPage(1);
    const sp = new URLSearchParams(window.location.search);
    if (fallbackTab === "bookable") sp.delete("tab"); else sp.set("tab", fallbackTab);
    const qs = sp.toString();
    window.history.replaceState(window.history.state, "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    if (fallbackTab !== "newprice" && (sortKey === "newprice" || sortKey === "diff")) {
      setSortKey("date");
      setSortDir("asc");
    }
  }, [fallbackTab, isFetching, sortKey]);

  // ── "Çmim i Ri" tab data + actions (admin only) ─────────────────────────────
  // Saved Google price + latest DISPLAY-ONLY candidate per server cache key. Only
  // fetched while the "Çmim i Ri" tab is open; resolved per-flight (specific→route).
  const newPricesQuery = useQuery({
    queryKey: ["new-prices-bulk"],
    enabled: tab === "newprice" && isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, { price: number | null; candidatePrice: number | null; candidateAt: string | null }>> => {
      const r = await fetch(`${API_BASE}/flights/new-prices-bulk`, { credentials: "include" });
      if (!r.ok) throw new Error("new-prices");
      const rows = await r.json() as Array<{ cacheKey: string; price: number | null; candidatePrice: number | null; candidateAt: string | null }>;
      const m = new Map<string, { price: number | null; candidatePrice: number | null; candidateAt: string | null }>();
      for (const row of rows) m.set(row.cacheKey, { price: row.price, candidatePrice: row.candidatePrice, candidateAt: row.candidateAt });
      return m;
    },
  });
  const newPricesMap = newPricesQuery.isError ? null : newPricesQuery.data ?? null;
  // The candidate endpoint's `price` is a historical DB baseline without a
  // freshness flag. Never use it as a display/filter/diff fallback. Read the SAME
  // query snapshot as GooglePriceCell, including refetch failures with cached data.
  const resolveSavedGoogle = (f: any): number | null => {
    if (bulkError || f.status === "soldout") return null;
    const state = queryClient.getQueryState<GooglePriceValue>([
      "google-flight-price", f.fromAirport || f.fromCity, f.toAirport || f.toCity,
      f.departureDate, f.flightNumber,
    ]);
    return resolveGooglePriceDisplay(state?.data, state?.status === "error").price;
  };
  // Replicates the server's normFlightNum + cacheKey shape so candidates line up.
  const resolveNewPrice = (f: any): { saved: number | null; candidate: number | null } => {
    const saved = resolveSavedGoogle(f);
    if (!newPricesMap) return { saved, candidate: null };
    const fromU = String(f.fromCity ?? "").toUpperCase();
    const toU = String(f.toCity ?? "").toUpperCase();
    const date = String(f.departureDate ?? "");
    const norm = String(f.flightNumber ?? "").replace(/\s+/g, "").toUpperCase().trim();
    const hit = newPricesMap.get(`${fromU}|${toU}|${date}|${norm}`) ?? newPricesMap.get(`${fromU}|${toU}|${date}|`) ?? null;
    return { saved, candidate: hit?.candidatePrice ?? null };
  };
  // A flight is "updatable" only when it actually has a "Çmim i Ri" (candidate Google
  // price). Rows showing "S'ka" have no candidate and must never be promoted.
  const hasNewPrice = (f: any): boolean => {
    const c = resolveNewPrice(f).candidate;
    return c != null && c > 0;
  };

  const newPriceCfgQuery = useQuery({
    queryKey: ["new-price-check-cfg"],
    enabled: tab === "newprice" && isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<{ enabled: boolean; intervalMinutes: number; lastRunAt: string | null;
      automaticProgress?: { running: boolean; phase: string; done: number; total: number; refreshed: number; startedAt: string | null; finishedAt: string | null }
    }> => {
      const r = await fetch(`${API_BASE}/settings/new-price-check`, { credentials: "include" });
      if (!r.ok) throw new Error("new-price-cfg");
      return await r.json();
    },
  });
  const fmtAgo = (iso: string): string => {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "tani";
    if (m < 60) return `${m} min më parë`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} orë më parë`;
    return `${Math.round(h / 24)} ditë më parë`;
  };

  const [refreshingNew, setRefreshingNew] = useState(false);
  // Progresi i rifreskimit "Çmim i Ri" në sfond: {done,total} grupe rrugë+datë.
  const [newPriceProgress, setNewPriceProgress] = useState<{ done: number; total: number } | null>(null);

  // Rifreskimi tani nis punën në SFOND në server dhe këtu ndiqet progresi me
  // polling — nuk varet më nga timeout-i i lidhjes HTTP (më parë "ndalonte në mes").
  const runNewPriceJob = async (start: () => Promise<Response>): Promise<void> => {
    setRefreshingNew(true);
    setNewPriceProgress(null);
    try {
      const r = await start();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "refresh");
      if (j?.busy) { toast({ title: "Një kontroll është duke u kryer", description: "Provo sërish pas pak." }); return; }
      if (!j?.started) { toast({ title: "Rifreskimi nuk u nis", description: "Kontrollo konfigurimin e RapidAPI.", variant: "destructive" }); return; }
      setNewPriceProgress({ done: 0, total: 0 });
      const final = await pollBackgroundJob(`${API_BASE}/settings/new-price-check/progress`, j?.startedAt ?? null, setNewPriceProgress);
      if (final) toast({ title: "Çmimet u rifreskuan", description: `${final.refreshed ?? 0} rrugë u kontrolluan.` });
      else toast({ title: "Rifreskimi u zëvendësua nga një run tjetër" });
      await Promise.all([newPricesQuery.refetch(), newPriceCfgQuery.refetch()]);
    } catch (e: any) {
      toast({ title: "Gabim gjatë rifreskimit", description: String(e?.message || e), variant: "destructive" });
    } finally { setRefreshingNew(false); setNewPriceProgress(null); }
  };

  const handleNewPriceRefresh = async (): Promise<void> => {
    await runNewPriceJob(() => fetch(`${API_BASE}/settings/new-price-check/run`, { method: "POST", credentials: "include" }));
  };

  // "Rifresko të Zgjedhurat": re-check Google candidates only for the selected rows
  // that are currently visible (mirrors the apply-bulk visibility safety).
  const handleNewPriceRefreshSelected = async (): Promise<void> => {
    const visibleIds = new Set(paginatedFlights.map((f: any) => f.id));
    const ids = [...selectedIds].filter(id => visibleIds.has(id));
    if (!ids.length) {
      toast({ title: "Asnjë fluturim i zgjedhur", description: "Zgjidh fluturimet që do të rifreskosh." });
      return;
    }
    await runNewPriceJob(() => fetch(`${API_BASE}/settings/new-price-check/run-selected`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flightIds: ids }),
    }));
  };

  const [applyingNew, setApplyingNew] = useState(false);
  const handleApplyNewPrices = async (): Promise<void> => {
    // Only ever promote flights that actually HAVE a "Çmim i Ri" (candidate). Flights
    // showing "S'ka" are never touched. When the admin selected specific rows we apply
    // to the selected ones that have a candidate; with no selection we apply to EVERY
    // visible flight that has a new price. Staying within the visible set keeps a stale
    // cross-page/filter selection from ever promoting a hidden flight.
    const candidateSet = new Set(
      paginatedFlights.filter(hasNewPrice).map((f: any) => f.id as number),
    );
    // With an active selection apply ONLY to the selected rows that have a candidate
    // (so selecting rows that are all "S'ka" updates nothing); with no selection apply
    // to every visible candidate flight.
    const ids = selectedIds.size > 0
      ? [...selectedIds].filter(id => candidateSet.has(id))
      : [...candidateSet];
    if (!ids.length) {
      toast({
        title: "Asnjë fluturim me çmim të ri",
        description: "Vetëm fluturimet që kanë 'Çmim i Ri' mund të përditësohen.",
      });
      return;
    }
    if (!(await confirmDialog({
      title: `Updato çmimet për ${ids.length} fluturime me çmim të ri?`,
      text: "Çmimi i ri (Google) bëhet çmimi i ruajtur dhe çmimi i shitjes rillogaritet sipas rregullave ekzistuese. Fluturimet pa çmim të ri (S'ka) nuk preken.",
      confirmText: "Po, updato",
    }))) return;
    // Count how many Google prices will ACTUALLY change (candidate differs from the
    // saved value the admin currently sees on the row) so the toast reports the
    // meaningful number. The server's `priceChanged` only counts SALE-price rule
    // recomputes (0 when no Google rule is active), which wrongly read as "nothing
    // happened" even though the saved Google prices were promoted.
    const idToFlight = new Map<number, any>(paginatedFlights.map((f: any) => [f.id as number, f]));
    let willChangeGoogle = 0;
    for (const id of ids) {
      const f = idToFlight.get(id);
      if (!f) continue;
      const np = resolveNewPrice(f);
      const savedGoogle = np.saved;
      if (np.candidate != null && (savedGoogle == null || Math.abs(np.candidate - savedGoogle) > 0.01)) {
        willChangeGoogle++;
      }
    }
    setApplyingNew(true);
    try {
      const r = await fetch(`${API_BASE}/flights/google-price/apply-bulk`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightIds: ids }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "apply");
      const applied = j.applied ?? ids.length;
      toast({
        title: "Çmimet Google u përditësuan",
        description:
          (willChangeGoogle > 0
            ? `${willChangeGoogle} çmime Google u përditësuan me çmimet e reja`
            : "Çmimet Google ishin tashmë të njëjta me çmimet e reja") +
          ` · ${applied} fluturime u përpunuan` +
          (j.skippedNoCandidate ? ` · ${j.skippedNoCandidate} pa çmim të ri` : ""),
      });
      setSelectedIds(new Set());
      await Promise.all([
        newPricesQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["flights-paginated"] }),
        // Refresh the per-row "Google i Ruajtur" cells so the promoted saved price
        // shows immediately. Their query is cached for the full TTL, so without this
        // the column keeps showing the OLD price and the update looks like it failed.
        queryClient.invalidateQueries({ queryKey: ["google-flight-price"] }),
      ]);
    } catch (e: any) {
      toast({ title: "Gabim gjatë përditësimit", description: String(e?.message || e), variant: "destructive" });
    } finally { setApplyingNew(false); }
  };

  const createFlight = useCreateFlight();
  const toggleSales  = useToggleFlightSales();
  const duplicate    = useDuplicateFlight();
  const deleteFlight = useDeleteFlight();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["flights-paginated"] });

  // Client-side filter: seats (days are server-side) + Google-price range.
  // Google prices are fetched per-row on the client (googlePrices state), so they can
  // only be filtered here; rows whose Google price hasn't resolved are hidden while a
  // Google-price filter is active. Use "Të gjitha" page size to apply it across all flights.
  const filteredFlights = useMemo(() => {
    const minSeats = paxAdults + paxChildren;
    const gMin = minGooglePrice.trim() ? parseFloat(minGooglePrice) : null;
    const gMax = maxGooglePrice.trim() ? parseFloat(maxGooglePrice) : null;
    const gActive = (gMin != null && !Number.isNaN(gMin)) || (gMax != null && !Number.isNaN(gMax));
    // Diferenca range — only on the "Çmim i Ri" tab where that column exists. The diff
    // is resolved IDENTICALLY to the displayed column (candidate − newTabGoogle/saved)
    // so the filter never disagrees with what the row shows. Negative values allowed.
    const dMin = minDiff.trim() ? parseFloat(minDiff) : null;
    const dMax = maxDiff.trim() ? parseFloat(maxDiff) : null;
    const dActive = tab === "newprice" && ((dMin != null && !Number.isNaN(dMin)) || (dMax != null && !Number.isNaN(dMax)));
    if (minSeats === 0 && !gActive && !dActive) return flights;
    return flights.filter((f: any) => {
      if (minSeats > 0 && (f.availableSeats ?? 0) !== minSeats) return false;
      // Both range filters use the verified saved-price display, never the
      // candidate endpoint's historical baseline.
      const npTab = (tab === "newprice" && (gActive || dActive)) ? resolveNewPrice(f) : null;
      const savedGoogleTab = npTab?.saved ?? null;
      if (gActive) {
        const gp = tab === "newprice" ? savedGoogleTab : resolveSavedGoogle(f);
        if (gp == null) return false;
        if (gMin != null && !Number.isNaN(gMin) && gp < gMin) return false;
        if (gMax != null && !Number.isNaN(gMax) && gp > gMax) return false;
      }
      if (dActive && npTab) {
        const diff = npTab.candidate != null && savedGoogleTab != null ? npTab.candidate - savedGoogleTab : null;
        if (diff == null) return false;
        if (dMin != null && !Number.isNaN(dMin) && diff < dMin) return false;
        if (dMax != null && !Number.isNaN(dMax) && diff > dMax) return false;
      }
      return true;
    });
  }, [flights, paxAdults, paxChildren, minGooglePrice, maxGooglePrice, googlePrices, minDiff, maxDiff, tab, newTabGoogle, newPricesMap, bulkError]);

  // Whether a Google-price-dependent feature is active (price filter or Google sort).
  // Keep a ref in sync so reportGooglePrice can cheaply skip pointless state updates.
  const googleFeatureActive =
    (minGooglePrice.trim() !== "" && !Number.isNaN(parseFloat(minGooglePrice))) ||
    (maxGooglePrice.trim() !== "" && !Number.isNaN(parseFloat(maxGooglePrice))) ||
    sortKey === "google";
  googleFeatureActiveRef.current = googleFeatureActive;

  // Hydrate prices for ALL loaded flights, including rows currently hidden by a
  // range filter. Subscribe while consumed so stale/error transitions cannot leave
  // hidden rows sorting/filtering by old numbers. Batch notifications to avoid the
  // per-row render storm; the newprice tab also needs this for load-all filters.
  useEffect(() => {
    if (!googleFeatureActive && tab !== "newprice") return;
    let disposed = false;
    let queued = false;
    const hydrate = () => {
      if (disposed) return;
      const next: Record<number, number | null> = {};
      for (const f of flights) next[f.id] = resolveSavedGoogle(f);
      const update = (prev: Record<number, number | null>) =>
        Object.keys(next).every(id => prev[Number(id)] === next[Number(id)])
          ? prev : { ...prev, ...next };
      if (googleFeatureActive) setGooglePrices(update);
      if (tab === "newprice") setNewTabGoogle(update);
    };
    hydrate();
    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      if (event.query.queryKey[0] !== "google-flight-price" || queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        hydrate();
      });
    });
    return () => { disposed = true; unsubscribe(); };
  }, [googleFeatureActive, tab, flights, queryClient, bulkError]);

  // Pas krijimit: kërko në Google datat pasuese dhe krijo të njëjtin fluturim
  // aty ku gjendet (ripërdor extend-search + extend-create; template = fluturimi
  // që sapo u krijua, pra çmimet/vendet/bagazhi kopjohen prej tij).
  const repeatFlightUntil = async (values: FlightForm, repeatUntil: string, templateFlightId?: number) => {
    const DAY = 86400000;
    const startDate = new Date(new Date(values.departureDate + "T00:00:00Z").getTime() + DAY).toISOString().slice(0, 10);
    if (startDate > repeatUntil) return;
    toast({ title: "Duke kërkuar datat e tjera në Google..." });
    try {
      const sr = await fetch(`${API_BASE}/flights/extend-search`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          flightNumber: values.flightNumber, airline: values.airline,
          fromCity: values.fromCity, toCity: values.toCity,
          startDate, endDate: repeatUntil,
        }),
      });
      const sdata = await sr.json();
      if (!sr.ok) {
        toast({ title: "Përsëritja dështoi", description: sdata?.error ?? "Kërkimi në Google dështoi.", variant: "destructive" });
        return;
      }
      const items = (sdata.newFlights ?? []).map((f: any) => ({ date: f.date, flightNumber: f.flightNumber, airline: f.airline }));
      if (items.length === 0) {
        toast({ title: "S'u gjetën data të tjera", description: `Google nuk e gjeti ${values.flightNumber} në data të reja deri më ${repeatUntil}.`, variant: "destructive" });
        return;
      }
      const cr = await fetch(`${API_BASE}/flights/extend-create`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ fromCity: values.fromCity, toCity: values.toCity, items, templateFlightId }),
      });
      const cdata = await cr.json();
      if (!cr.ok) {
        toast({ title: "Përsëritja dështoi", description: cdata?.error ?? "Krijimi i datave të tjera dështoi.", variant: "destructive" });
        return;
      }
      toast({ title: "Fluturimet u përsëritën", description: `U krijuan edhe ${cdata.created} data të tjera për ${values.flightNumber}.` });
      invalidate();
    } catch {
      toast({ title: "Përsëritja dështoi", description: "Lidhja me serverin dështoi.", variant: "destructive" });
    }
  };

  const handleCreate = (values: FlightForm, repeatUntil?: string) => {
    createFlight.mutate({ data: values }, {
      onSuccess: (created: any) => {
        toast({ title: "Flight created" });
        invalidate();
        setIsAddOpen(false);
        if (repeatUntil) void repeatFlightUntil(values, repeatUntil, created?.id);
      },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleToggle = async (f: any) => {
    const open = f.status !== "open";
    if (!(await confirmDialog({
      title: open ? "Hap shitjet?" : "Mbyll shitjet?",
      text: open ? "Fluturimi do të jetë i disponueshëm për rezervim." : "Fluturimi nuk do të mund të rezervohet më.",
      confirmText: open ? "Po, hap" : "Po, mbyll",
      confirmColor: open ? "#22c55e" : "#ef4444",
    }))) return;
    toggleSales.mutate({ id: f.id, data: { open } }, {
      onSuccess: () => { toast({ title: `Sales ${open ? "opened" : "closed"}` }); invalidate(); },
    });
  };

  const handleDuplicate = async (id: number) => {
    if (!(await confirmDialog({
      title: "Dyfisho fluturimin?",
      text: "Do të krijohet një kopje e këtij fluturimi.",
      confirmText: "Po, dyfisho",
    }))) return;
    duplicate.mutate({ id }, {
      onSuccess: () => { toast({ title: "Flight duplicated" }); invalidate(); },
    });
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDangerDialog({ title: "Fshij fluturimin?", text: "Ky veprim nuk mund të kthehet." }))) return;
    deleteFlight.mutate({ id }, {
      onSuccess: () => { toast({ title: "Flight deleted" }); invalidate(); },
    });
  };

  // Njoftime "Confirm": acknowledge a flight's seat/schedule alert so it leaves
  // the Njoftime tab, WITHOUT changing the flight's sale status.
  const [confirmingAlertId, setConfirmingAlertId] = useState<number | null>(null);
  const handleConfirmAlert = async (f: any) => {
    if (!(await confirmDialog({
      title: "Konfirmo njoftimin?",
      text: "Njoftimi do të largohet nga lista. Statusi i fluturimit nuk ndryshon.",
      confirmText: "Po, konfirmo",
      confirmColor: "#22c55e",
    }))) return;
    setConfirmingAlertId(f.id);
    try {
      const resp = await fetch(`${API_BASE}/flights/${f.id}/dismiss-alert`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!resp.ok) throw new Error(await resp.text());
      toast({ title: "Njoftimi u konfirmua" });
      invalidate();
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "Nuk u konfirmua", variant: "destructive" });
    } finally {
      setConfirmingAlertId(null);
    }
  };

  // Njoftime bulk "Konfirmo": acknowledge the alerts of all selected flights at
  // once (loops the same per-flight dismiss-alert endpoint). Does NOT change any
  // flight's sale status — identical to the single-row Confirm, just batched.
  const [confirmingAlerts, setConfirmingAlerts] = useState(false);
  const handleConfirmAlertsBulk = async () => {
    if (!selectedIds.size) return;
    if (!(await confirmDialog({
      title: `Konfirmo ${selectedIds.size} njoftime?`,
      text: "Njoftimet do të largohen nga lista. Statusi i fluturimeve nuk ndryshon.",
      confirmText: "Po, konfirmo",
      confirmColor: "#22c55e",
    }))) return;
    setConfirmingAlerts(true);
    try {
      const ids = [...selectedIds];
      const results = await Promise.all(ids.map(id =>
        fetch(`${API_BASE}/flights/${id}/dismiss-alert`, { method: "PATCH", credentials: "include" })
      ));
      const failed = results.filter(r => !r.ok).length;
      if (failed > 0) {
        toast({ title: `${ids.length - failed} u konfirmuan, ${failed} dështuan`, variant: "destructive" });
      } else {
        toast({ title: `${ids.length} njoftime u konfirmuan` });
      }
      setSelectedIds(new Set());
      invalidate();
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "Nuk u konfirmuan", variant: "destructive" });
    } finally {
      setConfirmingAlerts(false);
    }
  };

  // Kopjon një tekst në clipboard (me fallback për shfletues të vjetër) dhe shfaq
  // toast-in përkatës. E ndarë që ta ripërdorin "Kopjo Listën" dhe "Kopjo për Klient".
  const copyTextToClipboard = async (text: string, successTitle: string, okDesc: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: successTitle, description: okDesc });
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      document.body.removeChild(ta);
      toast(ok
        ? { title: successTitle, description: okDesc }
        : { title: "Nuk u kopjua", description: "Provo përsëri.", variant: "destructive" });
    }
  };

  // "Kopjo Listën": build a WhatsApp-friendly, one-line-per-flight text of the
  // selected flights and copy it to the clipboard. Format: "NISJA-MBERRITJA D MUAJ ORA  ÇMIM€"
  // e.g. "PSA-TIA 2 JUL 08:00  180€". Kur ka 1–4 vende të lira, rreshti
  // mbaron me "X Vende". The price is the FLIGHT's own sale price
  // (adultPrice / kolona "One Way"), NOT the Google price.
  const handleCopyList = async () => {
    if (!selectedIds.size) return;
    const rows = filteredFlights.filter((f: any) => selectedIds.has(f.id));
    if (!rows.length) {
      toast({ title: "Asnjë fluturim i zgjedhur në këtë faqe", variant: "destructive" });
      return;
    }
    const lines = rows.map((f: any) => {
      const route = `${f.fromCity}-${f.toCity}`;
      let dateLbl = f.departureDate;
      try { dateLbl = format(parseISO(f.departureDate), "d MMM").toUpperCase(); } catch { /* keep raw */ }
      const time = fmtAmPm(f.departureTime);
      const priceVal = f.adultPrice != null ? Number(f.adultPrice) : null;
      const price = priceVal != null ? `${Math.round(priceVal)}€` : "";
      const availableSeats = f.availableSeats != null ? Number(f.availableSeats) : null;
      const seatCount = availableSeats != null && Number.isFinite(availableSeats) ? Math.round(availableSeats) : null;
      const seats = availableSeats != null && Number.isFinite(availableSeats) && availableSeats >= 0 && availableSeats < 5
        ? `  ${seatCount} ${seatCount === 1 ? "Vend" : "Vende"}`
        : "";
      return `${route} ${dateLbl} ${time}  ${price}${seats}`;
    });
    const text = lines.join("\n");
    // If "Selekto të gjitha" picked flights beyond the loaded rows, we can only copy
    // the ones currently loaded — say so instead of silently dropping them.
    const omitted = selectedIds.size - rows.length;
    const okDesc = omitted > 0
      ? `Bëje paste në WhatsApp. Shënim: ${omitted} fluturime të zgjedhura s'janë në këtë faqe dhe nuk u kopjuan.`
      : "Bëje paste në WhatsApp.";
    await copyTextToClipboard(text, `Lista u kopjua (${rows.length} fluturime)`, okDesc);
  };

  // "Kopjo për Klient": njësoj si "Kopjo Listën" por rruga shfaqet me EMRAT e
  // qyteteve të aeroporteve (jo kodet), p.sh. "DORTMUND-TIRANE 12 JUL 08:55  180€".
  const handleCopyForClient = async () => {
    if (!selectedIds.size) return;
    const rows = filteredFlights.filter((f: any) => selectedIds.has(f.id));
    if (!rows.length) {
      toast({ title: "Asnjë fluturim i zgjedhur në këtë faqe", variant: "destructive" });
      return;
    }
    const lines = rows.map((f: any) => {
      const route = `${airportCity(f.fromCity)}-${airportCity(f.toCity)}`.toUpperCase();
      let dateLbl = f.departureDate;
      try { dateLbl = format(parseISO(f.departureDate), "d MMM").toUpperCase(); } catch { /* keep raw */ }
      const time = fmtAmPm(f.departureTime);
      const priceVal = f.adultPrice != null ? Number(f.adultPrice) : null;
      const price = priceVal != null ? `${Math.round(priceVal)}€` : "";
      return `${route} ${dateLbl} ${time}  ${price}`;
    });
    const text = lines.join("\n");
    const omitted = selectedIds.size - rows.length;
    const okDesc = omitted > 0
      ? `Bëje paste në WhatsApp. Shënim: ${omitted} fluturime të zgjedhura s'janë në këtë faqe dhe nuk u kopjuan.`
      : "Bëje paste në WhatsApp.";
    await copyTextToClipboard(text, `Lista për klient u kopjua (${rows.length} fluturime)`, okDesc);
  };

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  // Progresi i kontrollit Google në sfond: {done,total} grupe rrugë+datë.
  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number } | null>(null);

  // Ndjek një punë sfondi me polling derisa running=false; kthen gjendjen finale.
  // Rifreskimet e mëdha zgjasin minuta — kërkesa HTTP vetëm e NIS punën, progresi
  // lexohet këtu çdo 2 sekonda (nuk varet nga timeout-i i proxy-t).
  const pollBackgroundJob = async (
    url: string,
    startedAt: string | null,
    onProgress: (p: { done: number; total: number }) => void,
  ): Promise<any> => {
    let failures = 0;
    for (;;) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const r = await fetch(url, { credentials: "include" });
        if (!r.ok) { if (++failures > 5) throw new Error("progress"); continue; }
        failures = 0;
        const p = await r.json();
        // Nëse startedAt s'përputhet, gjendja i përket një runi TJETËR (i mëparshëm
        // ende i pambaruar ose një i ri i nisur nga dikush tjetër) — mos e paraqit
        // si rezultatin tonë.
        if (startedAt && p.startedAt && p.startedAt !== startedAt) return null;
        onProgress({ done: p.done ?? 0, total: p.total ?? 0 });
        if (!p.running) return p;
      } catch {
        if (++failures > 5) throw new Error("progress");
      }
    }
  };

  // Google check for the selected flights: refreshes the live Google price (the
  // per-row "Google" column) and the schedule + seat-availability badges. It does
  // NOT show a table and NEVER changes sale prices — those change only via
  // "Sinkronizo Çmimet". Results surface as the refreshed Google column + badges,
  // plus a short toast summary.
  const handleGoogleCheck = async () => {
    if (!selectedIds.size) return;
    setChecking(true);
    try {
      const resp = await fetch(`${API_BASE}/flights/check-google-selected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ flightIds: [...selectedIds] }),
      });
      const data = await resp.json();
      if (!resp.ok) { toast({ title: data.error || "Gabim", variant: "destructive" }); return; }
      // Puna nisi në sfond — ndiq progresin derisa të mbarojë (grupe rrugë+datë).
      setCheckProgress({ done: 0, total: data.totalGroups ?? 0 });
      const final = await pollBackgroundJob(`${API_BASE}/flights/check-google-progress`, data.startedAt ?? null, setCheckProgress);
      // Refresh the flights list (schedule + seat badges) and the per-row Google
      // price column (its server cache was just updated by the check).
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["google-flight-price"] });
      if (!final) { toast({ title: "Kontrolli u zëvendësua nga një run tjetër", description: "Rezultatet u rifreskuan nga runi më i ri." }); return; }
      const summary = final?.summary ?? {};
      if (summary.error) { toast({ title: "Kontrolli dështoi në server", variant: "destructive" }); return; }
      const parts: string[] = [];
      if (summary.timeChanged) parts.push(`${summary.timeChanged} ndryshim orari`);
      if (summary.googlePriceChanged) parts.push(`${summary.googlePriceChanged} ndryshim çmimi Google`);
      if (summary.possibleCancellation) parts.push(`${summary.possibleCancellation} mundësi anulimi (5+ kontrolle)`);
      if (summary.notFound) parts.push(`${summary.notFound} s'gjenden`);
      if (summary.seatLow) parts.push(`${summary.seatLow} pa vende`);
      if (summary.apiErrorGroups) parts.push(`${summary.apiErrorGroups} kërkime dështuan`);
      if (summary.apiEmpty) parts.push(`${summary.apiEmpty} pa rezultat të besueshëm`);
      if (summary.saveErrors) parts.push(`${summary.saveErrors} njoftime nuk u ruajtën`);
      if (summary.skipped) parts.push(`${summary.skipped} kontrolle të anashkaluara për të ruajtur të dhënat aktuale`);
      toast({
        title: summary.apiErrorGroups || summary.saveErrors ? "Kontrolli përfundoi me gabime" : "Kontrolli përfundoi",
        variant: summary.apiErrorGroups || summary.saveErrors ? "destructive" : "default",
        description: parts.length
          ? `${summary.total ?? selectedIds.size} fluturime · ${parts.join(" · ")}`
          : `${summary.total ?? selectedIds.size} fluturime · pa ndryshime`,
      });
    } catch {
      toast({ title: "Gabim lidhje", variant: "destructive" });
    } finally {
      setChecking(false);
      setCheckProgress(null);
    }
  };

  const handleGoogleSync = async () => {
    if (!selectedIds.size) return;
    if (!(await confirmDialog({
      title: `Sinkronizo çmimet e ${selectedIds.size} fluturimeve?`,
      text: "Çmimet e shitjes do të rishkruhen sipas formulës së Google Flights (Google − zbritja). Ky veprim ndryshon vetëm fluturimet e zgjedhura.",
      confirmText: "Po, sinkronizo",
      cancelText: "Anulo",
    }))) return;
    setSyncing(true);
    try {
      const resp = await fetch(`${API_BASE}/flights/sync-google-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ flightIds: [...selectedIds] }),
      });
      const data = await resp.json();
      if (!resp.ok) { toast({ title: data.error || "Gabim", variant: "destructive" }); return; }
      toast({ title: `✅ ${data.updated} çmime u përditësuan${data.notFound ? `, ${data.notFound} pa rezultat (Google)` : ""}` });
      setSelectedIds(new Set());
      invalidate();
    } catch {
      toast({ title: "Gabim lidhje", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };
  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (!(await confirmDangerDialog({ title: `Fshij ${count} fluturime?`, text: "Ky veprim nuk mund të kthehet." }))) return;
    setBulkDeleting(true);
    try {
      const resp = await fetch(`${API_BASE}/flights`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast({ title: err.error || "Gabim gjatë fshirjes", variant: "destructive" });
        return;
      }
      const data = await resp.json().catch(() => ({ deleted: count, blocked: [] }));
      const blocked: Array<{ id: number; label: string; reason: string }> = data.blocked || [];
      if (blocked.length > 0) {
        toast({
          title: `U fshinë ${data.deleted} nga ${count} — ${blocked.length} nuk u fshinë dot`,
          description: (
            <div className="mt-1 space-y-0.5 text-xs">
              {blocked.slice(0, 8).map(b => (
                <div key={b.id}>{b.label} — {b.reason}</div>
              ))}
              {blocked.length > 8 && <div>… dhe {blocked.length - 8} të tjera</div>}
              <div className="pt-1 font-medium">Fluturimet me të dhëna të lidhura (rezervime, edhe të anuluara, ose taska) nuk fshihen dot.</div>
            </div>
          ),
          variant: "destructive",
          duration: 15000,
        });
        setSelectedIds(new Set(blocked.map(b => b.id)));
      } else {
        toast({ title: `✅ ${data.deleted} fluturime u fshinë` });
        setSelectedIds(new Set());
      }
      invalidate();
    } catch {
      toast({ title: "Gabim lidhje", variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const [generatingReport, setGeneratingReport] = useState(false);
  const handleGenerateReport = async () => {
    if (!selectedIds.size) return;
    const pdfVisibleColumns = Object.fromEntries(
      COLUMN_DEFS.map(column => [
        column.key,
        column.key !== "groups" && visibleCols[column.key] && (!column.adminOnly || isAdmin),
      ]),
    ) as FlightVisibleColumns;
    if (!Object.values(pdfVisibleColumns).some(Boolean)) {
      toast({
        title: "Zgjidh të paktën një kolonë",
        description: "PDF-i pasqyron kolonat që ke aktive te menuja “Kolonat”.",
        variant: "destructive",
      });
      return;
    }
    setGeneratingReport(true);
    try {
      // Preserve current UI sort order: filter paginatedFlights by selectedIds
      const orderedIds = paginatedFlights
        .filter((f: any) => selectedIds.has(f.id))
        .map((f: any) => f.id);
      const resp = await fetch(`${API_BASE}/flights/report-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: orderedIds }),
      });
      if (!resp.ok) { toast({ title: "Gabim gjatë gjenerimit të raportit", variant: "destructive" }); return; }
      const rawFlights = await resp.json();
      // Re-sort response to match the sent ID order (DB may return in any order)
      const idxMap = new Map(orderedIds.map((id: number, i: number) => [id, i]));
      const flights = [...rawFlights].sort((a: any, b: any) =>
        (idxMap.get(a.id) ?? 999) - (idxMap.get(b.id) ?? 999)
      );
      const doc = generateFlightReportPdf(flights, { visibleColumns: pdfVisibleColumns });
      const date = new Date().toISOString().slice(0, 10);
      doc.save(`raport-fluturimesh-${date}.pdf`);
    } catch {
      toast({ title: "Gabim lidhje", variant: "destructive" });
    } finally {
      setGeneratingReport(false);
    }
  };

  const clearFilters = () => {
    setFromCities([]); setToCities([]); setAirlineFlightNo("");
    setStartDate(""); setEndDate(""); setStatusFilter("all"); setAlertFilter("all"); setExternalFilter("all"); setBeFilter("all");
    setSeatBooking(""); setSelectedDays([]);
    setPaxAdults(0); setPaxChildren(0); setPaxInfants(0);
    setMinPrice(""); setMaxPrice(""); setMinGooglePrice(""); setMaxGooglePrice("");
    setMinDiff(""); setMaxDiff("");
    setSelectedGroupId("");
    setPage(1);
  };

  // Server handles sort+pagination; client only does day-of-week + pax filter on current page.
  // Google-price sorting is client-side (prices are fetched per row), so it reorders the current page only.
  const paginatedFlights = useMemo(() => {
    const needsClientSort = sortKey === "google" || sortKey === "newprice" || sortKey === "diff";
    let ordered: any[] = filteredFlights;
    if (needsClientSort) {
      const dir = sortDir === "asc" ? 1 : -1;
      // Value each client-sorted column compares by. Both Google saved columns use
      // the verified query snapshot (state maps trigger recomputation). "newprice" =
      // candidate, "diff" = candidate − displayed Google (same as the row's Diferenca).
      const valueFor = (f: any): number | null => {
        if (sortKey === "google") {
          return resolveSavedGoogle(f);
        }
        const np = resolveNewPrice(f);
        if (sortKey === "newprice") return np.candidate;
        const savedGoogle = np.saved;
        return np.candidate != null && savedGoogle != null ? np.candidate - savedGoogle : null;
      };
      ordered = [...filteredFlights].sort((a: any, b: any) => {
        const pa = valueFor(a);
        const pb = valueFor(b);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;   // rows without a value always go last
        if (pb == null) return -1;
        return (pa - pb) * dir;
      });
    }
    // When a "Çmim i Ri" range filter is active the server returned the WHOLE matching
    // set, so paginate the filtered result on the client — this keeps rendering bounded
    // to one page even when hundreds match. Clamp the page so an out-of-range page never
    // blanks out the table.
    if (newTabRangeActive) {
      const pages = Math.max(1, Math.ceil(ordered.length / perPage));
      const p = Math.min(page, pages);
      const start = (p - 1) * perPage;
      return ordered.slice(start, start + perPage);
    }
    return ordered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredFlights, sortKey, sortDir, googlePrices, newTabGoogle, newPricesMap, tab, newTabRangeActive, page, perPage, bulkError]);

  // Pagination footer counts: with a client-side range filter the meaningful total is
  // the filtered length (server "total" is the whole matching set we loaded to filter).
  const displayTotal = newTabRangeActive ? filteredFlights.length : total;
  const displayTotalPages = newTabRangeActive
    ? Math.max(1, Math.ceil(filteredFlights.length / perPage))
    : totalPages;

  // Bulk actions
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedFlights.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedFlights.map((f: any) => f.id)));
  };

  // How many flights "Updato Çmimet" will affect: the selected rows that have a
  // candidate, or — when nothing is selected — every visible flight with a "Çmim i
  // Ri". Drives the button count + enabled state so "S'ka" rows are excluded.
  const newPriceApplyCount = useMemo(() => {
    if (tab !== "newprice") return 0;
    const candidateSet = new Set(
      paginatedFlights.filter(hasNewPrice).map((f: any) => f.id as number),
    );
    return selectedIds.size > 0
      ? [...selectedIds].filter(id => candidateSet.has(id)).length
      : candidateSet.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, paginatedFlights, newPricesMap, selectedIds]);

  const handleSelectAllFlights = async () => {
    // With a client-side "Çmim i Ri" range filter active, /flights/ids (server) doesn't
    // know about it, so select the full client-filtered set we already hold instead.
    if (newTabRangeActive) {
      setSelectedIds(new Set(filteredFlights.map((f: any) => f.id)));
      return;
    }
    setSelectingAll(true);
    try {
      const params = new URLSearchParams();
      if (fromCities.length > 0) params.set("fromCity", fromCities.join(","));
      if (toCities.length > 0)  params.set("toCity",   toCities.join(","));
      if (isAdmin && selectedGroupId) params.set("agencyGroupId", selectedGroupId);
      if (isAdmin && tab === "nogroup") params.set("noGroup", "true");
      if (airlineFlightNo) params.set("search", airlineFlightNo);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (effectiveStatus) params.set("status", effectiveStatus);
      params.set("timeframe", timeframe);
      if (seatBooking) params.set("seatBooking", seatBooking);
      if (paxAdults + paxChildren > 0) params.set("exactSeats", String(paxAdults + paxChildren));
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (effectiveAlert === "any") params.set("anyAlert", "true");
      else if (effectiveAlert !== "all") params.set("scheduleAlert", effectiveAlert);
      if (tab === "alerts") params.set("anyAlert", "true");
      if (duplicatesOnly) params.set("duplicates", "true");
      if (confirmedOnly) params.set("confirmed", "true");
      if (bookedOnly) params.set("bookedConfirmed", "true");
      if (noPriceOnly) params.set("noGooglePrice", "true");
      if (staleOnly) params.set("staleGooglePrice", "true");
      if (excludedOnly) params.set("excludedFromGoogle", "true");
      if (suspiciousOnly) params.set("suspicious", "true");
      if (noRuleOnly) params.set("noGoogleRule", "true");
      if (scheduleErrorOnly) params.set("scheduleError", "true");
      if (tab === "newprice") params.set("googleMonitoringOnly", "true");
      if (externalFilter === "blocked") params.set("externalBlocked", "true");
      else if (externalFilter === "open") params.set("externalBlocked", "false");
      if (beFilter === "hidden") params.set("beVisible", "false");
      else if (beFilter === "visible") params.set("beVisible", "true");
      const resp = await fetch(`${API_BASE}/flights/ids?${params.toString()}`, { credentials: "include" });
      if (!resp.ok) throw new Error();
      const ids: number[] = await resp.json();
      setSelectedIds(new Set(ids));
    } catch {
      toast({ title: "Gabim duke zgjedhur të gjitha", variant: "destructive" });
    } finally {
      setSelectingAll(false);
    }
  };

  const handleBulkSeats = async () => {
    const seats = parseInt(bulkSeatsValue);
    if (isNaN(seats) || seats < 0) return;
    setBulkSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/flights/bulk-seats`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [...selectedIds], availableSeats: seats }),
      });
      const data = await resp.json();
      if (!resp.ok) { toast({ title: data.error || "Gabim", variant: "destructive" }); return; }
      toast({ title: `Vendet u ndryshua për ${data.updated} fluturime` });
      setBulkSeatsOpen(false);
      setBulkSeatsValue("");
      setSelectedIds(new Set());
      invalidate();
    } catch {
      toast({ title: "Gabim lidhje", variant: "destructive" });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkPrice = async () => {
    const body: Record<string, any> = { ids: [...selectedIds] };
    const addIfValid = (key: string, raw: string, round = false) => {
      if (raw === "") return;
      const n = parseFloat(raw);
      if (!isNaN(n) && n >= 0) body[key] = round ? Math.round(n) : n;
    };
    addIfValid("adultPrice", bulkPriceValue, true);
    addIfValid("childPrice", bulkChildPriceValue, true);
    addIfValid("infantPrice", bulkInfantPriceValue, true);
    addIfValid("checkedBaggagePrice", bulkBagPriceValue, true);
    addIfValid("checkedBaggageKg", bulkBagKgValue);

    const fieldKeys = Object.keys(body).filter(k => k !== "ids");
    if (fieldKeys.length === 0) {
      toast({ title: "Plotëso të paktën një çmim ose kg bagazhi", variant: "destructive" });
      return;
    }

    setBulkSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/flights/bulk-price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Server error");
      toast({ title: `Çmimet u ndryshuan për ${selectedIds.size} fluturime` });
      invalidate();
      setBulkPriceOpen(false);
      setBulkPriceValue("");
      setBulkChildPriceValue("");
      setBulkInfantPriceValue("");
      setBulkBagPriceValue("");
      setBulkBagKgValue("");
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: err?.message || "Gabim gjatë ndryshimit", variant: "destructive" });
    } finally { setBulkSaving(false); }
  };

  const handleBulkStatus = async () => {
    setBulkSaving(true);
    try {
      await Promise.all([...selectedIds].map(id =>
        fetch(`${API_BASE}/flights/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: bulkStatusValue }),
        })
      ));
      toast({ title: `Statusi u ndryshua për ${selectedIds.size} fluturime` });
      invalidate();
      setBulkStatusOpen(false);
      setSelectedIds(new Set());
    } catch {
      toast({ title: "Gabim gjatë ndryshimit", variant: "destructive" });
    } finally { setBulkSaving(false); }
  };

  // Bulk block/unblock EXTERNAL sales (booking-engine, partner API, CitizenPlane).
  const handleBulkExternalBlock = async (blocked: boolean) => {
    if (!selectedIds.size) return;
    const ok = await confirmDialog({
      title: blocked
        ? `Blloko shitjet e jashtme për ${selectedIds.size} fluturime?`
        : `Hap shitjet e jashtme për ${selectedIds.size} fluturime?`,
      text: blocked
        ? "Fluturimet do shfaqen TË MBYLLUR / pa vende në faqen publike, API-në e partnerëve dhe kanalet e jashtme. Rezervimet nga sistemi i brendshëm vazhdojnë normalisht."
        : "Fluturimet do rihapen për shitje në faqen publike, API-në e partnerëve dhe kanalet e jashtme.",
      confirmText: blocked ? "Blloko" : "Hap",
    });
    if (!ok) return;
    setBulkSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/flights/bulk-external-block`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [...selectedIds], blocked }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error || "Gabim");
      const data = await resp.json();
      toast({ title: blocked ? `U bllokuan shitjet e jashtme (${data.updated} fluturime)` : `U hapën shitjet e jashtme (${data.updated} fluturime)` });
      invalidate();
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: err?.message || "Gabim gjatë ndryshimit", variant: "destructive" });
    } finally { setBulkSaving(false); }
  };

  // Bulk fshih/shfaq në Booking Engine (dukshmëria publike) — vetëm admin.
  const handleBulkBeVisibility = async (show: boolean) => {
    if (!selectedIds.size) return;
    const ok = await confirmDialog({
      title: show
        ? `Shfaq në Booking Engine ${selectedIds.size} fluturime?`
        : `Fshih nga Booking Engine ${selectedIds.size} fluturime?`,
      text: show
        ? "Fluturimet do bëhen sërish të dukshme për të gjithë në faqen publike të Booking Engine."
        : "Fluturimet fshihen nga faqja publike e Booking Engine — i shohin vetëm agjentët me akses te fluturimet e fshehura. Në FMS mbeten normale.",
      confirmText: show ? "Shfaq" : "Fshih",
    });
    if (!ok) return;
    setBulkSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/flights/bulk-be-visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [...selectedIds], show }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error || "Gabim");
      const data = await resp.json();
      toast({ title: show ? `U shfaqën në Booking Engine (${data.updated} fluturime)` : `U fshehën nga Booking Engine (${data.updated} fluturime)` });
      invalidate();
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: err?.message || "Gabim gjatë ndryshimit", variant: "destructive" });
    } finally { setBulkSaving(false); }
  };

  const hasActiveFilters = !!selectedGroupId || fromCities.length > 0 || toCities.length > 0 || airlineFlightNo || startDate || endDate ||
    statusFilter !== "all" || alertFilter !== "all" || externalFilter !== "all" || beFilter !== "all" || !!seatBooking || selectedDays.length > 0 ||
    paxAdults > 0 || paxChildren > 0 || paxInfants > 0 ||
    !!minPrice || !!maxPrice || !!minGooglePrice || !!maxGooglePrice;

  const toggleDay = (d: string) =>
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  return (
    <div className="flex gap-0 min-h-0 h-full">
      <div className="flex-1 min-w-0 space-y-0">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Flight Inventory</h1>
          <p className="text-muted-foreground text-xs md:text-sm hidden sm:block">Manage schedules, pricing, and availability</p>
        </div>
        <div className="flex gap-1.5 md:gap-2 shrink-0">
          {user?.role === "admin" && (
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 md:mr-1.5" /><span className="hidden md:inline">Import</span>
          </Button>
          )}
          <Button size="sm" onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 md:mr-1.5" /><span className="hidden md:inline">New Flight</span>
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="page-filter-panel bg-card border rounded-xl p-3 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          {/* Origin — multi-select with search */}
          <MultiCitySelect
            options={filteredFromCodes}
            onOpen={() => { void routesQuery.refetch(); }}
            loading={routesQuery.isFetching}
            error={routesQuery.isError}
            value={fromCities}
            onChange={setFromCities}
            placeholder="Nisja (të gjitha)"
            icon={<PlaneTakeoff className="h-3.5 w-3.5" />}
          />
          {/* Destination — multi-select with search */}
          <MultiCitySelect
            options={filteredToCodes}
            onOpen={() => { void routesQuery.refetch(); }}
            loading={routesQuery.isFetching}
            error={routesQuery.isError}
            value={toCities}
            onChange={setToCities}
            placeholder="Mberritja (të gjitha)"
            icon={<PlaneLanding className="h-3.5 w-3.5" />}
          />
          {isAdmin && (
            <div className="flex flex-col">
              <select
                aria-label="Filtro sipas grupit"
                className="h-9 min-w-[150px] rounded-lg border bg-background px-3 text-sm"
                value={selectedGroupId}
                disabled={flightGroups.isPending || !!flightGroups.error}
                onChange={e => setSelectedGroupId(e.target.value)}
              >
                <option value="">{flightGroups.isPending ? "Po ngarkohen grupet..." : "Të gjitha grupet"}</option>
                <option value="none">Pa grup</option>
                {flightGroups.data?.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              {flightGroups.error && <span role="alert" className="text-xs text-red-600">Grupet nuk u ngarkuan.</span>}
            </div>
          )}
          {/* Airline & Flight No */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm min-w-[170px]">
            <PlaneTakeoff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              placeholder="Airline & Flight No."
              value={airlineFlightNo}
              onChange={e => setAirlineFlightNo(e.target.value)}
              className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground"
            />
          </div>
          {/* Start Date */}
          <DatePicker
            value={startDate}
            placeholder="Data nisjes…"
            onChange={v => { setStartDate(v); if (endDate && v > endDate) setEndDate(v); }}
            className="w-40"
          />
          {/* End Date */}
          <DatePicker
            value={endDate}
            placeholder="Data mbarimit…"
            min={startDate || undefined}
            onChange={v => setEndDate(v)}
            className="w-40"
          />
          {/* Flight price range (server-side: adultPrice) */}
          <div className="flex items-center gap-1 border rounded-lg px-2.5 py-1.5 bg-background text-sm">
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="number" min={0} inputMode="numeric" placeholder="Çmim min"
              value={minPrice}
              onChange={e => setMinPrice(e.target.value)}
              className="bg-transparent outline-none w-[78px] text-sm placeholder:text-muted-foreground"
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="number" min={0} inputMode="numeric" placeholder="Çmim max"
              value={maxPrice}
              onChange={e => setMaxPrice(e.target.value)}
              className="bg-transparent outline-none w-[80px] text-sm placeholder:text-muted-foreground"
            />
          </div>
          {/* Google Flights price range (client-side: per-row prices) */}
          <div className="flex items-center gap-1 border rounded-lg px-2.5 py-1.5 bg-background text-sm">
            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="number" min={0} inputMode="numeric" placeholder="Google min"
              value={minGooglePrice}
              onChange={e => setMinGooglePrice(e.target.value)}
              className="bg-transparent outline-none w-[82px] text-sm placeholder:text-muted-foreground"
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="number" min={0} inputMode="numeric" placeholder="Google max"
              value={maxGooglePrice}
              onChange={e => setMaxGooglePrice(e.target.value)}
              className="bg-transparent outline-none w-[84px] text-sm placeholder:text-muted-foreground"
            />
          </div>
          {/* Diferenca range — only on the "Çmim i Ri" tab (client-side; negatives allowed) */}
          {tab === "newprice" && (
            <div className="flex items-center gap-1 border rounded-lg px-2.5 py-1.5 bg-background text-sm">
              <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="number" inputMode="numeric" placeholder="Dif. min"
                value={minDiff}
                onChange={e => setMinDiff(e.target.value)}
                className="bg-transparent outline-none w-[72px] text-sm placeholder:text-muted-foreground"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="number" inputMode="numeric" placeholder="Dif. max"
                value={maxDiff}
                onChange={e => setMaxDiff(e.target.value)}
                className="bg-transparent outline-none w-[74px] text-sm placeholder:text-muted-foreground"
              />
            </div>
          )}
          {/* Status */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-transparent outline-none text-sm text-muted-foreground"
            >
              <option value="all">Status</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="soldout">Sold Out</option>
            </select>
          </div>
          {/* External sales filter */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <span className="text-muted-foreground shrink-0 text-xs">🔒</span>
            <select
              value={externalFilter}
              onChange={e => setExternalFilter(e.target.value as "all" | "open" | "blocked")}
              className="bg-transparent outline-none text-sm text-muted-foreground"
            >
              <option value="all">Shitjet e jashtme</option>
              <option value="open">Hapura jashtë</option>
              <option value="blocked">Bllokuara jashtë</option>
            </select>
          </div>
          {/* Booking Engine visibility filter */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <span className="text-muted-foreground shrink-0 text-xs">👁</span>
            <select
              value={beFilter}
              onChange={e => setBeFilter(e.target.value as "all" | "visible" | "hidden")}
              className="bg-transparent outline-none text-sm text-muted-foreground"
            >
              <option value="all">Booking Engine</option>
              <option value="visible">Të pafshehura</option>
              <option value="hidden">Të fshehura</option>
            </select>
          </div>
          {/* Schedule alert filter */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={alertFilter}
              onChange={e => setAlertFilter(e.target.value)}
              className="bg-transparent outline-none text-sm text-muted-foreground"
            >
              <option value="all">Njoftime</option>
              <option value="any">Me njoftim</option>
              <option value="changed">Orari ndryshoi</option>
              <option value="cancelled">Mundësi anulimi</option>
              <option value="seats">Pak vende</option>
              <option value="none">Pa njoftim</option>
            </select>
          </div>
          {/* Sort by alert chip */}
          <button
            onClick={() => handleSort("alert")}
            title="Rendit fluturimet sipas njoftimeve (anulime & ndryshime në krye)"
            className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-sm transition-colors ${
              sortKey === "alert" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Rendit sipas njoftimit
            {sortKey === "alert" && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
          </button>
          {/* Column selector */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                title="Zgjidh kolonat që shfaqen në tabelë"
                className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-sm transition-colors bg-background text-muted-foreground hover:text-foreground"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Kolonat
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2" align="end">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Shfaq kolonat</div>
              <div className="border-b pb-2 mb-1 space-y-1">
                <p className="px-2 text-[11px] text-muted-foreground">Tërhiq ⠿ për renditjen; skajin për gjerësinë. Dyklik për përshtatje.</p>
                <button className="w-full text-left px-2 py-1 text-xs hover:bg-accent rounded" onClick={() => {
                  try {
                    localStorage.setItem(flightLayoutKey, JSON.stringify({ layout: flightLayout, visible: visibleCols }));
                    toast({ title: "Parazgjedhja u ruajt", description: "Për këtë llogari në këtë shfletues." });
                  } catch { toast({ title: "Ruajtja dështoi", variant: "destructive" }); }
                }}>Ruaj si parazgjedhje</button>
                <button className="w-full text-left px-2 py-1 text-xs hover:bg-accent rounded" onClick={() => {
                  try {
                    const saved = JSON.parse(localStorage.getItem(flightLayoutKey) || "null");
                    setFlightLayout(saved?.layout || initialFlightLayout);
                    if (saved?.visible) setVisibleCols(prev => ({ ...prev, ...saved.visible }));
                  } catch { toast({ title: "Leximi dështoi", variant: "destructive" }); }
                }}>Rikthe parazgjedhjen e ruajtur</button>
                <button className="w-full text-left px-2 py-1 text-xs hover:bg-accent rounded" onClick={() => setFlightLayout(initialFlightLayout)}>Rikthe përmasat fillestare</button>
              </div>
              <div className="flex flex-col">
                {selectableColumnDefs.map(col => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={visibleCols[col.key]}
                      onCheckedChange={() => toggleCol(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {/* Seats & Bookings filter (3 modes) */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                title="Filtro fluturimet sipas vendeve & rezervimeve"
                className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  seatBooking ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                {seatBooking === "with" ? "Me rezervim" : seatBooking === "without" ? "Pa rezervim" : seatBooking === "noseat" ? "Pa vende" : seatBooking === "withseat" ? "Me vende" : "Seats & Bookings"}
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1.5" align="start">
              {([
                { val: "with", label: "Fluturime me rezervim", icon: Users },
                { val: "without", label: "Fluturime pa rezervim", icon: Users },
                { val: "noseat", label: "Fluturime pa vende", icon: Ban },
                { val: "withseat", label: "Fluturime me vende", icon: Armchair },
              ] as const).map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setSeatBooking(prev => prev === opt.val ? "" : opt.val)}
                  className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                    seatBooking === opt.val ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  {opt.label}
                  {seatBooking === opt.val && <Check className="h-3.5 w-3.5 ml-auto" />}
                </button>
              ))}
              {seatBooking && (
                <button
                  onClick={() => setSeatBooking("")}
                  className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent mt-0.5 border-t pt-2"
                >
                  <X className="h-3.5 w-3.5" /> Hiq filtrin
                </button>
              )}
            </PopoverContent>
          </Popover>
          {/* Passenger count filter */}
          <PassengerSelector
            adults={paxAdults} children={paxChildren} infants={paxInfants}
            onChange={(a, c, i) => { setPaxAdults(a); setPaxChildren(c); setPaxInfants(i); }}
          />
          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground ml-auto">
              <span className="text-xs">↺</span> Clear filters
            </button>
          )}
        </div>
        {/* Days of week */}
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground mr-1">Days:</span>
          {DAYS.map(d => (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                selectedDays.includes(d)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-0 border-b mt-4">
        {/* Skeda "booked" (Të Konfirmuara) nuk shfaqet më në faqen kryesore — hapet vetëm
            nga linku i menusë "Fluturime të Konfirmuara" (/flights?tab=booked). */}
        {visibleTabs.map(t => (
          <button
            key={t}
            data-testid={`tab-flights-${t}`}
            style={t === "nogroup" || t === "scheduleerror" ? { color: "#dc2626", borderBottomColor: tab === t ? "#dc2626" : "transparent" } : undefined}
            onClick={() => {
              setTab(t);
              setPage(1);
              // Ruaj skedën në URL (?tab=...) që rifreskimi/linku të hapë të njëjtën listë.
              try {
                const sp = new URLSearchParams(window.location.search);
                if (t === "bookable") sp.delete("tab"); else sp.set("tab", t);
                const qs = sp.toString();
                window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : ""));
              } catch { /* ignore */ }
              // "newprice"/"diff" are sort columns that exist ONLY on the "Çmim i Ri"
              // tab. Leaving the tab while sorted by one would silently reorder the
              // other list by a hidden column (no active header indicator), so reset
              // to the shared default. Batched with setTab → no flash, indicator and
              // ordering stay in sync.
              if (t !== "newprice" && (sortKey === "newprice" || sortKey === "diff")) {
                setSortKey("date");
                setSortDir("asc");
              }
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize inline-flex items-center gap-1.5 ${
              tab === t
                ? t === "alerts" ? "border-red-500 text-red-600" : t === "soon" ? "border-amber-500 text-amber-600" : t === "duplicates" ? "border-rose-500 text-rose-600" : t === "booked" ? "border-emerald-500 text-emerald-600" : t === "noprice" ? "border-slate-500 text-slate-600" : t === "newprice" ? "border-blue-500 text-blue-600" : t === "stale" ? "border-amber-500 text-amber-600" : t === "excluded" ? "border-orange-500 text-orange-600" : t === "suspicious" ? "border-red-500 text-red-600" : "border-primary text-primary"
                : t === "alerts" && counts.alerts > 0
                  ? "border-transparent text-red-600/80 hover:text-red-600"
                  : t === "soon"
                    ? "border-transparent text-amber-600/80 hover:text-amber-600"
                    : t === "duplicates"
                        ? "border-transparent text-rose-600/80 hover:text-rose-600"
                        : t === "booked"
                          ? "border-transparent text-emerald-600/80 hover:text-emerald-600"
                          : t === "noprice"
                            ? "border-transparent text-slate-600/80 hover:text-slate-600"
                            : t === "newprice"
                            ? "border-transparent text-blue-600/80 hover:text-blue-600"
                            : t === "stale"
                              ? "border-transparent text-amber-600/80 hover:text-amber-600"
                              : t === "suspicious" && counts.suspicious > 0
                                ? "border-transparent text-red-600/80 hover:text-red-600"
                              : t === "excluded"
                                ? "border-transparent text-orange-600/80 hover:text-orange-600"
                                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "nogroup" && <><AlertTriangle className="h-3.5 w-3.5" />Pa grup</>}
            {t === "scheduleerror" && <><AlertTriangle className="h-3.5 w-3.5" />Të dyshuara për gabim orari</>}
            {t === "alerts" && <AlertTriangle className="h-3.5 w-3.5" />}
            {t === "soon" && <Clock className="h-3.5 w-3.5" />}
            {t === "duplicates" && <Copy className="h-3.5 w-3.5" />}
            {t === "booked" && <Check className="h-3.5 w-3.5" />}
            {t === "noprice" && <Globe className="h-3.5 w-3.5" />}
            {t === "newprice" && <Tag className="h-3.5 w-3.5" />}
            {t === "stale" && <Clock className="h-3.5 w-3.5" />}
            {t === "excluded" && <Ban className="h-3.5 w-3.5" />}
            {t === "suspicious" && <AlertTriangle className="h-3.5 w-3.5" />}
            {t === "nogroup" || t === "scheduleerror" ? null : t === "bookable" ? "Bookable" : t === "pending" ? "Pending" : t === "soldout" ? "Sold out" : t === "past" ? "Past Flights" : t === "soon" ? `Të Aferta (${soonDays}d)` : t === "alerts" ? "Njoftime" : t === "duplicates" ? "Dublikate" : t === "booked" ? "Të Konfirmuara" : t === "noprice" ? "Pa Çmim" : t === "newprice" ? "Çmim i Ri" : t === "stale" ? "Çmim i Vjetër" : t === "excluded" ? "Përjashtuar Online" : t === "suspicious" ? "Fluturime të dyshimta" : t === "norule" ? "Pa Rregull Google" : "All"}
            <span style={t === "nogroup" || t === "scheduleerror" ? { backgroundColor: "#fee2e2", color: "#b91c1c" } : undefined} className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full ${
              t === "alerts" && counts.alerts > 0 ? "bg-red-100 text-red-700" : t === "soon" ? "bg-amber-100 text-amber-700" : t === "duplicates" ? "bg-rose-100 text-rose-700" : t === "booked" ? "bg-emerald-100 text-emerald-700" : t === "noprice" ? "bg-slate-200 text-slate-700" : t === "newprice" ? "bg-blue-100 text-blue-700" : t === "stale" ? "bg-amber-100 text-amber-700" : t === "excluded" ? "bg-orange-100 text-orange-700" : t === "suspicious" ? (counts.suspicious > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground") : "bg-muted text-muted-foreground"
            }`}>
              {counts[t]}
            </span>
          </button>
        ))}
        {seatBooking && (
          <div className="ml-3 flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full border border-blue-200">
            {seatBooking === "with" ? "me rezervim" : seatBooking === "without" ? "pa rezervim" : seatBooking === "noseat" ? "pa vende" : "me vende"}
            <button onClick={() => setSeatBooking("")}><X className="h-3 w-3" /></button>
          </div>
        )}
      </div>

      {/* Bulk action toolbar */}
      {tab !== "newprice" && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mt-2 flex-wrap">
          {/* Left: count + select-all */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">{selectedIds.size} zgjedhur</span>
            {selectedIds.size < total && (
              <button
                onClick={handleSelectAllFlights}
                disabled={selectingAll}
                className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors flex items-center gap-1"
              >
                {selectingAll
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Duke zgjedhur...</>
                  : `Selekto të gjitha ${total.toLocaleString()}`}
              </button>
            )}
          </div>
          <div className="flex-1" />
          {/* Right: actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {tab === "alerts" && (
              <Button size="sm" className="h-7 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={handleConfirmAlertsBulk} disabled={confirmingAlerts}>
                {confirmingAlerts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Konfirmo Njoftimet
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-green-700 border-green-300 hover:bg-green-50" onClick={handleCopyList}>
              <Copy className="h-3.5 w-3.5" /> Kopjo Listën
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={handleCopyForClient}>
              <Copy className="h-3.5 w-3.5" /> Kopjo për Klient
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setBulkPriceOpen(true)}>
              <Tag className="h-3.5 w-3.5" /> Ndrysho Çmimin
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setBulkStatusOpen(true)}>
              <ToggleLeft className="h-3.5 w-3.5" /> Ndrysho Statusin
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => { setBulkSeatsValue(""); setBulkSeatsOpen(true); }}>
              <Users className="h-3.5 w-3.5" /> Ndrysho Vendet
            </Button>
            {isAdminOrManager && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-orange-700 border-orange-300 hover:bg-orange-50" onClick={() => handleBulkExternalBlock(true)} disabled={bulkSaving}>
                  🔒 Blloko Jashtë
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-teal-700 border-teal-300 hover:bg-teal-50" onClick={() => handleBulkExternalBlock(false)} disabled={bulkSaving}>
                  🔓 Hap Jashtë
                </Button>
              </>
            )}
            {isAdmin && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-gray-700 border-gray-400 hover:bg-gray-100" onClick={() => handleBulkBeVisibility(false)} disabled={bulkSaving}>
                  🙈 Fshih nga B.E.
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-sky-700 border-sky-300 hover:bg-sky-50" onClick={() => handleBulkBeVisibility(true)} disabled={bulkSaving}>
                  👁 Shfaq në B.E.
                </Button>
              </>
            )}
            {hasPermission("can_use_google_price_tools") && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50" onClick={handleGoogleSync} disabled={syncing || checking}>
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sinkronizo Çmimet
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50" onClick={handleGoogleCheck} disabled={checking || syncing}>
                  {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {checking && checkProgress && checkProgress.total > 0
                    ? `Duke kontrolluar ${checkProgress.done}/${checkProgress.total}...`
                    : "Kontrollo Çmime + Orare"}
                </Button>
              </>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-violet-600 border-violet-300 hover:bg-violet-50" onClick={handleGenerateReport} disabled={generatingReport}>
                {generatingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Gjenero Raport
              </Button>
            )}
            {hasPermission("can_delete_flights") && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive hover:text-white" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Fshij
              </Button>
            )}
            <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:text-foreground ml-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {tab === "suspicious" && (
        <div data-testid="banner-suspicious-flights" className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div className="space-y-0.5">
            <p className="font-semibold" data-testid="text-suspicious-count">Fluturime të dyshimta · {counts.suspicious.toLocaleString()} fluturime të ardhshme</p>
            <p>Këtu shfaqen fluturimet që Google nuk i gjeti në kontrollin e orarit, ose ku vetë kontrolli dështoi. Një kontroll i dështuar ose mungesa në Google <span className="font-semibold">nuk do të thotë anulim</span>. Rikontrolli bëhet automatikisht çdo 5 minuta; statusi, çmimet dhe vendet nuk ndryshohen. Verifiko te kompania ajrore para çdo veprimi.</p>
          </div>
        </div>
      )}

      {/* "Çmim i Ri" header strip */}
      {tab === "newprice" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-blue-50/60 border border-blue-200 rounded-lg px-3 py-2 mt-2">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <Globe className="h-4 w-4" />
            <span>
              Kontroll automatik:{" "}
              {newPriceCfgQuery.data
                ? newPriceCfgQuery.data.enabled
                  ? `${newPriceCfgQuery.data.intervalMinutes} min pas përfundimit të ciklit`
                  : "i çaktivizuar"
                : "…"}
              {newPriceCfgQuery.data?.lastRunAt && (
                <span className="text-blue-600/70"> · cikli i fundit përfundoi {fmtAgo(newPriceCfgQuery.data.lastRunAt)}</span>
              )}
              {newPriceCfgQuery.data?.automaticProgress?.running && (
                <span role="status" className="block font-medium mt-1">
                  {newPriceCfgQuery.data.automaticProgress.phase === "waiting"
                    ? "Në pritje në radhën e kontrolleve"
                    : "Duke kontrolluar në Google"}
                  {newPriceCfgQuery.data.automaticProgress.total > 0 &&
                    ` · ${newPriceCfgQuery.data.automaticProgress.done}/${newPriceCfgQuery.data.automaticProgress.total} grupe rrugë + datë`}
                  {newPriceCfgQuery.data.automaticProgress.startedAt &&
                    ` · nisur ${fmtAgo(newPriceCfgQuery.data.automaticProgress.startedAt)}`}
                </span>
              )}
              {!newPriceCfgQuery.data?.automaticProgress?.running &&
                newPriceCfgQuery.data?.automaticProgress?.phase === "failed" && (
                <span role="status" className="block text-amber-700 mt-1">Cikli i fundit nuk përfundoi me sukses; sistemi do të riprovojë.</span>
              )}
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={refreshingNew}>
                  {refreshingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {refreshingNew && newPriceProgress && newPriceProgress.total > 0
                    ? `${newPriceProgress.done}/${newPriceProgress.total}...`
                    : "Rifresko"}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleNewPriceRefresh}>
                  <RefreshCw className="h-3.5 w-3.5 mr-2" /> Të gjitha
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleNewPriceRefreshSelected} disabled={selectedIds.size === 0}>
                  <CheckSquare className="h-3.5 w-3.5 mr-2" /> Të zgjedhurat{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleApplyNewPrices} disabled={applyingNew || newPriceApplyCount === 0}>
              {applyingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Updato Çmimet{newPriceApplyCount > 0 ? ` (${newPriceApplyCount})` : ""}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {tab === "newprice" ? (
        <div className="border rounded-xl overflow-x-auto mt-2">
          <FlightLayoutTable columns={newPriceLayoutColumns} layout={flightLayout} onChange={setFlightLayout}>
            <thead className="bg-muted/40">
              <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-3 py-3 w-8">
                  <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                    {paginatedFlights.length > 0 && paginatedFlights.every((f: any) => selectedIds.has(f.id))
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : <Square className="h-4 w-4" />}
                  </button>
                </th>
                {newPriceTh("route", "Route")}
                {newPriceTh("flightNo", "Flight Number")}
                {newPriceTh("date", "Date")}
                {newPriceTh("price", "Çmimi Ynë", "right")}
                {newPriceTh("google", "Google i Ruajtur", "right")}
                {isAdmin && colVisible("groups") && <th className="px-4 py-3 font-medium text-left">Grupet</th>}
                {newPriceTh("newprice", "Çmim i Ri", "right")}
                {newPriceTh("diff", "Diferenca", "right")}
                {isAdmin && colVisible("sales") && (
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Shitje</th>
                )}
                {isAdmin && colVisible("net") && (
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Neto</th>
                )}
                {isAdmin && colVisible("commission") && (
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Komisioni</th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8 + financialColumnCount + (isAdmin && colVisible("groups") ? 1 : 0)} className="text-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" />Loading...</td></tr>
              ) : paginatedFlights.length === 0 ? (
                <tr><td colSpan={8 + financialColumnCount + (isAdmin && colVisible("groups") ? 1 : 0)} className="text-center py-12 text-muted-foreground">No flights found</td></tr>
              ) : paginatedFlights.map((f: any) => {
                const isSelected = selectedIds.has(f.id);
                const np = resolveNewPrice(f);
                // Only a verified saved display can be a numeric diff baseline.
                const savedGoogle = np.saved;
                const diff = np.candidate != null && savedGoogle != null ? np.candidate - savedGoogle : null;
                let dateStr = f.departureDate;
                try {
                  let iso = f.departureDate;
                  const dmy = iso.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                  if (dmy) iso = `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
                  dateStr = format(parseISO(iso), "EEE, d MMM");
                } catch { dateStr = f.departureDate; }
                return (
                  <tr key={f.id} title={(f as any).showInBookingEngine === false ? "Fshehur nga Booking Engine" : undefined} className={`border-b transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/10" : (f as any).showInBookingEngine === false ? "bg-gray-200/80 hover:bg-gray-300/70 text-gray-500 [&_td]:opacity-80" : "hover:bg-muted/30"}`}>
                    <td className="px-3 py-3">
                      <button onClick={() => toggleSelect(f.id)} className="text-muted-foreground hover:text-foreground">
                        {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold tracking-wider text-sm">{f.fromCity} &rarr; {f.toCity}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openDetail(f.id, "details", f)} className="font-mono font-medium text-primary hover:underline cursor-pointer">
                        {fmtFlightNum(f.flightNumber)}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{dateStr}, {fmtAmPm(f.departureTime)}</td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap"><FlightPriceWithDiscount flight={f} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <GooglePriceCell
                          from={f.fromAirport || f.fromCity}
                          to={f.toAirport || f.toCity}
                          date={f.departureDate}
                          flightNumber={f.flightNumber}
                          flightId={f.id}
                          onResolved={reportNewTabGoogle}
                          ttlMs={googleTtlMs}
                          bulkReady={bulkReady}
                          bulkError={bulkError}
                          skip={f.status === "soldout" || !!f.googleMonitoringDisabled}
                        />
                      </span>
                    </td>
                    {isAdmin && colVisible("groups") && <td className="px-4 py-3"><FlightGroupBadges flight={f} groups={flightGroups.data} isLoading={flightGroups.isPending} error={flightGroups.error} /></td>}
                    <td className="px-4 py-3 text-right whitespace-nowrap font-semibold">
                      {newPricesQuery.isLoading
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" />
                        : newPricesQuery.isError
                          ? <span className="text-amber-600">S’ka çmim</span>
                          : np.candidate != null
                          ? <span className="text-blue-700">€{fmtM(np.candidate)}</span>
                          : <span className="text-muted-foreground/40">S'ka</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                      {diff == null
                        ? <span className="text-muted-foreground/40">—</span>
                        : diff === 0
                          ? <span className="text-muted-foreground">€0</span>
                          : diff > 0
                            ? <span className="text-red-600">+€{fmtM(diff)}</span>
                            : <span className="text-green-600">−€{fmtM(Math.abs(diff))}</span>}
                    </td>
                    {isAdmin && colVisible("sales") && <FlightSalesCell flight={f} />}
                    {isAdmin && colVisible("net") && <FlightNetCell flight={f} />}
                    {isAdmin && colVisible("commission") && <FlightCommissionCell flight={f} />}
                  </tr>
                );
              })}
            </tbody>
          </FlightLayoutTable>
        </div>
      ) : (
      <div className="border rounded-xl overflow-x-auto mt-0 border-t-0 rounded-tl-none rounded-tr-none">
        <FlightLayoutTable columns={mainLayoutColumns} layout={flightLayout} onChange={setFlightLayout}>
          <thead className="bg-muted/40">
            <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
              <th className="px-3 py-3 w-8">
                <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                  {selectedIds.size === paginatedFlights.length && paginatedFlights.length > 0
                    ? <CheckSquare className="h-4 w-4 text-primary" />
                    : <Square className="h-4 w-4" />}
                </button>
              </th>
              {(["route","date","flightNo","seats","price"] as const).filter(colVisible).map((col) => {
                const labels: Record<string, string> = { route: "Route", date: "Date", flightNo: "Flight Number", seats: "Number of Seats", price: "One Way" };
                const rightAlign = col === "price";
                return (
                  <th key={col} className={`px-4 py-3 font-medium ${rightAlign ? "text-right" : "text-left"}`}>
                    <button
                      onClick={() => handleSort(col)}
                      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === col ? "text-foreground" : ""}`}
                    >
                      {labels[col]}
                      <span className="flex flex-col leading-[0] ml-0.5">
                        <svg className={`h-2 w-2 ${sortKey === col && sortDir === "asc" ? "text-primary" : "text-muted-foreground/40"}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 0L8 4H0L4 0z"/></svg>
                        <svg className={`h-2 w-2 ${sortKey === col && sortDir === "desc" ? "text-primary" : "text-muted-foreground/40"}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 4L0 0H8L4 4z"/></svg>
                      </span>
                    </button>
                  </th>
                );
              })}
              {colVisible("baggage") && (
                <th className="px-4 py-3 font-medium text-center whitespace-nowrap">
                  <button
                    onClick={() => handleSort("baggage")}
                    className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === "baggage" ? "text-foreground" : ""}`}
                  >
                    Bagazh
                    <span className="flex flex-col leading-[0] ml-0.5">
                      <svg className={`h-2 w-2 ${sortKey === "baggage" && sortDir === "asc" ? "text-primary" : "text-muted-foreground/40"}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 0L8 4H0L4 0z"/></svg>
                      <svg className={`h-2 w-2 ${sortKey === "baggage" && sortDir === "desc" ? "text-primary" : "text-muted-foreground/40"}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 4L0 0H8L4 4z"/></svg>
                    </span>
                  </button>
                </th>
              )}
              {colVisible("google") && (
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">
                  <button
                    onClick={() => handleSort("google")}
                    className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === "google" ? "text-foreground" : ""}`}
                  >
                    <Globe className="h-3 w-3" /> Google
                    <span className="flex flex-col leading-[0] ml-0.5">
                      <svg className={`h-2 w-2 ${sortKey === "google" && sortDir === "asc" ? "text-primary" : "text-muted-foreground/40"}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 0L8 4H0L4 0z"/></svg>
                      <svg className={`h-2 w-2 ${sortKey === "google" && sortDir === "desc" ? "text-primary" : "text-muted-foreground/40"}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 4L0 0H8L4 4z"/></svg>
                    </span>
                  </button>
                </th>
              )}
              {isAdmin && colVisible("groups") && <th className="px-4 py-3 font-medium text-left">Grupet</th>}
              {isAdmin && colVisible("sales") && (
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Shitje</th>
              )}
              {isAdmin && colVisible("net") && (
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Neto</th>
              )}
              {isAdmin && colVisible("commission") && (
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Komisioni</th>
              )}
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={tableColSpan} className="text-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" />Loading...
              </td></tr>
            ) : paginatedFlights.length === 0 ? (
              <tr><td colSpan={tableColSpan} className="text-center py-12 text-muted-foreground">
                No flights found
              </td></tr>
            ) : paginatedFlights.map((f: any) => {
              const available = f.totalSeats - f.soldSeats;
              const sold = f.soldSeats || 0;
              const total = f.totalSeats;
              const isSelected = selectedIds.has(f.id);
              const isSoon = f.departureDate >= todayStr && f.departureDate <= soonEndStr;
              let dateStr = f.departureDate;
              try {
                let iso = f.departureDate;
                // handle DD/MM/YYYY or DD-MM-YYYY stored in DB
                const dmy = iso.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                if (dmy) iso = `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
                dateStr = format(parseISO(iso), "EEE, d MMM");
              } catch { dateStr = f.departureDate; }

              return (
                <tr key={f.id} onMouseEnter={() => prefetchFlight(f.id)} title={(f as any).showInBookingEngine === false ? "Fshehur nga Booking Engine" : undefined} className={`border-b transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/10" : (f as any).showInBookingEngine === false ? "bg-gray-200/80 hover:bg-gray-300/70 text-gray-500 [&_td]:opacity-80" : f.isConfirmed ? "bg-emerald-50 hover:bg-emerald-100" : "hover:bg-muted/30"}`}>
                  {/* Checkbox */}
                  <td className="px-3 py-3">
                    <button onClick={() => toggleSelect(f.id)} className="text-muted-foreground hover:text-foreground">
                      {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    </button>
                  </td>
                  {/* Route */}
                  {colVisible("route") && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDot[f.status] || "bg-gray-400"}`} />
                      <div className="flex flex-wrap items-center gap-y-0.5">
                        <span className="font-bold tracking-wider text-sm whitespace-nowrap">
                          {f.fromCity} &rarr; {f.toCity}
                        </span>
                        {f.isConfirmed && (
                          <span title="Fluturim i Konfirmuar" className="ml-1.5 inline-flex items-center align-middle rounded-md bg-emerald-100 px-1 py-0.5 border border-emerald-300 shadow-sm">
                            <span className="inline-flex items-center justify-center bg-black rounded w-3.5 h-3.5 text-[10px] leading-none flex-shrink-0">⭐</span>
                          </span>
                        )}
                        {f.googleMonitoringDisabled && <GoogleMonitoringBadge />}
                        {/* Shenja e shënimeve — pas itinerarit dhe yllit; hover-i hap tabelën e shënimeve */}
                        <FlightNotesHoverBadge flightId={f.id} count={Number(f.notesCount ?? 0)} />
                        {f.scheduleErrorReason && (
                          <span data-testid={`text-schedule-error-${f.id}`} title={f.scheduleErrorReason}
                            className="ml-1.5 inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {f.scheduleErrorReason}
                          </span>
                        )}
                        {f.isDuplicate && (
                          <span title="Fluturim i dublikuar — destinacion, datë, orar dhe kod fluturimi i njëjtë me një tjetër" className="ml-1.5 inline-flex items-center gap-1 align-middle rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-300 shadow-sm">
                            <Copy className="h-3 w-3" /> Dublikuar
                          </span>
                        )}
                        {f.externalSalesBlocked && (
                          <span
                            role="img"
                            aria-label="Shitjet e jashtme të bllokuara — faqja publike, API e partnerëve dhe kanalet e jashtme e shohin të mbyllur / pa vende. Rezervimet e brendshme vazhdojnë normalisht."
                            title="Shitjet e jashtme të bllokuara — faqja publike, API e partnerëve dhe kanalet e jashtme e shohin të mbyllur / pa vende. Rezervimet e brendshme vazhdojnë normalisht."
                            className="ml-1.5 inline-flex items-center align-middle rounded-md bg-orange-100 px-1.5 py-0.5 text-orange-800 border border-orange-300 shadow-sm"
                          >
                            <Lock aria-hidden="true" className="h-3 w-3" />
                          </span>
                        )}
                        {isSoon && (
                          <span title={`Fluturim i afërt — niset brenda ${soonDays} ditëve`} className="ml-1.5 inline-flex items-center gap-0.5 align-middle rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-600/70 border border-amber-200/60">
                            Afërt
                          </span>
                        )}
                        {f.scheduleAlert === "time_changed" && (
                          <span className="ml-2 inline-flex items-center gap-1 align-middle">
                            <span
                              title={f.scheduleAlertDetail || "Orari ka ndryshuar në Google Flights"}
                              className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                            >
                              <Clock className="h-3 w-3" />
                              {f.scheduleAlertDetail || "Orari ndryshoi"}
                            </span>
                            <button
                              type="button"
                              onClick={() => applyGoogleSchedule(f)}
                              disabled={applyingSchedule.has(f.id)}
                              title="Përditëso orarin sipas Google"
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {applyingSchedule.has(f.id)
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <RefreshCw className="h-3 w-3" />}
                              Përditëso
                            </button>
                          </span>
                        )}
                        {f.scheduleAlert === "price_retry" && (
                          <span title={f.scheduleAlertDetail || ""} className="ml-2 inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            Pa çmim · {f.scheduleMissCount ?? 0}/5 kontrolle
                          </span>
                        )}
                        {f.scheduleAlert === "not_found" && (
                          f.status === "soldout"
                            ? <span className="ml-2 text-[10px] text-muted-foreground">Sold Out · nuk kontrollohet</span>
                            : <SuspectFlightRecheck state={f.suspectRecheck} detail={f.scheduleAlertDetail} />
                        )}
                        {f.seatAlert === "low_seats" && (
                          <span
                            title={
                              seatAlertLabel(f.seatAlertDetail, f.seatMissCount)
                            }
                            className="ml-2 inline-flex items-center gap-1 rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 align-middle"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {seatAlertLabel(f.seatAlertDetail, f.seatMissCount)}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  )}
                  {/* Date + time */}
                  {colVisible("date") && (
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {dateStr}, {fmtAmPm(f.departureTime)}
                    {f.arrivalTime ? ` – ${fmtAmPm(f.arrivalTime)}` : ""}
                  </td>
                  )}
                  {/* Flight number */}
                  {colVisible("flightNo") && (
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDetail(f.id, "details", f)}
                      className="font-mono font-medium text-primary hover:underline cursor-pointer"
                    >
                      {fmtFlightNum(f.flightNumber)}
                    </button>
                  </td>
                  )}
                  {/* Seats */}
                  {colVisible("seats") && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-foreground">
                        <SeatIcon className="text-muted-foreground" />{available}
                      </span>
                      <span className="flex items-center gap-1 text-green-600">
                        <SeatIcon className="text-green-500" />{sold}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <SeatIcon className="text-muted-foreground opacity-60" />{total}
                      </span>
                      <SeatQuickEdit flight={f} onSaved={invalidate} />
                    </div>
                  </td>
                  )}
                  {/* Price */}
                  {colVisible("price") && (
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">
                    <FlightPriceWithDiscount flight={f} />
                    {/* Çmimi Neto — informativ, vetëm admin; s'ndikon askund */}
                    {isAdmin && f.netPrice != null && (
                      <span className="block text-[11px] font-medium text-violet-600" title="Çmimi Neto (informativ)">
                        Neto €{fmtM(f.netPrice)}
                      </span>
                    )}
                  </td>
                  )}
                  {/* Baggage */}
                  {colVisible("baggage") && (
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {f.checkedBaggageCount || f.checkedBaggageKg || f.checkedBaggagePrice ? (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        {(f.checkedBaggageCount || f.checkedBaggageKg) ? (
                          <span className="font-medium">
                            {f.checkedBaggageCount ? `${f.checkedBaggageCount}×` : ""}
                            {f.checkedBaggageKg ? `${f.checkedBaggageKg}kg` : ""}
                          </span>
                        ) : null}
                        {f.checkedBaggagePrice ? (
                          <span className="text-emerald-700 font-semibold">€{fmtM(f.checkedBaggagePrice)}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">—</span>
                    )}
                  </td>
                  )}
                  {/* Google Flights price */}
                  {colVisible("google") && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {f.excludeFromGoogleRule && (
                        <span
                          title="Çaktivizuar nga lista e çmimeve të Google — çmimi nuk ndryshohet automatikisht"
                          className="inline-flex items-center justify-center h-4 w-4 shrink-0 rounded-full bg-red-100 text-red-600 ring-1 ring-red-300"
                        >
                          <X className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                      <GooglePriceCell
                        from={f.fromAirport || f.fromCity}
                        to={f.toAirport || f.toCity}
                        date={f.departureDate}
                        flightNumber={f.flightNumber}
                        flightId={f.id}
                        onResolved={reportGooglePrice}
                        ttlMs={googleTtlMs}
                        bulkReady={bulkReady}
                        bulkError={bulkError}
                        skip={f.status === "soldout" || !!f.googleMonitoringDisabled}
                      />
                      {tab === "noprice" && f.noPriceReason && <span className="block text-[10px] text-amber-700">{f.noPriceReason}</span>}
                    </span>
                  </td>
                  )}
                  {isAdmin && colVisible("groups") && <td className="px-4 py-3"><FlightGroupBadges flight={f} groups={flightGroups.data} isLoading={flightGroups.isPending} error={flightGroups.error} /></td>}
                  {isAdmin && colVisible("sales") && <FlightSalesCell flight={f} />}
                  {isAdmin && colVisible("net") && <FlightNetCell flight={f} />}
                  {isAdmin && colVisible("commission") && <FlightCommissionCell flight={f} />}
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {tab === "alerts" && (
                        <button title="Konfirmo njoftimin (largoje nga lista)" onClick={() => handleConfirmAlert(f)}
                          disabled={confirmingAlertId === f.id}
                          className="px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1">
                          {confirmingAlertId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirm
                        </button>
                      )}
                      <button title="Edit" onClick={() => openDetail(f.id, "edit", f)}
                        className="p-1.5 rounded hover:bg-muted text-blue-500 hover:text-blue-600 transition-colors">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button title={f.status === "open" ? "Close Sales" : "Open Sales"} onClick={() => handleToggle(f)}
                        className={`p-1.5 rounded hover:bg-muted transition-colors ${f.status === "open" ? "text-green-500" : "text-gray-400"}`}>
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      {hasPermission("can_duplicate_flights") && (
                        <button title="Duplicate" onClick={() => handleDuplicate(f.id)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {hasPermission("can_delete_flights") && (
                        <button title="Delete" onClick={() => handleDelete(f.id)}
                          className="p-1.5 rounded hover:bg-muted text-destructive hover:text-destructive/80 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </FlightLayoutTable>
      </div>
      )}

      {/* Pagination */}
      {!isLoading && displayTotal > 0 && (
        <div className="flex items-center justify-between pt-2 pb-24 pr-16">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Shfaq</span>
            <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[30, 50, 100, 200, 300, 500, 1000].map(n => (
                  <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                ))}
                <SelectItem value="100000" className="text-xs">Të gjitha</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">fluturime</span>
            {isFetching && !isLoading && <span className="text-xs text-blue-500 animate-pulse">po ngarkon...</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {(page - 1) * perPage + 1}–{Math.min(page * perPage, displayTotal)} nga {displayTotal}
            </span>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 rounded border disabled:opacity-40 hover:bg-muted transition-colors">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setPage(p => Math.min(displayTotalPages, p + 1))} disabled={page >= displayTotalPages}
              className="p-1 rounded border disabled:opacity-40 hover:bg-muted transition-colors">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk Price Dialog */}
      <Dialog open={bulkPriceOpen} onOpenChange={setBulkPriceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" />Ndrysho Çmimet — {selectedIds.size} fluturime</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">Plotëso vetëm fushat që dëshiron të ndryshosh. Të tjerat mbeten siç janë.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Adult (€)</label>
                <Input type="number" min="0" step="1" value={bulkPriceValue}
                  onChange={e => { setBulkPriceValue(e.target.value); setBulkChildPriceValue(e.target.value); }} placeholder="p.sh. 89" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Fëmijë (€) <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">(= Adult)</span></label>
                <Input type="number" min="0" step="1" value={bulkPriceValue} readOnly disabled tabIndex={-1}
                  placeholder="= Adult" className="opacity-70 cursor-not-allowed" title="Çmimi i fëmijës është gjithmonë i njëjtë me adultin" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Foshnjë (€)</label>
                <Input type="number" min="0" step="1" value={bulkInfantPriceValue}
                  onChange={e => setBulkInfantPriceValue(e.target.value)} placeholder="p.sh. 15" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bagazh (€)</label>
                <Input type="number" min="0" step="1" value={bulkBagPriceValue}
                  onChange={e => setBulkBagPriceValue(e.target.value)} placeholder="p.sh. 35" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bagazh (kg)</label>
                <Input type="number" min="0" step="0.5" value={bulkBagKgValue}
                  onChange={e => setBulkBagKgValue(e.target.value)} placeholder="p.sh. 20" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground italic">Çmimi i fëmijës është i kyçur dhe vendoset gjithmonë i njëjtë me adultin.</p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setBulkPriceOpen(false)}>Anulo</Button>
              <Button className="flex-1" onClick={handleBulkPrice} disabled={bulkSaving}>
                {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Ndrysho
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Dialog */}
      <Dialog open={bulkStatusOpen} onOpenChange={setBulkStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ToggleLeft className="h-4 w-4 text-primary" />Ndrysho Statusin — {selectedIds.size} fluturime</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Statusi i ri</label>
              <select value={bulkStatusValue} onChange={e => setBulkStatusValue(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
                <option value="open">Open (Bookable)</option>
                <option value="closed">Closed (Pending)</option>
                <option value="soldout">Sold Out</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setBulkStatusOpen(false)}>Anulo</Button>
              <Button className="flex-1" onClick={handleBulkStatus} disabled={bulkSaving}>
                {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Ndrysho
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Seats Dialog */}
      <Dialog open={bulkSeatsOpen} onOpenChange={setBulkSeatsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Ndrysho Vendet e Lira — {selectedIds.size} fluturime
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Vendos numrin e ri të vendeve të lira (të disponueshme) për të gjitha fluturimet e zgjedhura. Vendet e shitura nuk preken.</p>
            <Input
              type="number" min="0" step="1" placeholder="p.sh. 5"
              value={bulkSeatsValue}
              onChange={e => setBulkSeatsValue(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !bulkSaving && bulkSeatsValue && handleBulkSeats()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkSeatsOpen(false)} disabled={bulkSaving}>Anulo</Button>
              <Button onClick={handleBulkSeats} disabled={bulkSaving || bulkSeatsValue === "" || parseInt(bulkSeatsValue) < 0}>
                {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Ndrysho
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <FlightFormDialog
        open={isAddOpen} onOpenChange={setIsAddOpen}
        title="Add Flight" onSave={handleCreate} googleSearch
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={invalidate} />
      </div>{/* end flex-1 */}

      {detailFlightId !== null && (
        <FlightSidePanel
          flightId={detailFlightId}
          initialTab={detailTab}
          onClose={() => setDetailFlightId(null)}
          onUpdated={invalidate}
          placeholderFlight={detailFlightData}
        />
      )}
    </div>
  );
}

const FLIGHT_SALES_SUMMARY_TITLE = "Totale nga rezervimet aktive; rezervimet e anuluara përjashtohen";

function FlightSalesCell({ flight }: { flight: any }) {
  return (
    <td className="px-4 py-3 text-right whitespace-nowrap" title={FLIGHT_SALES_SUMMARY_TITLE}>
      <span className="text-xs font-semibold tabular-nums text-foreground">€{fmtM(flight.salesTotal)}</span>
    </td>
  );
}

function FlightNetCell({ flight }: { flight: any }) {
  const hasBookings = Number(flight.salesBookingCount) > 0;
  return (
    <td className="px-4 py-3 text-right whitespace-nowrap" title={FLIGHT_SALES_SUMMARY_TITLE}>
      <span className="text-xs font-medium tabular-nums text-violet-600">
        {flight.salesNetTotal == null ? (hasBookings ? "Mungon" : "—") : `€${fmtM(flight.salesNetTotal)}`}
      </span>
    </td>
  );
}

function FlightCommissionCell({ flight }: { flight: any }) {
  const commission = Number(flight.salesCommissionTotal) || 0;
  return (
    <td className="px-4 py-3 text-right whitespace-nowrap" title={FLIGHT_SALES_SUMMARY_TITLE}>
      <span className={`text-xs font-medium tabular-nums ${commission < 0 ? "text-red-600" : "text-emerald-600"}`}>
        {commission < 0 ? "−" : ""}€{fmtM(Math.abs(commission))}
      </span>
    </td>
  );
}

// Small seat icon component
// Editor i shpejtë i vendeve direkt nga lista: +/- ose shkruaj vendet e lira.
// Përdor të njëjtin PATCH /flights/:id si editimi brenda fluturimit (totalSeats),
// kështu historiku i vendeve dhe rregullat e tjera zbatohen njësoj.
function SeatQuickEdit({ flight, onSaved }: { flight: any; onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const sold = flight.soldSeats || 0;
  const available = (flight.totalSeats || 0) - sold;

  const pending = val === "" ? NaN : parseInt(val, 10);
  const diff = Number.isNaN(pending) ? 0 : pending - available;
  const dirty = !Number.isNaN(pending) && diff !== 0;

  const bump = (d: number) => {
    const cur = Number.isNaN(pending) ? available : pending;
    const next = Math.max(0, cur + d);
    setVal(String(next));
  };

  const save = async () => {
    if (Number.isNaN(pending) || pending < 0) {
      toast({ title: "Numër i pavlefshëm", description: "Vendet e lira s'mund të jenë negative", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/flights/${flight.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalSeats: sold + pending }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      toast({ title: "Vendet u përditësuan", description: `Të lira: ${pending} · Total: ${sold + pending}` });
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "Vendet nuk u ndryshuan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (o) setVal(String(available)); }}>
      <PopoverTrigger asChild>
        <button
          title="Ndrysho vendet e lira"
          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 rounded-xl border-border/60 p-2.5 shadow-xl">
        <div className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Vende të lira
        </div>
        <div className="flex items-stretch gap-1.5">
          <Button
            variant="outline"
            className="h-8 w-8 shrink-0 rounded-lg p-0 text-base font-medium"
            disabled={saving || (Number.isNaN(pending) ? available : pending) <= 0}
            onClick={() => bump(-1)}
          >
            −
          </Button>
          <div className="relative flex-1">
            <Input
              value={val}
              onChange={e => setVal(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={e => { if (e.key === "Enter" && dirty) save(); }}
              className="h-8 rounded-lg text-center text-sm font-semibold tabular-nums"
              inputMode="numeric"
            />
            {dirty && (
              <span className={`absolute -top-2 right-0 rounded-full px-1.5 py-px text-[10px] font-semibold leading-tight shadow-sm ${diff > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                {diff > 0 ? `+${diff}` : diff}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            className="h-8 w-8 shrink-0 rounded-lg p-0 text-base font-medium"
            disabled={saving}
            onClick={() => bump(1)}
          >
            +
          </Button>
        </div>
        <Button
          size="sm"
          className="mt-2 h-8 w-full rounded-lg font-semibold shadow-sm"
          disabled={saving || !dirty}
          onClick={save}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ruaj"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function FlightPriceWithDiscount({ flight }: { flight: any }) {
  const d = getFlightDiscount(flight);
  const discounted = flight?.discountedAdultPrice;
  if (!d) return <>€{fmtM(flight.adultPrice)}</>;
  const forAgents = d.channels.includes("agents");
  // Not agency-wide (e.g. API-only): show base internal fare + channel badge, no struck-through price.
  if (!forAgents || discounted == null) {
    return (
      <span className="inline-flex items-center justify-end gap-1.5 leading-tight">
        <FlightDiscountBadge discount={d} />
        <span>€{fmtM(flight.adultPrice)}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5 leading-tight">
      <FlightDiscountBadge discount={d} />
      <span className="inline-flex flex-col items-end">
        <span className="text-[11px] text-muted-foreground line-through">€{fmtM(flight.adultPrice)}</span>
        <span className="text-emerald-700">€{fmtM(discounted)}</span>
      </span>
    </span>
  );
}

function SeatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      className={`h-4 w-4 ${className || ""}`}>
      <path d="M6 2v8a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 14h12v6H6z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
