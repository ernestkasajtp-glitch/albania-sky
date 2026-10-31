import { useState, useEffect } from "react";
import { deriveFlightArrivalDate } from "@/lib/flightArrivalDate";
import { parseGoogleScheduleAlert } from "@/lib/googleScheduleAlert";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fmtM, fmtAmPm } from "@/lib/utils";
import { FlightActivityHistory } from "./FlightActivityHistory";
import { offlineText } from "@/lib/flightActivityDisplay";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  useToggleFlightSales, useUpdateFlight,
  useGetFlight, useListBookings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import FlightNotes from "@/components/FlightNotes";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  X, Loader2, Plane, Clock, History, Minus, Plus, Luggage, Ticket, ShieldCheck, Globe, StickyNote,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { GooglePriceAdminUpdater } from "@/components/GooglePriceAdminUpdater";
import { GoogleMonitoringToggle } from "@/components/GoogleMonitoringToggle";
import { useAgencyGroups } from "@/components/AgencyGroups";
import { FlightGroupBadges } from "@/components/FlightGroupBadges";
import { FlightDiscountEditor } from "@/components/FlightDiscountEditor";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

const flightSchema = z.object({
  airline: z.string().min(1),
  flightNumber: z.string().min(1),
  fromCity: z.string().min(1),
  toCity: z.string().min(1),
  departureDate: z.string().min(1),
  departureTime: z.string().min(1),
  arrivalDate: z.string().min(1),
  arrivalTime: z.string().min(1),
  adultPrice: z.coerce.number().min(0),
  childPrice: z.coerce.number().min(0),
  infantPrice: z.coerce.number().min(0),
  tax: z.coerce.number().min(0),
  totalSeats: z.coerce.number().min(0),
  status: z.string().default("open"),
  isConfirmed: z.boolean().default(false),
  excludeFromGoogleRule: z.boolean().default(false),
  externalSalesBlocked: z.boolean().default(false),
  showInBookingEngine: z.boolean().default(true),
  checkedBaggageCount: z.coerce.number().min(0).default(0),
  checkedBaggageKg: z.coerce.number().min(0).default(0),
  checkedBaggagePrice: z.coerce.number().min(0).default(0),
  sellCutoffHours: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().min(0).nullable(),
  ).default(null),
  // Çmim neto informativ (vetëm admin) — s'ndikon askund, vetëm shfaqet te lista.
  netPrice: z.preprocess(
    (v) => (v === "" || v == null ? null : Math.round(Number(v))),
    z.number().min(0).nullable(),
  ).default(null),
});
type FlightForm = z.infer<typeof flightSchema>;

// Datë ISO → "dd.MM.yyyy" për shfaqje në dialogë (fallback: teksti origjinal).
function fmtDateSq(iso: string): string {
  try { return format(parseISO(iso), "dd.MM.yyyy"); } catch { return iso; }
}

// Tekst shqip për çdo ngjarje të historikut të vendeve; "mbeten X" = të lira pas ngjarjes.
function seatEventLabel(h: {
  eventType: string; seats: number; oldTotal: number | null;
  totalSeats: number; soldSeats: number;
}): string {
  const left = Math.max(0, h.totalSeats - h.soldSeats);
  const vende = (n: number) => (n === 1 ? "1 vend" : `${n} vende`);
  switch (h.eventType) {
    case "created":
      return `U vendos numri i vendeve: ${h.seats}`;
    case "total_changed":
      return `Ndryshoi vendet nga ${h.oldTotal ?? "—"} në ${h.seats} — mbeten ${left} të lira`;
    case "sold":
      return `${h.seats === 1 ? "U shit" : "U shitën"} ${vende(h.seats)} — mbeten ${left} të lira`;
    case "cancelled":
      return `${h.seats === 1 ? "U anulua" : "U anuluan"} ${vende(h.seats)} — mbeten ${left} të lira`;
    case "restored":
      return `${h.seats === 1 ? "U rikthye" : "U rikthyen"} ${vende(h.seats)} — mbeten ${left} të lira`;
    default:
      return `${h.eventType} (${h.seats})`;
  }
}

// Çelës vizual on/off (stil "boarding pass") — përdoret për Konfirmuar/Blloko/Google.
function Toggle({ on, tone }: { on: boolean; tone: string }) {
  return (
    <span className={`relative inline-block w-9 h-5 rounded-full transition-colors shrink-0 ${on ? tone : "bg-stone-300"}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </span>
  );
}

// Titull sektori në trupin e biletës.
function StubTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8c7f5f] flex items-center gap-1.5">
      {icon}{children}
    </p>
  );
}

// Rreshti "Total · Shitur · Gjendje" pas çdo ngjarjeje të historikut të vendeve.
function SeatStateChips({ h }: { h: { totalSeats: number; soldSeats: number } }) {
  const left = Math.max(0, h.totalSeats - h.soldSeats);
  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-slate-50 text-slate-700 border-slate-200">Total {h.totalSeats}</span>
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Shitur {h.soldSeats}</span>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${left > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>Gjendje {left}</span>
    </div>
  );
}

// ── Historiku i detajuar i ndryshimeve — etiketa shqip ──────────────────────
const CH_FIELD_LABELS: Record<string, string> = {
  airline: "Linja ajrore", flightNumber: "Numri i fluturimit", fromCity: "Nga", toCity: "Deri",
  departureDate: "Data e nisjes", departureTime: "Ora e nisjes",
  arrivalDate: "Data e mbërritjes", arrivalTime: "Ora e mbërritjes",
  adultPrice: "Çmimi Adult", childPrice: "Çmimi Fëmijë", infantPrice: "Çmimi Infant",
  citizenPrice: "Çmimi Offline", netPrice: "Çmimi Neto", tax: "Taksa", totalSeats: "Vendet totale",
  soldSeats: "Vendet e zëna",
  status: "Statusi", isConfirmed: "I konfirmuar",
  cabinBaggageKg: "Bagazh kabine (kg)", checkedBaggageCount: "Bagazh — nr. çantash",
  checkedBaggageKg: "Bagazh i kontrolluar (kg)", checkedBaggagePrice: "Bagazh — çmimi",
  seatSelectionPrice: "Çmimi i zgjedhjes së vendit", priorityBoardingPrice: "Çmimi Priority Boarding",
  insurancePrice: "Çmimi i sigurimit", notes: "Shënime",
  sellCutoffHours: "Mbyllja para nisjes (orë)", showInBookingEngine: "Shfaq në Booking Engine",
  excludeFromGoogleRule: "Përjashtuar nga rregulli Google",
  externalSalesBlocked: "Shitjet e jashtme të bllokuara",
};
const CH_SOURCE_LABELS: Record<string, string> = {
  create: "Krijim", edit: "Editim", "sync-schedule": "Sinkronizim orari",
  duplicate: "Dublikim", bulk: "Ndryshim masiv", "toggle-sales": "Hap/Mbyll shitjet",
  "citizen-price": "Çmim Offline", extend: "Zgjatje kalendari", import: "Import Excel",
  auto: "Automatik",
};
const CH_SOURCE_STYLES: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700 border-emerald-200",
  edit: "bg-blue-50 text-blue-700 border-blue-200",
  "sync-schedule": "bg-violet-50 text-violet-700 border-violet-200",
  duplicate: "bg-amber-50 text-amber-700 border-amber-200",
  bulk: "bg-slate-100 text-slate-700 border-slate-200",
  "toggle-sales": "bg-orange-50 text-orange-700 border-orange-200",
  "citizen-price": "bg-teal-50 text-teal-700 border-teal-200",
  extend: "bg-cyan-50 text-cyan-700 border-cyan-200",
  import: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  auto: "bg-red-50 text-red-700 border-red-200",
};
// Etiketat/stilet e ngjarjeve të vendeve në kronologjinë e bashkuar të historikut.
const SEAT_EVENT_BADGES: Record<string, string> = {
  sold: "Shitje vendesh", cancelled: "Anulim vendesh", restored: "Rikthim vendesh",
};
const SEAT_EVENT_STYLES: Record<string, string> = {
  sold: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  restored: "bg-blue-50 text-blue-700 border-blue-200",
};
const CH_PRICE_FIELDS = new Set([
  "adultPrice", "childPrice", "infantPrice", "citizenPrice", "netPrice", "tax",
  "checkedBaggagePrice", "seatSelectionPrice", "priorityBoardingPrice", "insurancePrice",
]);
function chVal(field: string, v: string | null): string {
  if (v == null || v === "") return "—";
  if (field === "status") {
    return ({ open: "I Hapur", closed: "I Mbyllur", soldout: "Sold Out", cancelled: "Anuluar" } as Record<string, string>)[v] ?? v;
  }
  if (v === "true") return "Po";
  if (v === "false") return "Jo";
  if (CH_PRICE_FIELDS.has(field)) return `€${fmtM(v)}`;
  if (field === "departureDate" || field === "arrivalDate") {
    try { return format(parseISO(v), "dd.MM.yyyy"); } catch { return v; }
  }
  if (field === "departureTime" || field === "arrivalTime") return fmtAmPm(v);
  return v;
}

const defaultValues: FlightForm = {
  airline: "", flightNumber: "", fromCity: "", toCity: "",
  departureDate: format(new Date(), "yyyy-MM-dd"),
  departureTime: "10:00",
  arrivalDate: format(new Date(), "yyyy-MM-dd"),
  arrivalTime: "12:00",
  adultPrice: 0, childPrice: 0, infantPrice: 35, tax: 0,
  totalSeats: 20, status: "open", isConfirmed: false, excludeFromGoogleRule: false, externalSalesBlocked: false,
  showInBookingEngine: true,
  checkedBaggageCount: 0, checkedBaggageKg: 0, checkedBaggagePrice: 0,
  sellCutoffHours: null,
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

export function FlightSidePanel({ flightId, onClose, onUpdated, placeholderFlight }: {
  flightId: number; initialTab?: "details" | "edit"; onClose: () => void; onUpdated: () => void;
  placeholderFlight?: any;
}) {
  const { toast } = useToast();
  const { user } = useAdminAuth();
  const groupsQuery = useAgencyGroups(user?.role === "admin");
  const canBlockExternal = user?.role === "admin" || user?.role === "manager";
  const { data: flight, isLoading } = useGetFlight(flightId, {
    query: {
      enabled: !!flightId,
      staleTime: 5 * 60 * 1000,
      placeholderData: placeholderFlight ?? undefined,
    } as any,
  });
  const { data: bookings, isLoading: loadingBookings } = useListBookings({ flightId } as any, {
    query: {
      enabled: !!flightId,
      staleTime: 60 * 1000,
    } as any,
  });
  const updateFlight = useUpdateFlight();
  const toggleSalesMut = useToggleFlightSales();
  const { data: cutoffData } = useQuery<{ hours: number }>({
    queryKey: ["settings", "sell-cutoff"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/settings/sell-cutoff`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const cutoffHours: number | null = cutoffData?.hours ?? null;
  // Kufiri i veçantë për fluturimet e konfirmuara (⭐) — mbishkruan atë global/për-fluturim
  const { data: confirmedCutoffData } = useQuery<{ hours: number }>({
    queryKey: ["settings", "confirmed-sell-cutoff"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/settings/confirmed-sell-cutoff`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const confirmedCutoffHours: number = confirmedCutoffData?.hours ?? 4;
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  // Vendet e lira si tekst lokal — lejon shkrim me dorë; sinkronizohet me totalSeats.
  const [availInput, setAvailInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const queryClient = useQueryClient();
  const [applyingGoogleSchedule, setApplyingGoogleSchedule] = useState(false);
  async function applyGoogleSchedule() {
    const schedule = parseGoogleScheduleAlert((flight as any)?.scheduleAlertDetail || "");
    if (!schedule) {
      toast({ title: "Orari Google është i paplotë", description: "Përdor faqen 'Kontrolli i Orarit'.", variant: "destructive" });
      return;
    }
    setApplyingGoogleSchedule(true);
    try {
      const response = await fetch(`${API_BASE}/flights/${flightId}/sync-schedule`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Dështoi përditësimi");
      for (const key of ["departureDate", "departureTime", "arrivalDate", "arrivalTime"] as const) {
        form.setValue(key, schedule[key], { shouldDirty: false });
      }
      queryClient.invalidateQueries();
      onUpdated?.();
      toast({ title: "Orari u përditësua", description: `${schedule.departureDate} ${schedule.departureTime} → ${schedule.arrivalDate} ${schedule.arrivalTime}` });
    } catch (error) {
      toast({ title: "Gabim", description: error instanceof Error ? error.message : "Dështoi përditësimi", variant: "destructive" });
    } finally {
      setApplyingGoogleSchedule(false);
    }
  }

  const historyQuery = useQuery<Array<{
    id: number; oldAdultPrice: number | null; newAdultPrice: number;
    googlePrice: number | null; userName: string; userRole: string | null; createdAt: string;
  }>>({
    queryKey: ["flight-price-history", flightId],
    enabled: historyOpen,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/flights/${flightId}/price-history`, { credentials: "include" });
      if (!res.ok) throw new Error("Nuk u mor dot historiku.");
      return res.json();
    },
  });

  const [seatHistoryOpen, setSeatHistoryOpen] = useState(false);
  const [changeHistoryOpen, setChangeHistoryOpen] = useState(false);
  const seatHistoryQuery = useQuery<Array<{
    id: number; eventType: string; seats: number; oldTotal: number | null;
    totalSeats: number; soldSeats: number; userName: string; userRole: string | null;
    note: string | null; createdAt: string;
  }>>({
    queryKey: ["flight-seat-history", flightId],
    // Ngarkohet edhe kur hapet "Historiku i Ndryshimeve" — ngjarjet e vendeve
    // (shitje/anulime/rikthime) shfaqen të bashkuara në atë kronologji.
    enabled: seatHistoryOpen || changeHistoryOpen,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/flights/${flightId}/seat-history`, { credentials: "include" });
      if (!res.ok) throw new Error("Nuk u mor dot historiku.");
      return res.json();
    },
  });

  const changeHistoryQuery = useQuery<Array<{
    id: number; source: string;
    changes: { field: string; old: string | null; new: string | null }[];
    note: string | null; userName: string; userRole: string | null; createdAt: string;
  }>>({
    queryKey: ["flight-change-history", flightId],
    enabled: changeHistoryOpen,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/flights/${flightId}/change-history`, { credentials: "include" });
      if (!res.ok) throw new Error("Nuk u mor dot historiku.");
      return res.json();
    },
  });

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
      excludeFromGoogleRule: flight.excludeFromGoogleRule ?? false,
      externalSalesBlocked: flight.externalSalesBlocked ?? false,
      showInBookingEngine: (flight as any).showInBookingEngine ?? true,
      checkedBaggageCount: Number(flight.checkedBaggageCount ?? 0),
      checkedBaggageKg: Number(flight.checkedBaggageKg ?? 0),
      checkedBaggagePrice: Math.round(Number(flight.checkedBaggagePrice ?? 0)),
      sellCutoffHours: flight.sellCutoffHours ?? null,
      netPrice: (flight as any).netPrice != null ? Math.round(Number((flight as any).netPrice)) : null,
    });
  }, [flight?.id]);

  // Sinkronizo fushën "Available" edhe kur rifreskohen të dhënat e të njëjtit
  // fluturim (p.sh. pas zëvendësimit të placeholder-it) — por vetëm nëse
  // përdoruesi s'e ka prekur vetë numrin e vendeve.
  useEffect(() => {
    if (!flight) return;
    if (form.getFieldState("totalSeats").isDirty) return;
    form.setValue("totalSeats", flight.totalSeats, { shouldDirty: false });
    setAvailInput(String(Math.max(0, flight.totalSeats - flight.soldSeats)));
  }, [flight?.id, flight?.totalSeats, flight?.soldSeats]);

  // Ndrysho vendet e lira me +/- ose me shkrim; totalSeats = shitur + të lira.
  // Çdo shkrim i vlefshëm sinkronizon MENJËHERË totalSeats (jo vetëm në blur),
  // që submit-i me Enter dhe butonat +/- të mos lexojnë vlerë të vjetër.
  const handleAvailChange = (raw: string) => {
    const clean = raw.replace(/[^0-9]/g, "");
    setAvailInput(clean);
    if (!flight) return;
    const n = parseInt(clean, 10);
    if (!isNaN(n) && n >= 0) form.setValue("totalSeats", flight.soldSeats + n, { shouldDirty: true });
  };
  const changeAvail = (delta: number) => {
    if (!flight) return;
    const typed = parseInt(availInput, 10);
    const cur = !isNaN(typed) && typed >= 0
      ? typed
      : Math.max(0, Number(form.getValues("totalSeats")) - flight.soldSeats);
    const next = Math.max(0, cur + delta);
    form.setValue("totalSeats", flight.soldSeats + next, { shouldDirty: true });
    setAvailInput(String(next));
  };
  // Blur = vetëm normalizim (bosh/e pavlefshme → rikthe vlerën aktuale të formës).
  const handleAvailBlur = () => {
    if (!flight) return;
    const n = parseInt(availInput, 10);
    if (!isNaN(n) && n >= 0) {
      form.setValue("totalSeats", flight.soldSeats + n, { shouldDirty: true });
      setAvailInput(String(n));
    } else {
      setAvailInput(String(Math.max(0, Number(form.getValues("totalSeats")) - flight.soldSeats)));
    }
  };

  // Konfirmimi i ndryshimit të datës: serveri kthen 409 kur fluturimi ka
  // rezervime aktive dhe data e nisjes po ndryshohet — dialogu tregon sa
  // rezervime/pasagjerë zhvendosen bashkë me fluturimin para se të vazhdohet.
  const [dateConfirm, setDateConfirm] = useState<{
    values: FlightForm; bookings: number; passengers: number;
    oldDate: string; newDate: string;
  } | null>(null);

  const doSave = (values: FlightForm, confirmDateChange = false) => {
    const prevPrice = flight ? Number(flight.adultPrice) : null;
    updateFlight.mutate(
      { id: flightId, data: confirmDateChange ? { ...values, confirmDateChange: true } : values },
      {
        onSuccess: () => {
          setDateConfirm(null);
          toast({ title: "Fluturimi u ruajt" });
          if (prevPrice !== null && values.adultPrice !== prevPrice) {
            queryClient.invalidateQueries({ queryKey: ["flight-price-history", flightId] });
          }
          onUpdated();
          // "Ruaj dhe Dil" — pas ruajtjes së suksesshme paneli mbyllet.
          onClose();
        },
        onError: (e: any) => {
          const data = e?.data;
          if (e?.status === 409 && data?.code === "DATE_CHANGE_NEEDS_CONFIRM") {
            setDateConfirm({
              values,
              bookings: data.bookings ?? 0,
              passengers: data.passengers ?? 0,
              oldDate: data.oldDate ?? flight?.departureDate ?? "",
              newDate: data.newDate ?? values.departureDate,
            });
            return;
          }
          toast({ title: "Gabim", description: e.message, variant: "destructive" });
        },
      },
    );
  };

  const handleSave = (rawValues: FlightForm) => {
    const values: FlightForm = {
      ...rawValues,
      adultPrice: Math.round(rawValues.adultPrice),
      childPrice: Math.round(rawValues.childPrice),
      infantPrice: Math.round(rawValues.infantPrice),
      tax: Math.round(rawValues.tax),
      checkedBaggagePrice: Math.round(rawValues.checkedBaggagePrice ?? 0),
    };
    doSave(values);
  };

  const handleToggleSales = () => {
    if (!flight) return;
    const open = flight.status !== "open";
    toggleSalesMut.mutate({ id: flight.id, data: { open } }, {
      onSuccess: () => { toast({ title: open ? "Shitjet u hapën" : "Shitjet u mbyllën" }); onUpdated(); },
    });
  };

  if (isLoading || !flight) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[480px] h-[200px] bg-white rounded-2xl shadow-2xl flex items-center justify-center" onClick={e => e.stopPropagation()}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );

  const isOpen = flight.status === "open";
  const hasBookings = (bookings?.length ?? 0) > 0;

  const bkStatusStyle: Record<string, string> = {
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
    cancelled: "bg-red-50 text-red-600 border-red-200",
    open: "bg-green-50 text-green-700 border-green-200",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
    <div data-flight-side-panel className="w-[960px] max-w-[95vw] max-h-[92vh] bg-[#faf7ef] dark:bg-card rounded-[20px] shadow-[0_30px_60px_-20px_rgba(20,30,55,0.6)] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave, (errors) => {
          const first = Object.values(errors)[0] as any;
          toast({ title: "Plotëso fushat", description: first?.message || "Disa fusha nuk janë të vlefshme.", variant: "destructive" });
        })} className="flex flex-col h-full overflow-hidden">

          {/* ── Boarding-pass head ── */}
          <div className="bg-[#12244a] text-white relative flex-shrink-0">
            {/* teksturë e lehtë guilloché */}
            <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 9px)" }} />

            {/* shiriti i markës + veprimet */}
            <div className="relative flex items-center justify-between px-6 pt-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#e8b64c] flex items-center justify-center">
                  <Plane className="h-4 w-4 text-[#12244a]" />
                </div>
                <div>
                  <p className="text-[13px] font-extrabold tracking-[0.22em] leading-none">KINGS TRAVEL</p>
                  <p className="text-[9px] uppercase tracking-[0.3em] text-[#e8b64c] mt-0.5">Boarding Pass · Admin</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChangeHistoryOpen(true)}
                  title="Historiku i plotë i ndryshimeve të fluturimit (kush, kur, çfarë)"
                  className="inline-flex items-center gap-1.5 text-[11px] text-white/70 hover:text-white px-2.5 py-1 rounded-full border border-white/20 transition-colors"
                >
                  <History className="h-3 w-3" />
                  Historiku
                </button>
                <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${isOpen ? "bg-emerald-400/15 text-emerald-300 border-emerald-300/30" : "bg-orange-400/15 text-orange-300 border-orange-300/30"}`}>
                  {isOpen ? "Open" : flight.status === "soldout" ? "Sold Out" : "Closed"}
                </span>
                <button type="button" onClick={onClose} className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* route hero — qytetet + oraret editohen direkt këtu */}
            <div className="relative px-6 pt-4 pb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/50 mb-1">Nisja</p>
                <FormField control={form.control} name="fromCity" render={({ field }) => (
                  <input {...field}
                    className="bg-transparent outline-none text-3xl font-extrabold tracking-tight leading-none w-full border-b border-dashed border-transparent hover:border-white/25 focus:border-white/40" />
                )} />
                <div className="mt-2 flex items-baseline gap-2">
                  <FormField control={form.control} name="departureTime" render={({ field }) => (
                    <input {...field} type="time" onChange={e => { field.onChange(e); syncArrivalDate(form); }}
                      className="bg-transparent outline-none font-mono text-xl font-bold text-[#e8b64c] w-[92px] border-b border-dashed border-white/25 focus:border-[#e8b64c] [color-scheme:dark]" />
                  )} />
                  <span className="text-[11px] text-white/50 font-mono">{fmtDateSq(form.watch("departureDate"))}</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1.5 px-2">
                <FormField control={form.control} name="flightNumber" render={({ field }) => (
                  <input {...field}
                    className="font-mono text-[11px] font-bold bg-white/10 border border-white/20 px-2.5 py-1 rounded-md tracking-widest w-24 text-center outline-none focus:ring-1 focus:ring-[#e8b64c]/60" />
                )} />
                <div className="flex items-center gap-1 text-white/40">
                  <div className="w-10 h-px bg-white/25" />
                  <Plane className="h-4 w-4 text-[#e8b64c] rotate-90" />
                  <div className="w-10 h-px bg-white/25" />
                </div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-white/40" title="Kodi i fluturimit në sistem">Direkt · #{flight.id}</span>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/50 mb-1">Mbërritja</p>
                <FormField control={form.control} name="toCity" render={({ field }) => (
                  <input {...field}
                    className="bg-transparent outline-none text-3xl font-extrabold tracking-tight leading-none w-full text-right border-b border-dashed border-transparent hover:border-white/25 focus:border-white/40" />
                )} />
                <div className="mt-2 flex items-baseline gap-2 justify-end">
                  <span className="text-[11px] text-white/50 font-mono">{fmtDateSq(form.watch("arrivalDate"))}</span>
                  <FormField control={form.control} name="arrivalTime" render={({ field }) => (
                    <input {...field} type="time" onChange={e => { field.onChange(e); syncArrivalDate(form); }}
                      className="bg-transparent outline-none font-mono text-xl font-bold text-[#e8b64c] w-[92px] text-right border-b border-dashed border-white/25 focus:border-[#e8b64c] [color-scheme:dark]" />
                  )} />
                </div>
              </div>
            </div>

            {user?.role === "admin" && <div className="relative flex items-center gap-3 border-t border-white/15 px-6 py-2 text-xs">
              <span className="font-semibold uppercase tracking-wide text-white/70">Grupet</span>
              <FlightGroupBadges flight={flight} groups={groupsQuery.data} isLoading={groupsQuery.isPending} error={groupsQuery.error} />
            </div>}
            {/* data ribbon */}
            <div className="relative border-t border-white/15 bg-white/[0.04] px-6 py-2.5 grid grid-cols-3 gap-4">
              {(() => {
                const totalW = Number(form.watch("totalSeats")) || 0;
                const avail = Math.max(0, totalW - flight.soldSeats);
                return ([
                  ["Available", String(avail)],
                  ["Sold / Total", `${flight.soldSeats} / ${totalW}`],
                  ["Statusi", form.watch("isConfirmed") ? "⭐ I Konfirmuar" : isOpen ? "Open" : flight.status === "soldout" ? "Sold Out" : "Closed"],
                ] as const).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-white/40">{k}</p>
                    <p className="text-[12px] font-bold mt-0.5 truncate">{v}</p>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* ══════════ Trupi — 2 kolona fikse në letër kremi ══════════ */}
          <div className="flex-1 overflow-y-auto bg-[#faf7ef] dark:bg-card">
            <div className="px-6 pt-5 pb-4 grid grid-cols-1 md:grid-cols-[1fr_260px] gap-6">

              {/* ════ KOLONA MAJTAS — të gjitha fushat e editimit ════ */}
              <div className="space-y-4 min-w-0">

                {/* Operatori + Datat */}
                <div className="space-y-3">
                  <StubTitle icon={<Plane className="h-3 w-3" />}>Operatori i Fluturimit</StubTitle>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-10 h-10 rounded-lg bg-[#12244a] text-white flex items-center justify-center text-base font-extrabold shadow-sm shrink-0">
                      {(form.watch("airline") || flight.airline).charAt(0).toUpperCase()}
                    </div>
                    <FormField control={form.control} name="airline" render={({ field }) => (
                      <div className="min-w-[120px]">
                        <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-0.5">Linja ajrore</p>
                        <input {...field} className="font-bold text-sm text-stone-800 bg-transparent outline-none border-b-2 border-[#e5dfd0] focus:border-[#12244a] w-full pb-0.5" />
                      </div>
                    )} />
                    <div className="ml-auto rounded-xl border-2 border-[#12244a]/10 bg-white px-3 py-2 grid grid-cols-2 gap-3 shrink-0">
                      <FormField control={form.control} name="departureDate" render={({ field }) => (
                        <div className="text-center">
                          <p className="text-[9px] uppercase tracking-[0.15em] text-stone-400 font-semibold mb-0.5">Data e Nisjes</p>
                          <DatePicker value={field.value} onChange={v => {
                            field.onChange(v);
                            syncArrivalDate(form);
                          }} className="h-7 text-[11px] border-dashed w-[136px] px-2 gap-1.5" />
                        </div>
                      )} />
                      <FormField control={form.control} name="arrivalDate" render={({ field }) => {
                        const depDate = form.watch("departureDate");
                        return (
                          <div className="text-center">
                            <p className="text-[9px] uppercase tracking-[0.15em] text-stone-400 font-semibold mb-0.5">Data e Mbërritjes</p>
                            <DatePicker value={field.value} min={depDate || undefined} onChange={v => { field.onChange(v); syncArrivalDate(form); }} className="h-7 text-[11px] border-dashed w-[136px] px-2 gap-1.5" />
                          </div>
                        );
                      }} />
                    </div>
                  </div>
                  <button type="button" onClick={handleToggleSales} disabled={toggleSalesMut.isPending || hasBookings}
                    className={`w-full text-center text-[12px] py-1.5 rounded-lg border-2 border-dashed font-semibold transition-colors ${hasBookings ? "border-stone-300 text-stone-400 cursor-not-allowed" : isOpen ? "border-orange-300 text-orange-600 bg-orange-50/60 hover:bg-orange-100/70" : "border-emerald-300 text-emerald-600 bg-emerald-50/60 hover:bg-emerald-100/70"}`}>
                    {toggleSalesMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : isOpen ? "Mbyll shitjet ×" : "Hap shitjet ✓"}
                  </button>
                  {hasBookings && <p className="text-[10px] text-stone-400 text-center -mt-1.5">Fluturimet me rezervime nuk mund të ndryshohen</p>}
                </div>

                <div className="border-t border-[#e5dfd0]" />

                {/* Çmimet + Google */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <StubTitle icon={<Globe className="h-3 w-3" />}>Çmimet</StubTitle>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      title="Historiku i ndryshimit të çmimeve"
                      className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-600"
                    >
                      <History className="h-3 w-3" />Historiku
                    </button>
                  </div>
                  {canBlockExternal && !(flight as any).googleMonitoringDisabled && (flight as any).scheduleAlert === "time_changed" && (
                    <div className="flex items-center gap-2 rounded-md bg-orange-50 p-2 text-xs text-orange-800" data-testid={`schedule-alert-${flightId}`}>
                      <span>{(flight as any).scheduleAlertDetail}</span>
                      <Button type="button" size="sm" variant="outline" disabled={applyingGoogleSchedule}
                        onClick={applyGoogleSchedule} data-testid={`update-google-schedule-${flightId}`}>
                        {applyingGoogleSchedule ? <Loader2 className="h-3 w-3 animate-spin" /> : "Përditëso orarin"}
                      </Button>
                    </div>
                  )}
                  {!(flight as any).googleMonitoringDisabled && <GooglePriceAdminUpdater
                    flightId={flightId}
                    onUpdated={(r) => {
                      if (r?.ourPrice != null) {
                        form.setValue("adultPrice", r.ourPrice, { shouldDirty: false });
                        form.setValue("childPrice", r.ourPrice, { shouldDirty: false });
                      }
                      onUpdated?.();
                    }}
                  />}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2.5">
                    {/* Adult — editimi mbush automatikisht çmimin e kyçur të fëmijës */}
                    <FormField control={form.control} name="adultPrice" render={({ field }) => (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">Adult (one-way)</p>
                        <div className="flex items-baseline gap-1 border-b-2 border-[#e5dfd0] pb-1 focus-within:border-[#12244a]">
                          <input type="number" step="1" min="0" {...field}
                            onChange={e => {
                              field.onChange(e);
                              form.setValue("childPrice", e.target.value === "" ? 0 : Number(e.target.value), { shouldValidate: false });
                            }}
                            className="bg-transparent outline-none text-base font-bold text-stone-800 w-full font-mono" />
                          <span className="text-xs text-stone-400 font-semibold shrink-0">€</span>
                        </div>
                      </div>
                    )} />
                    {/* Fëmijë — i kyçur, gjithmonë = Adult */}
                    <div title="Çmimi i fëmijës është gjithmonë i njëjtë me adultin">
                      <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">Fëmijë (= Adult)</p>
                      <div className="flex items-baseline gap-1 border-b-2 border-[#e5dfd0] pb-1 opacity-60">
                        <input type="number" value={form.watch("childPrice") ?? 0} readOnly disabled tabIndex={-1}
                          className="bg-transparent outline-none text-base font-bold text-stone-800 w-full font-mono cursor-not-allowed" />
                        <span className="text-xs text-stone-400 font-semibold shrink-0">€</span>
                      </div>
                    </div>
                    {([["infantPrice", "Infant"], ["tax", "Taksa"]] as const).map(([name, label]) => (
                      <FormField key={name} control={form.control} name={name} render={({ field }) => (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">{label}</p>
                          <div className="flex items-baseline gap-1 border-b-2 border-[#e5dfd0] pb-1 focus-within:border-[#12244a]">
                            <input type="number" step="1" min="0" {...field}
                              className="bg-transparent outline-none text-base font-bold text-stone-800 w-full font-mono" />
                            <span className="text-xs text-stone-400 font-semibold shrink-0">€</span>
                          </div>
                        </div>
                      )} />
                    ))}
                    {/* Çmimi Neto — informativ, vetëm admin */}
                    {user?.role === "admin" && (
                      <FormField control={form.control} name="netPrice" render={({ field }) => (
                        <div className="col-span-2">
                          <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">Çmimi Neto (informativ)</p>
                          <div className="flex items-baseline gap-1 border-b-2 border-[#e5dfd0] pb-1 focus-within:border-[#12244a]">
                            <input type="number" step="1" min="0" placeholder="—"
                              value={field.value ?? ""}
                              onChange={e => field.onChange(e.target.value)}
                              className="bg-transparent outline-none text-base font-bold text-stone-800 w-full font-mono" />
                            <span className="text-xs text-stone-400 font-semibold shrink-0">€</span>
                          </div>
                        </div>
                      )} />
                    )}
                  </div>
                  {user?.role === "admin" && <FlightDiscountEditor flightId={flightId} flight={flight} onSaved={onUpdated} />}
                  <FormField control={form.control} name="excludeFromGoogleRule" render={({ field }) => (
                    <label className="flex items-start gap-2 cursor-pointer select-none" onClick={() => field.onChange(!field.value)}>
                      <Toggle on={!!field.value} tone="bg-rose-500" />
                      <div>
                        <span className="text-[12px] font-bold text-stone-800">Përjashto nga rregulli i çmimit të Google</span>
                        <p className="text-[10px] text-stone-500 mt-0.5 leading-snug">Kur aktivizohet, çmimi i këtij fluturimi nuk ndryshohet automatikisht nga Google. Çmimi që vendos me dorë mbetet i pandryshuar.</p>
                      </div>
                    </label>
                  )} />
                </div>

                <div className="border-t border-[#e5dfd0]" />

                {/* Bagazhi + Sales Ending — krah për krah */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <StubTitle icon={<Luggage className="h-3 w-3" />}>Bagazhi i Kontrolluar</StubTitle>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ["checkedBaggageCount", "Çanta", "çanta"],
                        ["checkedBaggageKg",    "Kg",    "kg"],
                        ["checkedBaggagePrice", "Çmimi", "€"],
                      ] as const).map(([name, label, unit]) => (
                        <FormField key={name} control={form.control} name={name} render={({ field }) => (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">{label}</p>
                            <div className="flex items-baseline gap-1 border-b-2 border-[#e5dfd0] pb-1 focus-within:border-[#12244a]">
                              <input type="number" step="1" min="0" {...field}
                                className="bg-transparent outline-none text-base font-bold text-stone-800 w-full font-mono" />
                              <span className="text-[10px] text-stone-400 font-semibold shrink-0">{unit}</span>
                            </div>
                          </div>
                        )} />
                      ))}
                    </div>
                    <p className="text-[10px] text-stone-400">Vendos numrin dhe kg për të dërguar bagazhin.</p>
                  </div>

                  {/* Sales Ending — kufiri për-fluturim (bosh = vlera globale) */}
                  {(() => {
                    const formCutoff = form.watch("sellCutoffHours");
                    const isConfirmedFlight = form.watch("isConfirmed");
                    // Fluturimet ⭐ përdorin GJITHMONË kufirin e konfirmuar (mbishkruan çdo vlerë tjetër)
                    const effCutoff = isConfirmedFlight ? confirmedCutoffHours : (formCutoff ?? cutoffHours);
                    if (effCutoff == null) return <div />;
                    try {
                      const [y, m, d] = flight.departureDate.split("-").map(Number);
                      const [hh = 0, mm = 0] = (flight.departureTime || "00:00").split(":").map(Number);
                      const TZ = "Europe/Tirane";
                      const guessMs = Date.UTC(y, m - 1, d, hh, mm, 0);
                      const gParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(guessMs));
                      const gp = (t: string) => Number(gParts.find(p => p.type === t)!.value);
                      const tzOffset = Date.UTC(gp("year"), gp("month") - 1, gp("day"), gp("hour"), gp("minute"), gp("second")) - guessMs;
                      const depMs = guessMs - tzOffset;
                      let closeMs = depMs - effCutoff * 3_600_000;
                      if (isConfirmedFlight) {
                        // Nëse mbyllja bie në 00:30–09:00 (zyra mbyllur), mbyllet në 00:30
                        const cParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(closeMs));
                        const cp = (t: string) => Number(cParts.find(p => p.type === t)!.value);
                        const minsOfDay = cp("hour") * 60 + cp("minute");
                        if (minsOfDay > 30 && minsOfDay < 540) {
                          const g2 = Date.UTC(cp("year"), cp("month") - 1, cp("day"), 0, 30, 0);
                          const g2Parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(g2));
                          const g2p = (t: string) => Number(g2Parts.find(p => p.type === t)!.value);
                          const off2 = Date.UTC(g2p("year"), g2p("month") - 1, g2p("day"), g2p("hour"), g2p("minute"), g2p("second")) - g2;
                          closeMs = g2 - off2;
                        }
                      }
                      const closeDate = new Date(closeMs);
                      const now = Date.now();
                      const alreadyClosed = now >= closeMs;
                      const closeDateStr = closeDate.toLocaleDateString("sq-AL", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TZ });
                      const closeTimeStr = closeDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ });
                      return (
                        <div className="space-y-2">
                          <StubTitle icon={<Clock className="h-3 w-3 text-orange-500" />}>Sales Ending</StubTitle>
                          <FormField control={form.control} name="sellCutoffHours" render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-3 space-y-0">
                              <span className="text-[12px] text-stone-600">Mbyllet para nisjes <span className="text-orange-600 font-bold">*</span></span>
                              <FormControl>
                                <div className="flex items-baseline gap-1">
                                  <input
                                    type="number" min="0" step="1"
                                    value={field.value ?? ""}
                                    onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                    placeholder={cutoffHours != null ? String(cutoffHours) : ""}
                                    className="font-bold font-mono text-base w-12 text-right border-b-2 border-[#e5dfd0] bg-transparent outline-none text-stone-800 focus:border-[#12244a]"
                                  />
                                  <span className="text-[11px] text-stone-500 font-semibold">orë</span>
                                </div>
                              </FormControl>
                            </FormItem>
                          )} />
                          {isConfirmedFlight ? (
                            <p className="text-[10px] text-amber-600 font-medium">⭐ Fluturim i konfirmuar — vlen rregulli i konfirmuar ({confirmedCutoffHours} orë), jo kjo fushë · mbyllet <strong>{closeDateStr} ora {closeTimeStr}</strong></p>
                          ) : formCutoff == null && cutoffHours != null && (
                            <p className="text-[10px] text-stone-400">Bosh = vlera globale ({cutoffHours} orë)</p>
                          )}
                          <div className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] border ${alreadyClosed ? "bg-red-50 border-red-200 text-red-700" : "border-amber-300/70 bg-amber-100/60 text-amber-800"}`}>
                            <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>
                              {alreadyClosed ? "⚠️ Shitja ka përfunduar" : "Shitja mbyllet"}
                              {" — "}
                              <strong>{closeDateStr} ora {closeTimeStr}</strong>
                              {" "}<span className="opacity-70">(ora e Shqipërisë)</span>
                            </span>
                          </div>
                        </div>
                      );
                    } catch { return <div />; }
                  })()}
                </div>

                <div className="border-t border-[#e5dfd0]" />

                {/* Shënime (si chat) — të pandryshueshme pas dërgimit; ruhen MENJËHERË,
                    s'varen nga "Ruaj dhe Dil". Vetëm për sistemin e brendshëm. */}
                <div className="space-y-2">
                  <StubTitle icon={<StickyNote className="h-3 w-3 text-amber-600" />}>Shënime</StubTitle>
                  <FlightNotes flightId={flightId} />
                  <p className="text-[10px] text-stone-400">Shënimet ruhen menjëherë dhe s'ndryshohen më pas — te lista e fluturimeve del një shenjë e vogël; afro mausin për t'i lexuar.</p>
                </div>

                <div className="border-t border-[#e5dfd0]" />

                {/* Statusi */}
                <div className="space-y-2">
                  <StubTitle icon={<ShieldCheck className="h-3 w-3" />}>Statusi i Fluturimit</StubTitle>
                  <div className="flex flex-wrap gap-2 items-start">
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <select {...field} className="flex-1 min-w-[200px] border-2 border-[#e5dfd0] rounded-lg px-3 py-2 text-[12px] font-semibold bg-white text-stone-800 outline-none focus:border-[#12244a]">
                        <option value="open">Open — Hapur për rezervime</option>
                        <option value="closed">Closed — Pezull</option>
                        <option value="soldout">Sold Out — I shitur plotësisht</option>
                      </select>
                    )} />
                    <div className="flex flex-col items-start gap-2">
                      <FormField control={form.control} name="isConfirmed" render={({ field }) => (
                        <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 whitespace-nowrap" onClick={() => field.onChange(!field.value)}>
                          <Toggle on={!!field.value} tone="bg-amber-400" />
                          <span className="text-[12px] font-bold text-stone-800">⭐ Konfirmuar</span>
                        </label>
                      )} />
                      {user?.role === "admin" && <GoogleMonitoringToggle flightId={flightId} disabled={!!(flight as any).googleMonitoringDisabled} onUpdated={onUpdated} />}
                    </div>
                    {canBlockExternal && <FormField control={form.control} name="externalSalesBlocked" render={({ field }) => (
                      <label
                        title="Faqja publike, API e partnerëve dhe kanalet e jashtme e shohin fluturimin të mbyllur / pa vende. Rezervimet nga sistemi i brendshëm vazhdojnë normalisht."
                        className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-[#e5dfd0] bg-white px-3 py-2 whitespace-nowrap" onClick={() => field.onChange(!field.value)}>
                        <Toggle on={!!field.value} tone="bg-orange-500" />
                        <span className="text-[12px] font-bold text-stone-800">🔒 Blloko shitjet e jashtme</span>
                      </label>
                    )} />}
                    {user?.role === "admin" && <FormField control={form.control} name="showInBookingEngine" render={({ field }) => (
                      <label
                        title="Kur fiket, fluturimi fshihet nga faqja publike e Booking Engine — e shohin vetëm agjentët me akses te fluturimet e fshehura. Në FMS mbetet normal."
                        className={`flex items-center gap-2 cursor-pointer select-none rounded-lg border px-3 py-2 whitespace-nowrap ${field.value ? "border-[#e5dfd0] bg-white" : "border-gray-400 bg-gray-100"}`}
                        onClick={() => field.onChange(!field.value)}>
                        <Toggle on={!!field.value} tone="bg-sky-500" />
                        <span className="text-[12px] font-bold text-stone-800">{field.value ? "👁 Në Booking Engine" : "🙈 Fshehur nga Booking Engine"}</span>
                      </label>
                    )} />}
                  </div>
                </div>
              </div>{/* /kolona majtas */}

              {/* ════ KOLONA DJATHTAS — vendet + rezervimet ════ */}
              <div className="flex flex-col gap-4 min-w-0">

                {/* Vendet */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <StubTitle icon={<Ticket className="h-3 w-3" />}>Vendet</StubTitle>
                    <button
                      type="button"
                      onClick={() => setSeatHistoryOpen(true)}
                      title="Historiku i vendeve (shitje, anulime, ndryshime)"
                      className="inline-flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-600"
                    >
                      <History className="h-3 w-3" />Historiku
                    </button>
                  </div>
                  {(() => {
                    const totalW = Number(form.watch("totalSeats")) || 0;
                    const avail = Math.max(0, totalW - flight.soldSeats);
                    const soldPct = totalW > 0 ? (flight.soldSeats / totalW) * 100 : 0;
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl border-2 border-[#12244a]/15 bg-white px-1.5 py-2.5 text-center shadow-sm">
                            <p className="text-[9px] uppercase tracking-wider text-stone-400 font-semibold mb-1.5">Available</p>
                            <div className="flex items-center justify-center gap-1">
                              <button type="button" onMouseDown={e => { e.preventDefault(); changeAvail(-1); }}
                                className="w-5 h-5 rounded-full border border-stone-300 text-stone-500 flex items-center justify-center hover:bg-stone-100"><Minus className="h-2.5 w-2.5" /></button>
                              <input
                                type="text" inputMode="numeric" value={availInput}
                                onChange={e => handleAvailChange(e.target.value)}
                                onBlur={handleAvailBlur}
                                className="font-extrabold font-mono text-xl text-[#12244a] dark:text-foreground w-9 text-center bg-transparent outline-none border-b-2 border-[#12244a]/20 focus:border-[#12244a]"
                              />
                              <button type="button" onMouseDown={e => { e.preventDefault(); changeAvail(1); }}
                                className="w-5 h-5 rounded-full border border-stone-300 text-stone-500 flex items-center justify-center hover:bg-stone-100"><Plus className="h-2.5 w-2.5" /></button>
                            </div>
                          </div>
                          <div className="rounded-xl bg-white border border-[#e5dfd0] px-1.5 py-2.5 text-center">
                            <p className="text-[9px] uppercase tracking-wider text-stone-400 font-semibold mb-1.5">Sold</p>
                            <p className="font-extrabold font-mono text-xl text-stone-700">{flight.soldSeats}</p>
                          </div>
                          <div className="rounded-xl bg-white border border-[#e5dfd0] px-1.5 py-2.5 text-center">
                            <p className="text-[9px] uppercase tracking-wider text-stone-400 font-semibold mb-1.5">Total</p>
                            <p className="font-extrabold font-mono text-xl text-stone-700">{totalW}</p>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#e5dfd0] overflow-hidden flex">
                          <div className="bg-[#12244a]" style={{ width: `${soldPct}%` }} />
                          <div className="bg-[#e8b64c]" style={{ width: `${100 - soldPct}%` }} />
                        </div>
                        <p className="text-[9px] text-stone-400 font-mono">{flight.soldSeats} sold / {avail} free · {Math.round(soldPct * 10) / 10}% load</p>
                      </>
                    );
                  })()}
                </div>

                <div className="border-t border-[#e5dfd0]" />

                {/* Rezervimet */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between">
                    <StubTitle icon={<Ticket className="h-3 w-3" />}>Rezervimet ({bookings?.length ?? 0})</StubTitle>
                    {(bookings?.length ?? 0) > 3 && (
                      <Link href={`/bookings?flightId=${flightId}`} className="text-[10px] text-[#12244a] dark:text-foreground font-bold hover:underline">Shih të gjitha</Link>
                    )}
                  </div>
                  {loadingBookings ? (
                    <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-stone-400" /></div>
                  ) : !bookings?.length ? (
                    <p className="text-[11px] text-stone-400 text-center py-3">Nuk ka rezervime për këtë fluturim</p>
                  ) : (
                    <>
                      <div className="rounded-xl border border-[#e5dfd0] bg-white divide-y divide-[#f0ebdd] overflow-hidden">
                        {bookings.map((b: any) => (
                          <div key={b.id} className="flex items-center justify-between px-2.5 py-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => setSelectedBookingId(b.id)}
                                  className="font-mono text-[11px] font-extrabold text-[#12244a] dark:text-foreground hover:underline">{b.bookingRef}</button>
                                <span className={`text-[8px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border font-bold ${bkStatusStyle[b.status] || "bg-gray-50 text-gray-600 border-gray-200"}`}>{b.status}</span>
                              </div>
                              <p className="text-[10px] text-stone-500 mt-0.5 truncate">{b.customerName}</p>
                            </div>
                            <span className="font-bold font-mono text-[11px] text-stone-800 shrink-0 ml-2">${fmtM(b.totalAmount)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-end text-[9px] text-stone-400 font-mono px-0.5">
                        <span>Σ ${fmtM(bookings.reduce((s: number, b: any) => s + Number(b.totalAmount || 0), 0))}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>{/* /kolona djathtas */}
            </div>
          </div>

          {/* ── Barkodi + Ruaj dhe Dil ── */}
          <div className="px-6 pb-4 pt-3 bg-[#faf7ef] dark:bg-card border-t border-[#e5dfd0] dark:border-border flex-shrink-0">
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-end gap-[2px] h-6 opacity-70">
                {[3,1,2,1,4,1,1,3,2,1,3,1,2,4,1,2,1,3,1,2,3,1,1,2,4,1,2,1,3,2,1,3,1,2,1,4].map((w, i) => (
                  <div key={i} className="bg-[#12244a] h-full" style={{ width: w }} />
                ))}
              </div>
              <div className="font-mono text-[10px] text-stone-400 tracking-[0.3em] uppercase truncate">
                {flight.fromCity}-{flight.toCity} · #{flight.id} · {flight.flightNumber}
              </div>
            </div>
            <Button type="submit" disabled={updateFlight.isPending}
              className="w-full bg-[#12244a] hover:bg-[#1a325f] text-white text-sm font-bold rounded-xl py-3 h-auto tracking-wide shadow-lg shadow-[#12244a]/30 transition-colors">
              {updateFlight.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Duke ruajtur...</> : "Ruaj dhe Dil"}
            </Button>
          </div>
        </form>
      </Form>

      {/* Price History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Historiku i Çmimeve
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{flight.fromCity} → {flight.toCity} · {flight.flightNumber}</p>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {historyQuery.isLoading ? (
              <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /> Po ngarkohet…</div>
            ) : historyQuery.isError ? (
              <div className="py-8 text-center text-red-600">Nuk u mor dot historiku.</div>
            ) : !historyQuery.data?.length ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Ende nuk ka ndryshime çmimi të regjistruara.<br />
                Historiku fillon nga ndryshimi i parë i çmimit.
              </div>
            ) : (
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left font-medium py-2 px-2">Data</th>
                    <th className="text-left font-medium py-2 px-2">Përdoruesi</th>
                    <th className="text-right font-medium py-2 px-2">Çmimi i Ri</th>
                    <th className="text-right font-medium py-2 px-2">Para</th>
                    <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Çmimi Google</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.map((h) => (
                    <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2 whitespace-nowrap text-xs text-slate-600">
                        {format(new Date(h.createdAt), "dd MMM yyyy, h:mm a")}
                      </td>
                      <td className="py-2 px-2 text-xs font-medium">{h.userName}
                        {h.userRole && <span className="ml-1 text-muted-foreground/60 font-normal">({h.userRole})</span>}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold text-emerald-700">
                        €{fmtM(h.newAdultPrice)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground text-xs">
                        {h.oldAdultPrice != null ? (
                          <span className="line-through">€{fmtM(h.oldAdultPrice)}</span>
                        ) : <span>—</span>}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold text-blue-600 whitespace-nowrap">
                        {h.googlePrice != null ? `€${fmtM(h.googlePrice)}` : <span className="text-muted-foreground font-normal">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Seat History Dialog */}
      <Dialog open={seatHistoryOpen} onOpenChange={setSeatHistoryOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Historiku i Vendeve
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{flight.fromCity} → {flight.toCity} · {flight.flightNumber}</p>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {seatHistoryQuery.isLoading ? (
              <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /> Po ngarkohet…</div>
            ) : seatHistoryQuery.isError ? (
              <div className="py-8 text-center text-red-600">Nuk u mor dot historiku.</div>
            ) : !seatHistoryQuery.data?.length ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Ende nuk ka ngjarje vendesh të regjistruara.<br />
                Historiku fillon nga ndryshimi/shitja e parë pas aktivizimit.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left font-medium py-2 px-2">Data</th>
                    <th className="text-left font-medium py-2 px-2">Përdoruesi</th>
                    <th className="text-left font-medium py-2 px-2">Ngjarja</th>
                  </tr>
                </thead>
                <tbody>
                  {seatHistoryQuery.data.map((h) => (
                    <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30 align-top">
                      <td className="py-2 px-2 whitespace-nowrap text-xs text-slate-600">
                        {format(new Date(h.createdAt), "dd MMM yyyy, h:mm a")}
                      </td>
                      <td className="py-2 px-2 text-xs font-medium">{h.userName}
                        {h.userRole && <span className="ml-1 text-muted-foreground/60 font-normal">({h.userRole})</span>}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        <span className={
                          h.eventType === "sold" ? "font-semibold text-emerald-700" :
                          h.eventType === "cancelled" ? "font-semibold text-red-600" :
                          h.eventType === "restored" ? "font-semibold text-sky-700" :
                          "font-semibold text-slate-800"
                        }>
                          {seatEventLabel(h)}
                        </span>
                        {h.note && <div className="text-muted-foreground/80 mt-0.5">{h.note}</div>}
                        <SeatStateChips h={h} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Change History Dialog — historiku i plotë i ndryshimeve të fluturimit */}
      <Dialog open={changeHistoryOpen} onOpenChange={setChangeHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Historiku i Ndryshimeve
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{flight.fromCity} → {flight.toCity} · {flight.flightNumber}</p>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto">
            {user?.role === "admin" ? <FlightActivityHistory key={flightId} flightId={flightId} apiBase={API_BASE} labels={CH_FIELD_LABELS} /> : (changeHistoryQuery.isLoading || seatHistoryQuery.isLoading) ? (
              <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /> Po ngarkohet…</div>
            ) : changeHistoryQuery.isError ? (
              <div className="py-8 text-center text-red-600">Nuk u mor dot historiku.</div>
            ) : (() => {
              // Kronologji e bashkuar: ndryshimet e fluturimit + ngjarjet e vendeve
              // (shitje/anulime/rikthime). "created"/"total_changed" nuk përfshihen
              // sepse ndryshimi i vendeve totale del tashmë si editim ("Vendet totale").
              const seatEvents = (seatHistoryQuery.data ?? [])
                .filter(s => s.eventType === "sold" || s.eventType === "cancelled" || s.eventType === "restored");
              const items = [
                ...(changeHistoryQuery.data ?? []).map(h => ({ kind: "change" as const, at: h.createdAt, h })),
                ...seatEvents.map(s => ({ kind: "seat" as const, at: s.createdAt, s })),
              ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
              if (!items.length) return (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  Ende nuk ka ndryshime të regjistruara.<br />
                  Historiku fillon nga ndryshimi i parë pas aktivizimit.
                </div>
              );
              return (
                <div className="space-y-2">
                  {seatHistoryQuery.isError && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Lëvizjet e vendeve nuk u ngarkuan dot — po shfaqen vetëm editimet.
                    </div>
                  )}
                  {items.map((it) => it.kind === "change" ? (
                    <div key={`c-${it.h.id}`} className="rounded-lg border bg-white px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CH_SOURCE_STYLES[it.h.source] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                            {offlineText(CH_SOURCE_LABELS[it.h.source] || it.h.source)}
                          </span>
                          <span className="text-xs font-medium">{it.h.userName}
                            {it.h.userRole && <span className="ml-1 text-muted-foreground/60 font-normal">({it.h.userRole})</span>}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {format(new Date(it.h.createdAt), "dd MMM yyyy, h:mm a")}
                        </span>
                      </div>
                      {it.h.note && <p className="text-xs text-muted-foreground mt-1.5">{offlineText(it.h.note)}</p>}
                      {it.h.changes.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {it.h.changes.map((c, i) => (
                            <div key={i} className="text-xs flex items-baseline gap-1.5 flex-wrap">
                              <span className="text-muted-foreground min-w-[130px]">{offlineText(CH_FIELD_LABELS[c.field] || c.field)}:</span>
                              <span className="line-through text-red-600/70 tabular-nums">{offlineText(String(chVal(c.field, c.old)))}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-semibold text-emerald-700 tabular-nums">{offlineText(String(chVal(c.field, c.new)))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key={`s-${it.s.id}`} className="rounded-lg border bg-white px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${SEAT_EVENT_STYLES[it.s.eventType] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                            {SEAT_EVENT_BADGES[it.s.eventType] || it.s.eventType}
                          </span>
                          <span className="text-xs font-medium">{it.s.userName}
                            {it.s.userRole && <span className="ml-1 text-muted-foreground/60 font-normal">({it.s.userRole})</span>}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {format(new Date(it.s.createdAt), "dd MMM yyyy, h:mm a")}
                        </span>
                      </div>
                      <p className={`text-xs mt-1.5 font-medium ${
                        it.s.eventType === "sold" ? "text-emerald-700" :
                        it.s.eventType === "cancelled" ? "text-red-700" : "text-blue-700"
                      }`}>
                        {seatEventLabel(it.s)}
                      </p>
                      {it.s.note && <p className="text-xs text-muted-foreground mt-0.5">{it.s.note}</p>}
                      <SeatStateChips h={it.s} />
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle></DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>

      {/* Konfirmimi i ndryshimit të datës — fluturimi ka rezervime aktive */}
      <Dialog open={!!dateConfirm} onOpenChange={open => { if (!open) setDateConfirm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-700 flex items-center gap-2">⚠️ Po ndryshon datën e fluturimit</DialogTitle>
          </DialogHeader>
          {dateConfirm && (
            <div className="space-y-3 text-sm">
              <p>
                Data e nisjes po ndryshohet nga{" "}
                <span className="font-semibold line-through text-red-600">{fmtDateSq(dateConfirm.oldDate)}</span>{" "}
                në <span className="font-semibold text-emerald-700">{fmtDateSq(dateConfirm.newDate)}</span>.
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
                Ky fluturim ka <b>{dateConfirm.bookings} rezervim{dateConfirm.bookings === 1 ? "" : "e"} aktive</b> me{" "}
                <b>{dateConfirm.passengers} pasagjerë</b>. Të gjithë pasagjerët do të{" "}
                <b>zhvendosen bashkë me fluturimin</b> në datën e re.
              </div>
              <p className="text-muted-foreground text-xs">
                Nëse kjo është një fluturim TJETËR (jo i njëjti fluturim që ndryshoi datë nga kompania),
                MOS e ndrysho datën këtu — krijo fluturim të ri dhe zhvendos vetëm rezervimet përkatëse.
              </p>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={() => setDateConfirm(null)} disabled={updateFlight.isPending}>
                  Anulo
                </Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => doSave(dateConfirm.values, true)}
                  disabled={updateFlight.isPending}
                >
                  {updateFlight.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Po, zhvendos pasagjerët me fluturimin
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
