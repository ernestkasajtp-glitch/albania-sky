import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtM, fmtAmPm, fmtDateTimeAmPm } from "@/lib/utils";
import { fmtFlightNum } from "@/lib/utils";
import { GOOGLE_PRICE_DEFAULT_TTL_MS, readGooglePriceLS, writeGooglePriceLS, googlePriceLsKey, normalizeGooglePrice, resolveGooglePriceDisplay, type GooglePriceValue } from "@/lib/googlePriceCache";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { FlightSidePanel } from "@/components/FlightSidePanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronsUpDown } from "lucide-react";
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
  AlertTriangle, ChevronUp, FileText, Columns3, Check, Sparkles,
} from "lucide-react";
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
  status: "open", isConfirmed: false,
};

// Arrival can NEVER be earlier than departure. If the arrival clock time wraps
// past midnight (arr time < dep time), the flight lands the next day, so the
// arrival date follows dep date + 1; otherwise it follows dep date. Recomputes
// in BOTH directions so a transient value while typing (p.sh. "23" pastaj "05")
// doesn't leave the +1 stuck. A manually-set arrival farther than dep+1 is kept.
function syncArrivalDate(form: UseFormReturn<FlightForm>) {
  const depDate = form.getValues("departureDate");
  const depTime = form.getValues("departureTime");
  const arrTime = form.getValues("arrivalTime");
  const arrDate = form.getValues("arrivalDate");
  // Vetem me ora te PLOTA (HH:MM) — vlerat e pjesshme gjate shkrimit injorohen.
  if (!depDate || !/^\d{2}:\d{2}$/.test(depTime || "") || !/^\d{2}:\d{2}$/.test(arrTime || "")) return;
  const nextDay = new Date(new Date(depDate + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const expected = arrTime < depTime ? nextDay : depDate;
  // Rregullo vetem kur data e mberritjes eshte dep ose dep+1 (dmth e vendosur
  // automatikisht) ose e pavlefshme (bosh / para nisjes); datat me te largeta
  // te vena me dore ruhen.
  if (!arrDate || arrDate < depDate || arrDate === depDate || arrDate === nextDay) {
    if (arrDate !== expected) form.setValue("arrivalDate", expected);
  }
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

// Ora e mbylljes së shitjes për fluturimet e konfirmuara ⭐ (rregulli i konfirmuar
// + rregulli i zyrës: nëse mbyllja bie 00:30–09:00 ora e Shqipërisë, mbyllet 00:30).
// I njëjti llogaritje si te FlightSidePanel — mbaji identikë.
function confirmedCloseInfo(departureDate: string, departureTime: string | null, hours: number): { timeStr: string; dateStr: string; closed: boolean } | null {
  try {
    const [y, m, d] = departureDate.split("-").map(Number);
    const [hh = 0, mm = 0] = (departureTime || "00:00").split(":").map(Number);
    const TZ = "Europe/Tirane";
    const guessMs = Date.UTC(y, m - 1, d, hh, mm, 0);
    const parts = (ms: number) => {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
      return (t: string) => Number(p.find(x => x.type === t)!.value);
    };
    const gp = parts(guessMs);
    const tzOffset = Date.UTC(gp("year"), gp("month") - 1, gp("day"), gp("hour"), gp("minute"), gp("second")) - guessMs;
    let closeMs = guessMs - tzOffset - hours * 3_600_000;
    const cp = parts(closeMs);
    const minsOfDay = cp("hour") * 60 + cp("minute");
    if (minsOfDay > 30 && minsOfDay < 540) {
      const g2 = Date.UTC(cp("year"), cp("month") - 1, cp("day"), 0, 30, 0);
      const g2p = parts(g2);
      const off2 = Date.UTC(g2p("year"), g2p("month") - 1, g2p("day"), g2p("hour"), g2p("minute"), g2p("second")) - g2;
      closeMs = g2 - off2;
    }
    const closeDate = new Date(closeMs);
    return {
      timeStr: closeDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }),
      dateStr: closeDate.toLocaleDateString("sq-AL", { day: "2-digit", month: "short", timeZone: TZ }),
      closed: Date.now() >= closeMs,
    };
  } catch { return null; }
}

// ─── FlightForm Dialog ───────────────────────────────────────────────────────
function FlightFormDialog({
  open, onOpenChange, initial, onSave, title,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  initial?: FlightForm; onSave: (v: FlightForm) => void; title: string;
}) {
  const form = useForm<FlightForm>({
    resolver: zodResolver(flightSchema),
    defaultValues: initial ?? defaultValues,
  });

  // Auto-sync: childPrice always equals adultPrice
  const adultPrice = form.watch("adultPrice");
  useEffect(() => {
    form.setValue("childPrice", adultPrice, { shouldValidate: false });
  }, [adultPrice]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4 pt-2">
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
                    const arr = form.getValues("arrivalDate");
                    if (arr && v > arr) form.setValue("arrivalDate", v);
                  }} />
                </FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="departureTime" render={({ field }) => (
                <FormItem><FormLabel>Dep. Time</FormLabel><FormControl><Input type="time" {...field} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="arrivalDate" render={({ field }) => {
                const depDate = form.watch("departureDate");
                return (
                  <FormItem><FormLabel>Arr. Date</FormLabel><FormControl>
                    <DatePicker value={field.value} min={depDate || undefined} onChange={v => field.onChange(v)} />
                  </FormControl><FormMessage /></FormItem>
                );
              }} />
              <FormField control={form.control} name="arrivalTime" render={({ field }) => (
                <FormItem><FormLabel>Arr. Time</FormLabel><FormControl><Input type="time" {...field} onChange={e => { field.onChange(e); syncArrivalDate(form); }} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
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
      ["WIZZ AIR","W4","5047","TIA","BLQ","15-08-2026","06:00","15-08-2026","07:45",130,35,0,20,"1-20-80","open"],
      ["WIZZ AIR","W4","5048","TIA","BLQ","16-08-2026","06:00","16-08-2026","07:45",130,35,0,20,"1-20-80","open"],
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
function _FlightSidePanel_DELETED({ flightId, onClose, onUpdated }: {
  flightId: number; initialTab?: "details" | "edit"; onClose: () => void; onUpdated: () => void;
}) {
  const { toast } = useToast();
  const { data: flight, isLoading } = useGetFlight(flightId, { query: { enabled: !!flightId } as any });
  const { data: bookings, isLoading: loadingBookings } = useListBookings({ flightId } as any, { query: { enabled: !!flightId } as any });
  const updateFlight = useUpdateFlight();
  const toggleSalesMut = useToggleFlightSales();
  const [cutoffHours, setCutoffHours] = useState<number>(3);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/settings/sell-cutoff`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.hours != null) setCutoffHours(d.hours); })
      .catch(() => {});
  }, []);

  const form = useForm<FlightForm>({ resolver: zodResolver(flightSchema), defaultValues });

  useEffect(() => {
    if (flight) form.reset({
      airline: flight.airline, flightNumber: flight.flightNumber,
      fromCity: flight.fromCity, toCity: flight.toCity,
      departureDate: flight.departureDate, departureTime: flight.departureTime,
      arrivalDate: flight.arrivalDate, arrivalTime: flight.arrivalTime,
      adultPrice: Math.round(Number(flight.adultPrice)), childPrice: Math.round(Number(flight.childPrice)),
      infantPrice: Math.round(Number(flight.infantPrice)), tax: Math.round(Number(flight.tax)),
      totalSeats: flight.totalSeats, status: flight.status,
      isConfirmed: flight.isConfirmed ?? false,
    });
  }, [flight?.id]);

  const handleSave = (values: FlightForm) => {
    updateFlight.mutate({ id: flightId, data: values }, {
      onSuccess: () => { toast({ title: "Fluturimi u ruajt" }); onUpdated(); },
      onError: (e: any) => toast({ title: "Gabim", description: e.message, variant: "destructive" }),
    });
  };

  const handleToggleSales = () => {
    if (!flight) return;
    const open = flight.status !== "open";
    toggleSalesMut.mutate({ id: flight.id, data: { open } }, {
      onSuccess: () => { toast({ title: open ? "Shitjet u hapën" : "Shitjet u mbyllën" }); onUpdated(); },
    });
  };

  if (isLoading || !flight) return (
    <div className="w-[460px] flex-shrink-0 border-l bg-slate-200 flex items-center justify-center sticky top-0" style={{ height: "calc(100vh - 112px)" }}>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const available = flight.totalSeats - flight.soldSeats;
  const isOpen = flight.status === "open";
  const hasBookings = (bookings?.length ?? 0) > 0;

  const bkStatusStyle: Record<string, string> = {
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
    cancelled: "bg-red-50 text-red-600 border-red-200",
    open: "bg-green-50 text-green-700 border-green-200",
  };

  let depDateStr = flight.departureDate;
  try { depDateStr = format(parseISO(flight.departureDate), "EEEE, MMMM d, yyyy"); } catch {}

  return (
    <div className="w-[460px] flex-shrink-0 border-l bg-slate-200 flex flex-col overflow-hidden sticky top-0" style={{ height: "calc(100vh - 112px)" }}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)} className="flex flex-col h-full overflow-hidden">

          {/* ── Header ── */}
          <div className="px-5 py-4 border-b flex-shrink-0 bg-white">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-lg leading-tight">
                  {flight.fromCity} → {flight.toCity}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">{depDateStr}</p>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${isOpen ? "bg-green-50 text-green-700 border-green-200" : "bg-orange-50 text-orange-700 border-orange-200"}`}>
                  {isOpen ? "Open" : flight.status === "soldout" ? "Sold Out" : "Closed"}
                </span>
                <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">

            {/* Flight Timing — horizontal layout */}
            <div className="bg-white rounded-xl border shadow-sm px-4 py-4">
              <div className="flex items-center gap-2">

                {/* ── Departure ── */}
                <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <PlaneTakeoff className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-semibold text-xs text-slate-700 truncate max-w-full">{flight.fromCity}</span>
                  <FormField control={form.control} name="departureTime" render={({ field }) => (
                    <input {...field} type="time" onChange={field.onChange}
                      className="w-full text-center text-sm font-mono border border-dashed border-slate-300 rounded px-1 py-0.5 bg-transparent outline-none focus:border-blue-400 focus:bg-blue-50/40" />
                  )} />
                  <FormField control={form.control} name="departureDate" render={({ field }) => (
                    <DatePicker value={field.value} onChange={v => {
                      field.onChange(v);
                      const arr = form.getValues("arrivalDate");
                      if (arr && v > arr) form.setValue("arrivalDate", v);
                    }} className="h-7 text-[11px] border-dashed w-full" />
                  )} />
                </div>

                {/* ── Flight number + line ── */}
                <div className="flex flex-col items-center gap-1 shrink-0 px-1">
                  <div className="h-px w-8 bg-slate-200" />
                  <FormField control={form.control} name="flightNumber" render={({ field }) => (
                    <input {...field}
                      className="font-mono text-[11px] font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded border-0 outline-none focus:ring-1 focus:ring-blue-400 w-20 text-center" />
                  )} />
                  <Plane className="h-3.5 w-3.5 text-blue-400 rotate-90" />
                  <div className="h-px w-8 bg-slate-200" />
                </div>

                {/* ── Arrival ── */}
                <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                  <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                    <PlaneLanding className="h-4 w-4 text-purple-600" />
                  </div>
                  <span className="font-semibold text-xs text-slate-700 truncate max-w-full">{flight.toCity}</span>
                  <FormField control={form.control} name="arrivalTime" render={({ field }) => (
                    <input {...field} type="time" onChange={e => { field.onChange(e); syncArrivalDate(form); }}
                      className="w-full text-center text-sm font-mono border border-dashed border-slate-300 rounded px-1 py-0.5 bg-transparent outline-none focus:border-purple-400 focus:bg-purple-50/40" />
                  )} />
                  <FormField control={form.control} name="arrivalDate" render={({ field }) => {
                    const depDate = form.watch("departureDate");
                    return <DatePicker value={field.value} min={depDate || undefined} onChange={v => field.onChange(v)} className="h-7 text-[11px] border-dashed w-full" />;
                  }} />
                </div>

              </div>
            </div>

            {/* Route & Airline */}
            <div className="bg-white rounded-xl border shadow-sm px-5 py-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Operatori i Fluturimit</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground flex-shrink-0">
                  {flight.airline.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="airline" render={({ field }) => (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Linja ajrore</p>
                      <input {...field} className="font-medium text-sm w-full border-0 border-b border-dashed border-muted-foreground/40 bg-transparent outline-none focus:border-primary" />
                    </div>
                  )} />
                  <div className="grid grid-cols-2 gap-2">
                    <FormField control={form.control} name="fromCity" render={({ field }) => (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Nga</p>
                        <input {...field} className="font-medium text-sm w-full border-0 border-b border-dashed border-muted-foreground/40 bg-transparent outline-none focus:border-primary" />
                      </div>
                    )} />
                    <FormField control={form.control} name="toCity" render={({ field }) => (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Deri</p>
                        <input {...field} className="font-medium text-sm w-full border-0 border-b border-dashed border-muted-foreground/40 bg-transparent outline-none focus:border-primary" />
                      </div>
                    )} />
                  </div>
                </div>
              </div>
            </div>

            {/* Toggle Sales */}
            <div className="bg-white rounded-xl border shadow-sm px-5 py-3">
              <button type="button" onClick={handleToggleSales} disabled={toggleSalesMut.isPending || hasBookings}
                className={`w-full text-center text-sm py-2 rounded-lg border transition-colors ${hasBookings ? "text-muted-foreground border-muted cursor-not-allowed" : isOpen ? "text-orange-600 border-orange-200 bg-orange-50 hover:bg-orange-100" : "text-green-600 border-green-200 bg-green-50 hover:bg-green-100"}`}>
                {toggleSalesMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : isOpen ? "Mbyll shitjet ×" : "Hap shitjet ✓"}
              </button>
              {hasBookings && <p className="text-xs text-muted-foreground text-center mt-1">Fluturimet me rezervime nuk mund të ndryshohen</p>}
            </div>

            {/* Sales Ending */}
            {(() => {
              try {
                const [y, m, d] = flight.departureDate.split("-").map(Number);
                const [hh = 0, mm = 0] = (flight.departureTime || "00:00").split(":").map(Number);
                const TZ = "Europe/Tirane";
                const guessMs = Date.UTC(y, m - 1, d, hh, mm, 0);
                const gParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(guessMs));
                const gp = (t: string) => Number(gParts.find(p => p.type === t)!.value);
                const tzOffset = Date.UTC(gp("year"), gp("month") - 1, gp("day"), gp("hour"), gp("minute"), gp("second")) - guessMs;
                const depMs = guessMs - tzOffset;
                const closeMs = depMs - cutoffHours * 3_600_000;
                const closeDate = new Date(closeMs);
                const now = Date.now();
                const alreadyClosed = now >= closeMs;
                const closeDateStr = closeDate.toLocaleDateString("sq-AL", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TZ });
                const closeTimeStr = closeDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ });
                return (
                  <div className="bg-white rounded-xl border shadow-sm px-5 py-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-orange-500 flex-shrink-0" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales Ending</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Mbyllet para nisjes <span className="text-orange-600 font-semibold">*</span></span>
                      <span className="font-semibold text-sm">{cutoffHours} orë</span>
                    </div>
                    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${alreadyClosed ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                      <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        {alreadyClosed ? "⚠️ Shitja ka përfunduar" : "Shitja mbyllet"}
                        {" — "}
                        <strong>{closeDateStr} ora {closeTimeStr}</strong>
                        {" "}<span className="opacity-70">(ora e Shqipërisë)</span>
                      </span>
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}

            {/* Tickets Volume */}
            <div className="bg-white rounded-xl border shadow-sm px-5 py-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Volumi i Biletave</p>
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="totalSeats" render={({ field }) => (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1.5">Available</p>
                    <div className="flex items-center justify-center gap-1">
                      <button type="button" onClick={() => field.onChange(Math.max(flight.soldSeats, Number(field.value) - 1))}
                        className="w-6 h-6 rounded border text-muted-foreground hover:bg-muted text-sm leading-none">−</button>
                      <span className="font-bold text-xl w-8 text-center">{Number(field.value) - flight.soldSeats}</span>
                      <button type="button" onClick={() => field.onChange(Number(field.value) + 1)}
                        className="w-6 h-6 rounded border text-muted-foreground hover:bg-muted text-sm leading-none">+</button>
                    </div>
                    <div className="h-0.5 bg-primary mt-2 mx-2 rounded" />
                  </div>
                )} />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1.5">Sold</p>
                  <p className="font-bold text-xl">{flight.soldSeats}</p>
                  <div className="h-0.5 bg-muted mt-2 mx-2 rounded" />
                </div>
                <FormField control={form.control} name="totalSeats" render={({ field }) => (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1.5">Total</p>
                    <p className="font-bold text-xl">{field.value}</p>
                    <div className="h-0.5 bg-muted mt-2 mx-2 rounded" />
                  </div>
                )} />
              </div>
            </div>

            {/* Price */}
            <div className="bg-white rounded-xl border shadow-sm px-5 py-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Çmimet</p>
              <div className="space-y-2">
                {([["adultPrice", "Çmimi Adult (one-way)"], ["infantPrice", "Çmimi Infant"], ["tax", "Taksa"]] as const).map(([name, label]) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-muted/30 w-32">
                        <span className="text-muted-foreground">→</span>
                        <input type="number" step="1" min="0" {...field}
                          className="bg-transparent outline-none text-sm font-semibold w-full text-right" />
                        <span className="text-muted-foreground text-xs">$</span>
                      </div>
                    </div>
                  )} />
                ))}
              </div>
            </div>

            {/* Status */}
            <div className="bg-white rounded-xl border shadow-sm px-5 py-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statusi i fluturimit</p>
              <FormField control={form.control} name="status" render={({ field }) => (
                <select {...field} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                  <option value="open">Open — Hapur për rezervime</option>
                  <option value="closed">Closed — Pezull</option>
                  <option value="soldout">Sold Out — I shitur plotësisht</option>
                </select>
              )} />
              <FormField control={form.control} name="isConfirmed" render={({ field }) => (
                <label className="flex items-center gap-2.5 cursor-pointer select-none rounded-lg border px-3 py-2.5 hover:bg-amber-50/60 transition-colors">
                  <input type="checkbox" checked={!!field.value} onChange={e => field.onChange(e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-500" />
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center bg-black rounded w-4 h-4 text-xs leading-none flex-shrink-0">⭐</span>
                    <span>Fluturim i Konfirmuar</span>
                  </span>
                </label>
              )} />
            </div>

            {/* Bookings */}
            <div className="bg-white rounded-xl border shadow-sm px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Rezervimet ({bookings?.length ?? 0})
                </p>
                {(bookings?.length ?? 0) > 3 && (
                  <Link href={`/bookings?flightId=${flightId}`} className="text-xs text-primary hover:underline">Shih të gjitha</Link>
                )}
              </div>
              {loadingBookings ? (
                <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
              ) : !bookings?.length ? (
                <p className="text-xs text-muted-foreground text-center py-3">Nuk ka rezervime për këtë fluturim</p>
              ) : (
                <div className="space-y-2">
                  {bookings.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2.5">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setSelectedBookingId(b.id)}
                              className="font-mono text-xs font-bold text-primary hover:underline">{b.bookingRef}</button>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${bkStatusStyle[b.status] || "bg-gray-50 text-gray-600 border-gray-200"}`}>{b.status}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{b.customerName}</p>
                        </div>
                      </div>
                      <span className="font-semibold text-sm">${fmtM(b.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Save footer ── */}
          <div className="px-5 py-3 border-t bg-white flex-shrink-0">
            <Button type="submit" className="w-full" disabled={updateFlight.isPending}>
              {updateFlight.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Duke ruajtur...</> : "Ruaj Ndryshimet"}
            </Button>
          </div>
        </form>
      </Form>

      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle></DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
function MultiCitySelect({ options, value, onChange, placeholder, icon }: {
  options: string[]; value: string[]; onChange: (v: string[]) => void;
  placeholder: string; icon?: React.ReactNode;
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
    <Popover open={open} onOpenChange={setOpen}>
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
          {filtered.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">Nuk u gjet</p>}
          {filtered.map(code => (
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

// Auto-fetches the live Google Flights price for a single flight row.
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
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xl font-bold text-xs tracking-tight ${badgeCfg.outer}`}>
      <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${badgeCfg.dot}`} />
      <span className="tabular-nums">€{fmtM(price)}</span>
      {data && !data.specific && <span className="font-normal opacity-60" title="Çmimi më i ulët për këtë rrugë në këtë datë">min</span>}
    </span>
  );
}

// ─── Flight Report HTML Generator ────────────────────────────────────────────
function generateFlightReportPdf(flights: any[], opts: { showBaggage?: boolean; showGoogle?: boolean } = {}): jsPDF {
  const { showBaggage = true, showGoogle = true } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const now = fmtDateTimeAmPm(new Date(), { dateOptions: { dateStyle: "full" } });
  const statusLabel: Record<string, string> = {
    open: "I Hapur", closed: "I Mbyllur", soldout: "Plote", cancelled: "Anuluar",
  };
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

  const pageW = 210;
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
  const headers = ["Rruga", "Data & Ora", "Fluturimi", "Tot.", "Shit.", "Lira", "Adulte", "Infant"];
  if (showBaggage) headers.push("Bag");
  if (showGoogle)  headers.push("Google");
  headers.push("Statusi");

  const rows = flights.map(f => {
    const row: string[] = [
      `${f.fromCity} > ${f.toCity}`,
      fmtDate(f.departureDate, f.departureTime, f.arrivalTime),
      f.flightNumber,
      String(f.totalSeats),
      String(f.soldSeats),
      String(f.availableSeats),
      `EUR${f.adultPrice}`,
      `EUR${f.infantPrice}`,
    ];
    if (showBaggage) row.push(
      f.checkedBaggagePrice != null
        ? `EUR${f.checkedBaggagePrice}${f.checkedBaggageKg ? `/${f.checkedBaggageKg}kg` : ""}`
        : "-"
    );
    if (showGoogle) row.push(f.googlePrice != null ? `EUR${f.googlePrice}` : "-");
    row.push(statusLabel[f.status] || f.status);
    return row;
  });

  // Stilet e kolonave — indekset zhvendosen kur fshihen Bag/Google
  const colStyles: Record<number, object> = {
    0: { cellWidth: 26 },
    1: { cellWidth: 30 },
    2: { cellWidth: 16, fontStyle: "bold" },
    3: { cellWidth: 11, halign: "center" },
    4: { cellWidth: 11, halign: "center", textColor: [220, 38, 38] },
    5: { cellWidth: 11, halign: "center", textColor: [22, 163, 74], fontStyle: "bold" },
    6: { cellWidth: 16, halign: "right" },
    7: { cellWidth: 14, halign: "right" },
  };
  let ci = 8;
  if (showBaggage) { colStyles[ci] = { cellWidth: 18, halign: "right" }; ci++; }
  if (showGoogle)  { colStyles[ci] = { cellWidth: 15, halign: "right", textColor: [29, 106, 173] }; ci++; }
  colStyles[ci] = { cellWidth: 18, halign: "center" };

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
    columnStyles: colStyles as any,
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.text(`Kings Travel — Flight Management System`, margin, 290);
    doc.text(`Faqe ${i} / ${pageCount}`, margin + usable, 290, { align: "right" });
  }

  return doc;
}

function CitizenPriceCell({ flight, onSaved }: { flight: any; onSaved: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  const effective: number | null = flight.citizenPrice ?? null;
  const def: number | null = flight.citizenPriceDefault ?? null;
  const isManual = flight.citizenPriceSource === "manual";

  const start = () => {
    setVal(effective != null ? String(Math.round(effective)) : "");
    setEditing(true);
  };

  const submit = async (clear: boolean) => {
    if (!clear && val !== "" && (isNaN(Number(val)) || Number(val) < 0)) {
      toast({ title: "Çmim i pavlefshëm", description: "Vendos një numër ≥ 0.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = clear || val === "" ? { citizenPrice: null } : { citizenPrice: Math.round(Number(val)) };
      const res = await fetch(`${API_BASE}/flights/${flight.id}/citizen-price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Ruajtja dështoi"));
      setEditing(false);
      onSaved();
      toast({ title: clear ? "Çmimi Offline u kthye në Auto" : "Çmimi Offline u ruajt" });
    } catch (e: any) {
      toast({ title: "Ruajtja dështoi", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-muted-foreground text-xs">€</span>
        <input
          type="number" step="1" min="0" autoFocus value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(false); }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
          placeholder={def != null ? String(def) : "0"}
          className="w-20 rounded border px-1.5 py-0.5 text-sm text-right"
        />
        <button onClick={() => submit(false)} disabled={saving} title="Ruaj"
          className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => setEditing(false)} disabled={saving} title="Anulo"
          className="p-1 rounded hover:bg-muted text-muted-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="font-semibold tabular-nums">{effective != null ? `€${fmtM(effective)}` : "—"}</span>
      <span
        title={isManual ? "Çmim i vendosur manualisht (override)" : `Çmim automatik (bazë + markup) = €${def != null ? fmtM(def) : "0"}`}
        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${isManual ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
        {isManual ? "Manual" : "Auto"}
      </span>
      <button onClick={start} title="Ndrysho çmimin Offline"
        className="p-1 rounded hover:bg-muted text-blue-500 hover:text-blue-600">
        <Edit className="h-3.5 w-3.5" />
      </button>
      {isManual && (
        <button onClick={() => submit(true)} disabled={saving} title="Hiq override — kthe te Auto"
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-rose-600">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

export default function CitizenFlightsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Routes for dynamic airport filtering
  const [allRoutes, setAllRoutes] = useState<{ from: string; to: string }[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/routes`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setAllRoutes)
      .catch(() => {});
  }, []);

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

  // Kufiri i konfirmuar (orë para nisjes) — për të treguar orën e mbylljes te badge ⭐
  const { data: confirmedCutoffData } = useQuery<{ hours: number }>({
    queryKey: ["settings", "confirmed-sell-cutoff"],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/settings/confirmed-sell-cutoff`, { credentials: "include" });
      if (!r.ok) return { hours: 4 };
      return r.json();
    },
  });
  const confirmedCutoffHours: number = confirmedCutoffData?.hours ?? 4;
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
  // Flight-price range (server-side: adultPrice). Google-price range (client-side: per-row prices).
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minGooglePrice, setMinGooglePrice] = useState("");
  const [maxGooglePrice, setMaxGooglePrice] = useState("");
  const [tab, setTab] = useState<"all" | "pending" | "bookable" | "soldout" | "past" | "soon" | "alerts" | "confirmed" | "duplicates" | "booked">("bookable");
  const [hasBookings, setHasBookings] = useState(false);
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
  const [bulkCitizenOpen, setBulkCitizenOpen] = useState(false);
  const [bulkCitizenValue, setBulkCitizenValue] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [sortKey, setSortKey] = useState<"route" | "date" | "flightNo" | "seats" | "price" | "citizen" | "baggage" | "google" | "alert">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── Configurable visible columns (persisted; baggage hidden by default) ──
  const COLUMN_DEFS = [
    { key: "route",    label: "Route" },
    { key: "date",     label: "Date" },
    { key: "flightNo", label: "Flight Number" },
    { key: "seats",    label: "Number of Seats" },
    { key: "price",    label: "One Way" },
    { key: "citizen",  label: "Çmimi Offline" },
    { key: "baggage",  label: "Bagazh" },
    { key: "google",   label: "Google" },
  ] as const;
  type ColKey = (typeof COLUMN_DEFS)[number]["key"];
  const COL_STORAGE_KEY = "citizenFlights.visibleColumns.v1";
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(() => {
    const defaults: Record<ColKey, boolean> = {
      route: true, date: true, flightNo: true, seats: true, price: true, citizen: true, baggage: false, google: true,
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
  const tableColSpan = 1 + COLUMN_DEFS.filter(c => visibleCols[c.key]).length + 1;
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
  // The server doesn't sort by Google price OR Citizen price (Citizen = base+markup
  // or a per-flight override, re-sorted on the client); keep date order server-side and
  // pin direction so toggling asc/desc doesn't trigger a pointless refetch.
  const serverSortKey = (sortKey === "google" || sortKey === "citizen") ? "date" : sortKey;
  const serverSortDir = (sortKey === "google" || sortKey === "citizen") ? "asc" : sortDir;

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
    all: "all", bookable: "open", pending: "closed", soldout: "soldout", past: "all", soon: "all", alerts: "all", confirmed: "all", duplicates: "all", booked: "all",
  };
  // An explicit dropdown status selection wins over the tab's default status, so
  // picking e.g. "Sold Out" while on the Bookable tab actually filters to sold-out
  // flights instead of being silently ignored.
  const effectiveStatus = statusFilter !== "all" ? statusFilter : tabStatus[tab] !== "all" ? tabStatus[tab] : undefined;
  // Default view shows upcoming flights (by date); "past" shows only past flights;
  // "Njoftime" uses "future" so already-departed flights (by date+time) drop off.
  // "soon" shows only flights within the next N days (N from settings).
  const timeframe = tab === "soon" ? "soon" : tab === "past" ? "past" : (tab === "alerts" || tab === "duplicates" || tab === "confirmed" || tab === "booked") ? "future" : "upcoming";
  // "Dublikate" tab → only flights that are duplicates of another (route+date+time+flightNo).
  const duplicatesOnly = tab === "duplicates";
  // "Konfirmuar" tab → only flights whose Njoftime alert was acknowledged (Confirm).
  const confirmedOnly = tab === "confirmed";
  // "Të Konfirmuara" tab → only flights that have at least one confirmed booking.
  const bookedOnly = tab === "booked";
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
  useEffect(() => { setPage(1); }, [effectiveStatus, timeframe, startDate, endDate, hasBookings, selectedDays, paxAdults, paxChildren, fromCities, toCities, minGooglePrice, maxGooglePrice, effectiveAlert, duplicatesOnly, confirmedOnly, bookedOnly]);

  // Server-side query: pagination + filtering + sorting
  const flightsQueryKey = ["flights-paginated", fromCities.join(","), toCities.join(","), debouncedAirlineFlightNo, startDate, endDate, effectiveStatus, timeframe, hasBookings, selectedDays.join(","), page, perPage, serverSortKey, serverSortDir, debouncedMinPrice, debouncedMaxPrice, effectiveAlert, duplicatesOnly, confirmedOnly, bookedOnly, soonDays];

  const { data: flightsResponse, isLoading, isFetching } = useQuery({
    queryKey: flightsQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromCities.length > 0)    params.set("fromCity",    fromCities.join(","));
      if (toCities.length > 0)      params.set("toCity",      toCities.join(","));
      if (debouncedAirlineFlightNo) params.set("search",      debouncedAirlineFlightNo);
      if (startDate)                params.set("startDate",   startDate);
      if (endDate)                  params.set("endDate",     endDate);
      if (effectiveStatus)          params.set("status",      effectiveStatus);
      params.set("timeframe", timeframe);
      if (hasBookings)              params.set("hasBookings", "true");
      if (selectedDays.length > 0)  params.set("days", selectedDays.join(","));
      if (debouncedMinPrice)        params.set("minPrice", debouncedMinPrice);
      if (debouncedMaxPrice)        params.set("maxPrice", debouncedMaxPrice);
      if (effectiveAlert === "any") params.set("anyAlert", "true");
      else if (effectiveAlert !== "all") params.set("scheduleAlert", effectiveAlert);
      if (duplicatesOnly)           params.set("duplicates", "true");
      if (confirmedOnly)            params.set("confirmed", "true");
      if (bookedOnly)               params.set("bookedConfirmed", "true");
      params.set("page",    String(page));
      params.set("limit",   String(perPage));
      params.set("sortKey", serverSortKey);
      params.set("sortDir", serverSortDir);
      const resp = await fetch(`${API_BASE}/flights?${params}`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to fetch flights");
      return resp.json();
    },
    placeholderData: (prev: any) => prev,
    staleTime: 10_000,
  });

  const flights: any[]           = flightsResponse?.data       ?? [];
  const total: number            = flightsResponse?.total      ?? 0;
  const totalPages: number       = flightsResponse?.totalPages ?? 1;
  const serverCounts             = flightsResponse?.counts     ?? {};

  const counts = {
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
  };

  const createFlight = useCreateFlight();
  const toggleSales  = useToggleFlightSales();
  const duplicate    = useDuplicateFlight();
  const deleteFlight = useDeleteFlight();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["flights-paginated"] });

  const resolveSavedGoogle = (f: any): number | null => {
    if (bulkError || f.status === "soldout") return null;
    const state = queryClient.getQueryState<GooglePriceValue>([
      "google-flight-price", f.fromAirport || f.fromCity, f.toAirport || f.toCity,
      f.departureDate, f.flightNumber,
    ]);
    return resolveGooglePriceDisplay(state?.data, state?.status === "error").price;
  };

  // Client-side filter: seats (days are server-side) + Google-price range.
  // Google prices are fetched per-row on the client (googlePrices state), so they can
  // only be filtered here; rows whose Google price hasn't resolved are hidden while a
  // Google-price filter is active. Use "Të gjitha" page size to apply it across all flights.
  const filteredFlights = useMemo(() => {
    const minSeats = paxAdults + paxChildren;
    const gMin = minGooglePrice.trim() ? parseFloat(minGooglePrice) : null;
    const gMax = maxGooglePrice.trim() ? parseFloat(maxGooglePrice) : null;
    const gActive = (gMin != null && !Number.isNaN(gMin)) || (gMax != null && !Number.isNaN(gMax));
    if (minSeats === 0 && !gActive) return flights;
    return flights.filter((f: any) => {
      if (minSeats > 0 && (f.availableSeats ?? 0) < minSeats) return false;
      if (gActive) {
        const gp = resolveSavedGoogle(f);
        if (gp == null) return false;
        if (gMin != null && !Number.isNaN(gMin) && gp < gMin) return false;
        if (gMax != null && !Number.isNaN(gMax) && gp > gMax) return false;
      }
      return true;
    });
  }, [flights, paxAdults, paxChildren, minGooglePrice, maxGooglePrice, googlePrices, bulkError]);

  // Whether a Google-price-dependent feature is active (price filter or Google sort).
  // Keep a ref in sync so reportGooglePrice can cheaply skip pointless state updates.
  const googleFeatureActive =
    (minGooglePrice.trim() !== "" && !Number.isNaN(parseFloat(minGooglePrice))) ||
    (maxGooglePrice.trim() !== "" && !Number.isNaN(parseFloat(maxGooglePrice))) ||
    sortKey === "google";
  googleFeatureActiveRef.current = googleFeatureActive;

  // Include rows hidden by a range filter and react to cache errors/stale changes.
  // Batch cache notifications rather than collecting every row unconditionally.
  useEffect(() => {
    if (!googleFeatureActive) return;
    let disposed = false;
    let queued = false;
    const hydrate = () => {
      if (disposed) return;
      const next: Record<number, number | null> = {};
      for (const f of flights) next[f.id] = resolveSavedGoogle(f);
      setGooglePrices(prev =>
        Object.keys(next).every(id => prev[Number(id)] === next[Number(id)])
          ? prev : { ...prev, ...next });
    };
    hydrate();
    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      if (event.query.queryKey[0] !== "google-flight-price" || queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; hydrate(); });
    });
    return () => { disposed = true; unsubscribe(); };
  }, [googleFeatureActive, flights, queryClient, bulkError]);

  const handleCreate = (values: FlightForm) => {
    createFlight.mutate({ data: values }, {
      onSuccess: () => { toast({ title: "Flight created" }); invalidate(); setIsAddOpen(false); },
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

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  // Progresi i kontrollit Google në sfond: {done,total} grupe rrugë+datë.
  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number } | null>(null);

  // Ndjek punën e sfondit me polling derisa running=false (i lidhur me startedAt
  // që të mos "kapet" pas një runi tjetër). Kthen gjendjen finale ose null.
  const pollGoogleCheck = async (startedAt: string | null): Promise<any> => {
    let failures = 0;
    for (;;) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const r = await fetch(`${API_BASE}/flights/check-google-progress`, { credentials: "include" });
        if (!r.ok) { if (++failures > 5) throw new Error("progress"); continue; }
        failures = 0;
        const p = await r.json();
        if (startedAt && p.startedAt && p.startedAt !== startedAt) return null;
        setCheckProgress({ done: p.done ?? 0, total: p.total ?? 0 });
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
      // Puna nisi në SFOND — ndiq progresin derisa të mbarojë.
      setCheckProgress({ done: 0, total: data.totalGroups ?? 0 });
      const final = await pollGoogleCheck(data.startedAt ?? null);
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
      toast({ title: `✅ ${count} fluturime u fshinë` });
      setSelectedIds(new Set());
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
      const doc = generateFlightReportPdf(flights, { showBaggage: visibleCols.baggage, showGoogle: visibleCols.google });
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
    setStartDate(""); setEndDate(""); setStatusFilter("all"); setAlertFilter("all");
    setHasBookings(false); setSelectedDays([]);
    setPaxAdults(0); setPaxChildren(0); setPaxInfants(0);
    setMinPrice(""); setMaxPrice(""); setMinGooglePrice(""); setMaxGooglePrice("");
    setPage(1);
  };

  // Server handles sort+pagination; client only does day-of-week + pax filter on current page.
  // Google-price sorting is client-side (prices are fetched per row), so it reorders the current page only.
  const paginatedFlights = useMemo(() => {
    if (sortKey === "citizen") {
      const dir = sortDir === "asc" ? 1 : -1;
      return [...filteredFlights].sort((a: any, b: any) => {
        const pa = a.citizenPrice ?? null;
        const pb = b.citizenPrice ?? null;
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;   // rows without a Citizen price always go last
        if (pb == null) return -1;
        return (pa - pb) * dir;
      });
    }
    if (sortKey !== "google") return filteredFlights;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredFlights].sort((a: any, b: any) => {
      const pa = resolveSavedGoogle(a);
      const pb = resolveSavedGoogle(b);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;   // rows without a Google price always go last
      if (pb == null) return -1;
      return (pa - pb) * dir;
    });
  }, [filteredFlights, sortKey, sortDir, googlePrices, bulkError]);

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

  const handleSelectAllFlights = async () => {
    setSelectingAll(true);
    try {
      const params = new URLSearchParams();
      if (fromCities.length > 0) params.set("fromCity", fromCities.join(","));
      if (toCities.length > 0)  params.set("toCity",   toCities.join(","));
      if (airlineFlightNo) params.set("search", airlineFlightNo);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (effectiveStatus) params.set("status", effectiveStatus);
      params.set("timeframe", timeframe);
      if (hasBookings) params.set("hasBookings", "true");
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (effectiveAlert === "any") params.set("anyAlert", "true");
      else if (effectiveAlert !== "all") params.set("scheduleAlert", effectiveAlert);
      if (duplicatesOnly) params.set("duplicates", "true");
      if (confirmedOnly) params.set("confirmed", "true");
      if (bookedOnly) params.set("bookedConfirmed", "true");
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

  // Bulk-set the Offline price (override) for all selected flights. Empty value = clear
  // the override on every selected flight (revert back to Auto = base + markup).
  const handleBulkCitizen = async () => {
    const raw = bulkCitizenValue.trim();
    const clear = raw === "";
    const num = clear ? null : Math.round(Number(raw));
    if (!clear && (num == null || Number.isNaN(num) || num < 0)) {
      toast({ title: "Vendos një çmim të vlefshëm (ose lëre bosh për Auto)", variant: "destructive" });
      return;
    }
    setBulkSaving(true);
    try {
      const ids = [...selectedIds];
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const res = await fetch(`${API_BASE}/flights/${id}/citizen-price`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ citizenPrice: num }),
          });
          return res.ok;
        } catch { return false; }
      }));
      const ok = results.filter(Boolean).length;
      const failed = results.length - ok;
      invalidate();
      if (failed === 0) {
        toast({ title: clear
          ? `Çmimi Offline u kthye në Auto për ${ok} fluturime`
          : `Çmimi Offline u ndryshua për ${ok} fluturime` });
        setBulkCitizenOpen(false);
        setBulkCitizenValue("");
        setSelectedIds(new Set());
      } else {
        // Keep dialog + selection open so the admin can retry the ones that failed.
        toast({ title: `${ok} u ndryshuan, ${failed} dështuan`, variant: "destructive" });
      }
    } catch {
      toast({ title: "Gabim gjatë ndryshimit", variant: "destructive" });
    } finally { setBulkSaving(false); }
  };

  // Bulk "Kthe në Auto": clears the manual offline price (citizen_price = null)
  // for every selected flight, so each reverts to the auto-calculated offline
  // price (base price + global markup). Reuses the same per-flight endpoint as
  // the manual flow, just sending citizenPrice: null.
  const handleBulkCitizenAuto = async () => {
    if (!selectedIds.size) return;
    if (!(await confirmDialog({
      title: `Kthe ${selectedIds.size} fluturime në Çmim Offline Auto?`,
      text: "Çmimi Offline manual do të hiqet dhe do të llogaritet automatikisht (çmimi bazë + markup). Ky veprim ndryshon vetëm fluturimet e zgjedhura.",
      confirmText: "Po, kthe në Auto",
      cancelText: "Anulo",
    }))) return;
    setBulkSaving(true);
    try {
      const ids = [...selectedIds];
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const res = await fetch(`${API_BASE}/flights/${id}/citizen-price`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ citizenPrice: null }),
          });
          return res.ok;
        } catch { return false; }
      }));
      const ok = results.filter(Boolean).length;
      const failed = results.length - ok;
      invalidate();
      if (failed === 0) {
        toast({ title: `Çmimi Offline u kthye në Auto për ${ok} fluturime` });
        setSelectedIds(new Set());
      } else {
        toast({ title: `${ok} u kthyen në Auto, ${failed} dështuan`, variant: "destructive" });
      }
    } catch {
      toast({ title: "Gabim gjatë ndryshimit", variant: "destructive" });
    } finally { setBulkSaving(false); }
  };

  const hasActiveFilters = fromCities.length > 0 || toCities.length > 0 || airlineFlightNo || startDate || endDate ||
    statusFilter !== "all" || alertFilter !== "all" || hasBookings || selectedDays.length > 0 ||
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
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Offline Flights</h1>
          <p className="text-muted-foreground text-xs md:text-sm hidden sm:block">Çmimet offline që dërgohen (bazë + markup ose override manual)</p>
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
            value={fromCities}
            onChange={setFromCities}
            placeholder="Nisja (të gjitha)"
            icon={<PlaneTakeoff className="h-3.5 w-3.5" />}
          />
          {/* Destination — multi-select with search */}
          <MultiCitySelect
            options={filteredToCodes}
            value={toCities}
            onChange={setToCities}
            placeholder="Mberritja (të gjitha)"
            icon={<PlaneLanding className="h-3.5 w-3.5" />}
          />
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
              <div className="flex flex-col">
                {COLUMN_DEFS.map(col => (
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
          {/* Seats & Bookings chip */}
          <button
            onClick={() => setHasBookings(v => !v)}
            className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-sm transition-colors ${
              hasBookings ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Seats & Bookings
            {hasBookings && <X className="h-3 w-3 ml-0.5" />}
          </button>
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
      <div className="flex items-center gap-0 border-b mt-4">
        {(["all", "pending", "bookable", "soldout", "past", "soon", "alerts", "booked", ...(counts.duplicates > 0 ? ["duplicates"] as const : [])] as const).map((t: "all" | "pending" | "bookable" | "soldout" | "past" | "soon" | "alerts" | "confirmed" | "duplicates" | "booked") => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize inline-flex items-center gap-1.5 ${
              tab === t
                ? t === "alerts" ? "border-red-500 text-red-600" : t === "soon" ? "border-amber-500 text-amber-600" : t === "confirmed" ? "border-green-500 text-green-600" : t === "duplicates" ? "border-rose-500 text-rose-600" : t === "booked" ? "border-emerald-500 text-emerald-600" : "border-primary text-primary"
                : t === "alerts" && counts.alerts > 0
                  ? "border-transparent text-red-600/80 hover:text-red-600"
                  : t === "soon"
                    ? "border-transparent text-amber-600/80 hover:text-amber-600"
                    : t === "confirmed"
                      ? "border-transparent text-green-600/80 hover:text-green-600"
                      : t === "duplicates"
                        ? "border-transparent text-rose-600/80 hover:text-rose-600"
                        : t === "booked"
                          ? "border-transparent text-emerald-600/80 hover:text-emerald-600"
                          : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "alerts" && <AlertTriangle className="h-3.5 w-3.5" />}
            {t === "soon" && <Clock className="h-3.5 w-3.5" />}
            {t === "confirmed" && <Check className="h-3.5 w-3.5" />}
            {t === "duplicates" && <Copy className="h-3.5 w-3.5" />}
            {t === "booked" && <Check className="h-3.5 w-3.5" />}
            {t === "bookable" ? "Bookable" : t === "pending" ? "Pending" : t === "soldout" ? "Sold out" : t === "past" ? "Past Flights" : t === "soon" ? `Të Aferta (${soonDays}d)` : t === "alerts" ? "Njoftime" : t === "confirmed" ? "Konfirmuar" : t === "duplicates" ? "Dublikate" : t === "booked" ? "Të Konfirmuara" : "All"}
            <span className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full ${
              t === "alerts" && counts.alerts > 0 ? "bg-red-100 text-red-700" : t === "soon" ? "bg-amber-100 text-amber-700" : t === "confirmed" ? "bg-green-100 text-green-700" : t === "duplicates" ? "bg-rose-100 text-rose-700" : t === "booked" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
            }`}>
              {counts[t]}
            </span>
          </button>
        ))}
        {hasBookings && (
          <div className="ml-3 flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full border border-blue-200">
            with bookings
            <button onClick={() => setHasBookings(false)}><X className="h-3 w-3" /></button>
          </div>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
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
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setBulkPriceOpen(true)}>
              <Tag className="h-3.5 w-3.5" /> Ndrysho Çmimin
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setBulkStatusOpen(true)}>
              <ToggleLeft className="h-3.5 w-3.5" /> Ndrysho Statusin
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => { setBulkSeatsValue(""); setBulkSeatsOpen(true); }}>
              <Users className="h-3.5 w-3.5" /> Ndrysho Vendet
            </Button>
            {isAdmin && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={() => { setBulkCitizenValue(""); setBulkCitizenOpen(true); }}>
                <Globe className="h-3.5 w-3.5" /> Ndrysho Çmimet Offline
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50" onClick={handleBulkCitizenAuto} disabled={bulkSaving}>
                {bulkSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Kthe në Auto
              </Button>
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
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive hover:text-white" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Fshij
            </Button>
            <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:text-foreground ml-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-xl overflow-x-auto mt-0 border-t-0 rounded-tl-none rounded-tr-none">
        {/* w-auto: kolonat ngjishen sipas përmbajtjes — pa hapësira të mëdha
            mes Route/Date; hapësira e lirë mbetet bosh anash (faqja punon
            edhe në ekran/dritare të vogël). */}
        <table className="w-auto min-w-[700px] max-w-full text-sm">
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
              {colVisible("citizen") && (
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap" title="Çmimi offline">
                  <button
                    onClick={() => handleSort("citizen")}
                    className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === "citizen" ? "text-foreground" : ""}`}
                  >
                    Çmimi Offline
                    <span className="flex flex-col leading-[0] ml-0.5">
                      <svg className={`h-2 w-2 ${sortKey === "citizen" && sortDir === "asc" ? "text-primary" : "text-muted-foreground/40"}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 0L8 4H0L4 0z"/></svg>
                      <svg className={`h-2 w-2 ${sortKey === "citizen" && sortDir === "desc" ? "text-primary" : "text-muted-foreground/40"}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 4L0 0H8L4 4z"/></svg>
                    </span>
                  </button>
                </th>
              )}
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
                <tr key={f.id} onMouseEnter={() => prefetchFlight(f.id)} className={`border-b transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/10" : f.isConfirmed ? "bg-emerald-50 hover:bg-emerald-100" : "hover:bg-muted/30"}`}>
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
                          <span title="Fluturim i Konfirmuar" className="ml-1.5 inline-flex items-center gap-1 align-middle rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-300 shadow-sm">
                            <span className="inline-flex items-center justify-center bg-black rounded w-3.5 h-3.5 text-[10px] leading-none flex-shrink-0">⭐</span> Konfirmuar
                          </span>
                        )}
                        {f.isDuplicate && (
                          <span title="Fluturim i dublikuar — destinacion, datë, orar dhe kod fluturimi i njëjtë me një tjetër" className="ml-1.5 inline-flex items-center gap-1 align-middle rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-300 shadow-sm">
                            <Copy className="h-3 w-3" /> Dublikuar
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
                        {f.scheduleAlert === "not_found" && (
                          <span
                            title={f.scheduleAlertDetail || "Nuk gjendet në Google Flights (mundësi anulimi)"}
                            className="ml-2 inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 align-middle"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            S'gjendet · mundësi anulimi
                          </span>
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
                    </div>
                  </td>
                  )}
                  {/* Price */}
                  {colVisible("price") && (
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">
                    €{fmtM(f.adultPrice)}
                  </td>
                  )}
                  {/* Çmimi Offline */}
                  {colVisible("citizen") && (
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <CitizenPriceCell flight={f} onSaved={invalidate} />
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
                      skip={f.status === "soldout"}
                    />
                  </td>
                  )}
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
        </table>
      </div>

      {/* Pagination */}
      {!isLoading && total > 0 && (
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
              {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} nga {total}
            </span>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 rounded border disabled:opacity-40 hover:bg-muted transition-colors">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
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

      {/* Bulk Offline Price Dialog */}
      <Dialog open={bulkCitizenOpen} onOpenChange={setBulkCitizenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-emerald-600" />
              Ndrysho Çmimet Offline — {selectedIds.size} fluturime
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Vendos çmimin Offline (override) për të rriturin për të gjitha fluturimet e zgjedhura. Çmimi i foshnjës nuk preket.
              Lëre bosh për t'i kthyer të gjitha në <strong>Auto</strong> (bazë + markup).
            </p>
            <div className="flex items-center gap-1">
              <span className="text-emerald-600 font-bold text-lg">€</span>
              <Input
                type="number" min="0" step="1" placeholder="p.sh. 215.50 (bosh = Auto)"
                value={bulkCitizenValue}
                onChange={e => setBulkCitizenValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !bulkSaving && handleBulkCitizen()}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkCitizenOpen(false)} disabled={bulkSaving}>Anulo</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleBulkCitizen} disabled={bulkSaving}>
                {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {bulkCitizenValue.trim() === "" ? "Kthe në Auto" : "Ndrysho"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <FlightFormDialog
        open={isAddOpen} onOpenChange={setIsAddOpen}
        title="Add Flight" onSave={handleCreate}
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

// Small seat icon component
function SeatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      className={`h-4 w-4 ${className || ""}`}>
      <path d="M6 2v8a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 14h12v6H6z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
