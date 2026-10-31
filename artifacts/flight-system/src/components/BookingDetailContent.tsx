import { useState, useRef, useCallback, useEffect, useLayoutEffect, useId, useMemo, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { dobAgeError } from "@/lib/paxAge";

const FlightSidePanel = lazy(() => import("@/components/FlightSidePanel").then(m => ({ default: m.FlightSidePanel })));
import { fmtM, fmtAmPm, cn, wholeMoneyInput, dueEuro } from "@/lib/utils";
import { markDirty, registerFlush, flushAllBookingDetail, clearAllBookingDetail, registerSaveAndClose, useDirtyCount, queueOp, cancelOp, useBookingDetailNavGuard, subscribeCloseConfirm, performSaveAndExit, performDiscardAndExit, BookingDraftProvider, _clearPendingNav } from "@/lib/bookingDetailDirty";
import { format } from "date-fns";
import {
  useGetBooking, useUpdateBookingStatus, useTicketBooking, useTicketBookingWithoutEmail, useCancelBooking,
  useUpdatePassenger, useUpdateBooking, useListAgents,
  getGetBookingQueryKey, getListBookingsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { PaymentMethodCombobox } from "@/components/PaymentMethodCombobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Ticket, XCircle, Pencil, TrendingUp, Trash2, Check, Loader2, MessageSquarePlus, History, Plus, Globe, Clock, Undo2, ClipboardCopy, ClipboardCheck, Users, RotateCcw, CheckSquare, Download, Siren, FileText, X, ChevronDown } from "lucide-react";
import { useCreateTask } from "@/components/CreateTaskDialog";
import { AssignToGroupPanel } from "@/components/AssignToGroupPanel";
import { useToast } from "@/hooks/use-toast";
import { draftMutation } from "@/lib/atomicBookingTransport";
import { useBookingSaving, useBookingDraft } from "@/context/BookingDraftContext";
import { GooglePriceAdminUpdater } from "@/components/GooglePriceAdminUpdater";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { AgentRankBadge } from "@/components/AgentRankBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtFlightNum } from "@/lib/utils";
import { isLettersOnly, NAME_ERROR } from "@/lib/nameValidation";
import { readGooglePriceLS, writeGooglePriceLS, googlePriceLsKey, normalizeGooglePrice, resolveGooglePriceDisplay } from "@/lib/googlePriceCache";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { PriceChatPanel } from "@/components/PriceChatPanel";
import { ChangeLogPanel } from "@/components/ChangeLogPanel";
import BookingComments from "@/components/BookingComments";
import FlightNotes from "@/components/FlightNotes";
import { useLocation } from "wouter";
import GroupTicketsPage from "@/pages/group-tickets";
import { BookingClaimButton } from "@/components/claims/BookingClaims";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

type GooglePriceResp = { price: number | null; routePrice: number | null; specific: boolean; stale?: boolean; currency: string; cached: boolean };

function GooglePriceBadge({ price, small = false }: { price: number; small?: boolean }) {
  const tier = price < 150 ? "low" : price <= 200 ? "mid" : "high";
  const cfg = {
    low: {
      outer: "bg-gradient-to-br from-yellow-50 to-amber-100 border border-amber-300/80 text-amber-800 shadow-sm shadow-amber-200/60 ring-1 ring-inset ring-yellow-200/40",
      dot: "bg-amber-400 shadow-sm shadow-amber-300",
    },
    mid: {
      outer: "bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-300/80 text-orange-800 shadow-sm shadow-orange-200/60 ring-1 ring-inset ring-orange-200/40",
      dot: "bg-orange-400 shadow-sm shadow-orange-300",
    },
    high: {
      outer: "bg-gradient-to-br from-red-50 to-rose-100 border border-red-300/80 text-red-700 shadow-sm shadow-red-200/60 ring-1 ring-inset ring-red-200/40",
      dot: "bg-red-500 shadow-sm shadow-red-300",
    },
  }[tier];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xl font-bold tracking-tight ${small ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"} ${cfg.outer}`}>
      <span className={`shrink-0 rounded-full ${small ? "w-1.5 h-1.5" : "w-2 h-2"} ${cfg.dot}`} />
      <span className="tabular-nums">€{fmtM(price)}</span>
    </span>
  );
}

type FlightPriceHistoryRow = {
  id: number;
  oldAdultPrice: number | null;
  newAdultPrice: number;
  googlePrice: number | null;
  userName: string;
  userRole: string | null;
  createdAt: string;
};

function GoogleFlightPrice({ from, to, date, flightNumber, adultPrice, flightId }: {
  from?: string | null; to?: string | null; date?: string | null; flightNumber?: string | null;
  adultPrice?: number | null; flightId?: number | null;
}) {
  const enabled = !!from && !!to && !!date;
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyQuery = useQuery<FlightPriceHistoryRow[]>({
    queryKey: ["flight-price-history", flightId],
    enabled: historyOpen && !!flightId,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/flights/${flightId}/price-history`, { credentials: "include" });
      if (!res.ok) throw new Error("Nuk u mor dot historiku.");
      return res.json();
    },
  });
  // Use the same configurable TTL as the flights list so freshness is consistent across pages.
  const { data: gpTtlData } = useQuery({
    queryKey: ["google-price-ttl"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<{ hours: number }> => {
      const r = await fetch(`${API_BASE}/settings/google-price-ttl`, { credentials: "include" });
      if (!r.ok) return { hours: 6 };
      return r.json();
    },
  });
  const googleTtlMs = Math.max(0.25, Number(gpTtlData?.hours ?? 6)) * 60 * 60 * 1000;
  // Reuse the same localStorage cache the flights list writes to, so a price the
  // user already saw (in the flights list or a previous booking) shows instantly.
  const lsKey = googlePriceLsKey(from, to, date, flightNumber) ?? "";
  const cachedLs = useMemo(() => (lsKey ? readGooglePriceLS(lsKey, googleTtlMs) : null), [lsKey, googleTtlMs]);
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["google-flight-price", from, to, date, flightNumber],
    enabled,
    staleTime: googleTtlMs,
    gcTime: googleTtlMs,
    retry: false,
    initialData: cachedLs ? { ...normalizeGooglePrice(cachedLs), routePrice: null, currency: "EUR", cached: true } : undefined,
    initialDataUpdatedAt: cachedLs ? cachedLs.ts : undefined,
    queryFn: async (): Promise<GooglePriceResp> => {
      const params = new URLSearchParams({ from: String(from), to: String(to), date: String(date) });
      if (flightNumber) params.set("flightNumber", String(flightNumber));
      const res = await fetch(`${API_BASE}/flights/google-price?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j?.error || "Nuk u mor dot çmimi.");
      }
      const j = await res.json();
      const value = normalizeGooglePrice(j);
      if (lsKey) writeGooglePriceLS(lsKey, { ...value, ts: Date.now() });
      return { ...j, ...value };
    },
  });

  if (!enabled) return null;
  const loading = isLoading || isFetching;
  const display = resolveGooglePriceDisplay(data, isError);
  const price = display.price;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
      {adultPrice != null && (
        <div className="inline-flex items-center gap-2">
          <span className="text-muted-foreground">Çmimi Ynë:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-100 border border-emerald-300/80 text-emerald-800 shadow-sm shadow-emerald-200/60 ring-1 ring-inset ring-emerald-200/40 font-bold text-sm tracking-tight">
              <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-500 shadow-sm shadow-emerald-300" />
              <span className="tabular-nums">€{fmtM(adultPrice)}</span>
            </span>
            {flightId != null && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                title="Historiku i ndryshimit të çmimeve"
                className="inline-flex items-center justify-center h-6 w-6 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                <History className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>
      )}
      <div className="inline-flex items-center gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Google Flights:</span>
        <span>
          {loading ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Po ngarkohet…</span>
          ) : display.unavailableLabel ? (
            <button type="button" onClick={() => refetch()} className="text-amber-600 hover:underline cursor-pointer" title={isError ? (error as Error)?.message || "Riprovo" : "Riprovo"}>
              S’ka çmim
            </button>
          ) : price != null ? (
            <span className="inline-flex items-center gap-1.5">
              <GooglePriceBadge price={price} />
              {data && !data.specific && <span className="text-xs text-muted-foreground" title="Çmimi më i ulët për këtë rrugë në këtë datë">(min. rrugë)</span>}
            </span>
          ) : (
            <button type="button" onClick={() => refetch()} className="text-muted-foreground hover:underline cursor-pointer" title="Riprovo">S’ka çmim</button>
          )}
        </span>
      </div>
      {flightId != null && (
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Historiku i Çmimeve</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto">
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left font-medium py-2 px-1">Data</th>
                      <th className="text-left font-medium py-2 px-1">Përdoruesi</th>
                      <th className="text-right font-medium py-2 px-1">Çmimi Ynë</th>
                      <th className="text-right font-medium py-2 px-1">Google</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyQuery.data.map((h) => (
                      <tr key={h.id} className="border-b last:border-0">
                        <td className="py-2 px-1 whitespace-nowrap text-xs text-slate-600">{format(new Date(h.createdAt), "dd MMM yyyy, h:mm a")}</td>
                        <td className="py-2 px-1 text-xs">{h.userName}</td>
                        <td className="py-2 px-1 text-right tabular-nums font-semibold">
                          {h.oldAdultPrice != null && h.oldAdultPrice !== h.newAdultPrice && (
                            <span className="text-muted-foreground/60 line-through mr-1 font-normal">€{fmtM(h.oldAdultPrice)}</span>
                          )}
                          €{fmtM(h.newAdultPrice)}
                        </td>
                        <td className="py-2 px-1 text-right">
                          {h.googlePrice != null ? <GooglePriceBadge price={h.googlePrice} small /> : <span className="text-muted-foreground/50 text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AutoSaveInput({
  label, value: initialValue, onSave, prefix, placeholder, className, mono, uppercase, hint, validate,
}: {
  label: string; value: string; onSave: (v: string) => Promise<void>;
  prefix?: string; placeholder?: string; className?: string; mono?: boolean; uppercase?: boolean; hint?: string;
  validate?: (v: string) => string | null;
}) {
  const fieldId = useId();
  const [val, setVal] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const prevRef = useRef(initialValue);
  const valRef = useRef(val);
  valRef.current = val;

  useEffect(() => {
    if (initialValue !== prevRef.current) {
      setVal(initialValue);
      prevRef.current = initialValue;
      markDirty(fieldId, false);
    }
  }, [initialValue, fieldId]);

  useEffect(() => {
    markDirty(fieldId, val.trim() !== prevRef.current);
  }, [val, fieldId]);

  const doSave = useCallback(async () => {
    const trimmed = valRef.current.trim();
    if (trimmed === prevRef.current) return;
    const vErr = validate?.(trimmed) ?? null;
    setErrMsg(vErr);
    if (vErr) throw new Error(vErr);
    setSaving(true);
    try {
      await onSave(trimmed);
      prevRef.current = trimmed;
      markDirty(fieldId, false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }, [onSave, fieldId]);

  useEffect(() => registerFlush(fieldId, doSave), [fieldId, doSave]);
  useEffect(() => () => { markDirty(fieldId, false); }, [fieldId]);

  // Anulo (discard): rivendos vlerën lokale te vlera e fundit e ruajtur.
  useEffect(() => {
    const fn = () => { setVal(prevRef.current); markDirty(fieldId, false); };
    window.addEventListener("booking-detail:reset-fields", fn);
    return () => window.removeEventListener("booking-detail:reset-fields", fn);
  }, [fieldId]);

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">{label}</label>
      <div className={`flex border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-primary bg-white ${className ?? ""}`}>
        {prefix && <span className="px-2 text-sm text-muted-foreground bg-muted/40 border-r flex items-center">{prefix}</span>}
        <input
          type="text"
          value={val}
          onChange={e => { setVal(uppercase ? e.target.value.toUpperCase() : e.target.value); if (errMsg) setErrMsg(null); }}
          placeholder={placeholder}
          className={`flex-1 px-2 py-1 text-sm bg-white focus:outline-none ${mono ? "font-mono tracking-widest uppercase" : ""}`}
        />
        <span className="px-2 flex items-center text-muted-foreground">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3 text-green-500" /> : <Pencil className="h-3 w-3 opacity-30" />}
        </span>
      </div>
      {errMsg && <p className="text-[11px] text-red-600 mt-1">{errMsg}</p>}
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function AgencyCombobox({
  agents, value, onChange,
}: {
  agents: any[]; value: number | null; onChange: (v: number | null) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value != null ? agents.find(a => a.id === value) : null;
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">Agjencia</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm bg-white border rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <span className={selected ? "text-slate-900 font-medium" : "text-slate-500"}>
              {selected ? selected.name : "— Klient direkt (pa agjenci) —"}
            </span>
            <span className="text-slate-400">▾</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
          <Command
            filter={(val, search) => val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}
          >
            <CommandInput placeholder="Kërko agjenci…" />
            <CommandList>
              <CommandEmpty>S'u gjet asnjë agjenci.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="klient direkt pa agjenci"
                  onSelect={() => { onChange(null); setOpen(false); }}
                >
                  — Klient direkt (pa agjenci) —
                </CommandItem>
                {agents.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={a.name}
                    onSelect={() => { onChange(a.id); setOpen(false); }}
                  >
                    <span className={a.id === value ? "font-semibold" : ""}>{a.name}</span>
                    {a.id === value && <Check className="ml-auto h-3.5 w-3.5 text-emerald-600" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function AutoSaveNumber({
  label, value: initialValue, onSave, hint,
}: {
  label: string; value: number | null; onSave: (v: number | null) => Promise<void>; hint?: string;
}) {
  const fieldId = useId();
  const [val, setVal] = useState(initialValue != null ? String(initialValue) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const prevRef = useRef(val);
  const valRef = useRef(val);
  valRef.current = val;

  useEffect(() => {
    const newStr = initialValue != null ? String(initialValue) : "";
    setVal(newStr);
    prevRef.current = newStr;
    markDirty(fieldId, false);
  }, [initialValue, fieldId]);

  useEffect(() => {
    markDirty(fieldId, val !== prevRef.current);
  }, [val, fieldId]);

  const doSave = useCallback(async () => {
    if (valRef.current === prevRef.current) return;
    const num = valRef.current.trim() === "" ? null : Math.round(parseFloat(valRef.current));
    if (num !== null && !Number.isFinite(num)) throw new Error("Shkruaj një vlerë numerike të vlefshme.");
    setSaving(true);
    try {
      await onSave(isNaN(num!) ? null : num);
      prevRef.current = valRef.current;
      markDirty(fieldId, false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }, [onSave, fieldId]);

  useEffect(() => registerFlush(fieldId, doSave), [fieldId, doSave]);
  useEffect(() => () => { markDirty(fieldId, false); }, [fieldId]);

  useEffect(() => {
    const fn = () => { setVal(prevRef.current); markDirty(fieldId, false); };
    window.addEventListener("booking-detail:reset-fields", fn);
    return () => window.removeEventListener("booking-detail:reset-fields", fn);
  }, [fieldId]);

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">{label}</label>
      <div className="flex border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-primary bg-white">
        <span className="px-2 text-sm text-muted-foreground bg-muted/40 border-r flex items-center">€</span>
        <input
          type="number"
          min="0"
          step="1"
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="0.00"
          className="flex-1 px-2 py-1 text-sm bg-white focus:outline-none"
        />
        <span className="px-2 flex items-center text-muted-foreground">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3 text-green-500" /> : <Pencil className="h-3 w-3 opacity-30" />}
        </span>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function CompactAutoSaveNumber({
  value: initialValue, onSave,
}: { value: number | null; onSave: (v: number | null) => Promise<void> }) {
  const fieldId = useId();
  const [val, setVal] = useState(initialValue != null ? String(initialValue) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const prevRef = useRef(val);
  const valRef = useRef(val);
  valRef.current = val;
  useEffect(() => {
    const newStr = initialValue != null ? String(initialValue) : "";
    setVal(newStr);
    prevRef.current = newStr;
    markDirty(fieldId, false);
  }, [initialValue, fieldId]);
  useEffect(() => { markDirty(fieldId, val !== prevRef.current); }, [val, fieldId]);
  const doSave = useCallback(async () => {
    if (valRef.current === prevRef.current) return;
    const num = valRef.current.trim() === "" ? null : Math.round(parseFloat(valRef.current));
    setSaving(true);
    try {
      await onSave(isNaN(num!) ? null : num);
      prevRef.current = valRef.current;
      markDirty(fieldId, false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  }, [onSave, fieldId]);
  useEffect(() => registerFlush(fieldId, doSave), [fieldId, doSave]);
  useEffect(() => () => { markDirty(fieldId, false); }, [fieldId]);
  useEffect(() => {
    const fn = () => { setVal(prevRef.current); markDirty(fieldId, false); };
    window.addEventListener("booking-detail:reset-fields", fn);
    return () => window.removeEventListener("booking-detail:reset-fields", fn);
  }, [fieldId]);
  return (
    <div className="flex items-center gap-1">
      <span className="text-slate-600 text-sm font-semibold">€</span>
      <input
        type="text" inputMode="decimal" value={val}
        onChange={e => setVal(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))}
        placeholder="0"
        className="w-20 text-right font-mono font-bold text-slate-900 bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 px-2 py-1 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500 focus:bg-white tabular-nums text-base cursor-pointer transition-colors"
      />
      <span className="w-3 flex items-center justify-center text-muted-foreground">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3 text-green-500" /> : null}
      </span>
    </div>
  );
}

function InlineTicketPrice({
  passenger: p, booking, onSave,
}: { passenger: any; booking: any; onSave: (v: number | null) => void }) {
  const defaultPrice: number | null = (() => {
    if ((booking as any)?.source !== "CitizenPlane") {
      const fl = (booking as any)?.flight;
      if (fl) {
        const price = p.type === "child" ? fl.childPrice : p.type === "infant" ? fl.infantPrice : fl.adultPrice;
        return price != null ? Number(price) : null;
      }
    }
    return null;
  })();
  const current: number | null = p.ticketPrice != null ? Number(p.ticketPrice) : defaultPrice;
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(current != null ? String(current) : "");
  const valRef = useRef(val);
  valRef.current = val;
  const originalRef = useRef<number | null>(p.ticketPrice != null ? Number(p.ticketPrice) : null);
  const pendingRef = useRef<number | null>(originalRef.current);
  const hasPendingRef = useRef(false);

  useEffect(() => {
    setVal(current != null ? String(current) : "");
    originalRef.current = p.ticketPrice != null ? Number(p.ticketPrice) : null;
    pendingRef.current = originalRef.current;
    hasPendingRef.current = false;
    markDirty(fieldId, false);
  }, [current, p.ticketPrice, fieldId]);

  // Stage value on commit (blur/enter) — do NOT call onSave; master save button flushes.
  const doCommit = useCallback(() => {
    const trimmed = valRef.current.trim();
    const num = trimmed === "" ? null : parseFloat(trimmed);
    if (num != null && isNaN(num)) return;
    if (num === originalRef.current) {
      hasPendingRef.current = false;
      pendingRef.current = originalRef.current;
      markDirty(fieldId, false);
      return;
    }
    pendingRef.current = num;
    hasPendingRef.current = true;
    markDirty(fieldId, true);
  }, [fieldId]);

  useEffect(() => registerFlush(fieldId, async () => {
    if (editing) doCommit();
    if (!hasPendingRef.current) return;
    if (pendingRef.current !== null && (!Number.isFinite(pendingRef.current) || pendingRef.current < 0)) {
      throw new Error("Çmimi i biletës duhet të jetë numër jo negativ.");
    }
    await Promise.resolve(onSave(pendingRef.current));
    originalRef.current = pendingRef.current;
    hasPendingRef.current = false;
    markDirty(fieldId, false);
  }), [fieldId, doCommit, editing, onSave]);
  useEffect(() => () => { markDirty(fieldId, false); }, [fieldId]);

  useEffect(() => {
    const fn = () => {
      const orig = originalRef.current;
      setVal(orig != null ? String(orig) : "");
      pendingRef.current = orig;
      hasPendingRef.current = false;
      setEditing(false);
      markDirty(fieldId, false);
    };
    window.addEventListener("booking-detail:reset-fields", fn);
    return () => window.removeEventListener("booking-detail:reset-fields", fn);
  }, [fieldId]);

  useEffect(() => {
    if (!editing) return;
    const trimmed = val.trim();
    const num = trimmed === "" ? null : parseFloat(trimmed);
    const valid = num == null || !isNaN(num);
    markDirty(fieldId, valid && num !== originalRef.current);
  }, [val, editing, fieldId]);

  if (booking?.status === "cancelled") {
    return current != null
      ? <span className="font-medium text-muted-foreground">€{fmtM(current)}</span>
      : <span className="text-muted-foreground italic text-sm">—</span>;
  }

  const commit = () => {
    setEditing(false);
    doCommit();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">€</span>
        <input
          autoFocus
          type="number"
          min="0"
          step="1"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setVal(current != null ? String(current) : ""); setEditing(false); }
          }}
          className="w-20 px-1.5 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    );
  }

  const isOverride = p.ticketPrice != null;
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 -mx-1.5 hover:bg-muted text-left"
      title="Kliko për të ndryshuar çmimin"
    >
      {current != null
        ? <span className={`font-medium ${isOverride ? "" : "text-muted-foreground/80"}`}>€{fmtM(current)}</span>
        : <span className="text-muted-foreground italic text-sm">vendos çmimin</span>}
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition" />
    </button>
  );
}

function BookingDetailInner({ bookingId, onClose }: { bookingId: number; onClose?: () => void }) {
  const id = bookingId;
  const savingDraft = useBookingSaving();
  const draftDirty = useDirtyCount();
  const draft = useBookingDraft();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAdminAuth();
  const paymentMethods = usePaymentMethods();
  useBookingDetailNavGuard();

  const [flightPanelId, setFlightPanelId] = useState<number | null>(null);
  const [extraAddOverlay, setExtraAddOverlay] = useState<Array<{ tempId: string; description: string; amount: number; opId?: string }>>([]);
  const [extraDeleteOverlay, setExtraDeleteOverlay] = useState<Set<number>>(new Set());
  const [extraPatchOverlay, setExtraPatchOverlay] = useState<Record<number, { description?: string; amount?: number }>>({});
  const [paxPatchOverlay, setPaxPatchOverlay] = useState<Record<number, any>>({});
  const [paxAddOverlay, setPaxAddOverlay] = useState<Array<{ tempId: string; opId?: string; firstName: string; lastName: string; type: string; dateOfBirth: string | null; nationality: string | null; passportNumber: string | null; passportExpiry: string | null; seatNumber: string | null; baggageOption: string | null; hasSeatSelection: boolean; hasPriorityBoarding: boolean; hasInsurance: boolean; ticketPrice: number | null }>>([]);
  const paxAddOverlayRef = useRef(paxAddOverlay);
  paxAddOverlayRef.current = paxAddOverlay;
  const [paxDeleteOverlay, setPaxDeleteOverlay] = useState<Set<number>>(new Set());
  const [paxRestoreOverlay, setPaxRestoreOverlay] = useState<Set<number>>(new Set());
  const [paymentAddOverlay, setPaymentAddOverlay] = useState<Array<{ tempId: string; opId?: string; amount: number; method: string; reference: string | null; notes: string | null }>>([]);
  const [paymentPatchOverlay, setPaymentPatchOverlay] = useState<Record<number, { amount?: number; method?: string; reference?: string | null; notes?: string | null }>>({});
  const [stagedStatus, setStagedStatus] = useState<string | null>(null);
  const stagedStatusCommitRef = useRef<(() => Promise<void>) | null>(null);
  const statusTransitionBusyRef = useRef(false);
  const [statusTransitionBusy, setStatusTransitionBusy] = useState(false);
  const [statusTransitionLabel, setStatusTransitionLabel] = useState<string | null>(null);
  const [revertConfirm, setRevertConfirm] = useState<{ prev: string; label: string } | null>(null);
  const [deletePaxConfirm, setDeletePaxConfirm] = useState<any | null>(null);
  const clearOverlays = useCallback(() => {
    setExtraAddOverlay([]);
    setExtraDeleteOverlay(new Set());
    setExtraPatchOverlay({});
    setPaxPatchOverlay({});
    setPaxAddOverlay([]);
    setPaxDeleteOverlay(new Set());
    setPaymentAddOverlay([]);
    setPaymentPatchOverlay({});
    setStagedStatus(null);
    stagedStatusCommitRef.current = null;
    markDirty("status-field", false);
  }, []);
  useEffect(() => {
    const fn = () => clearOverlays();
    window.addEventListener("booking-detail:force-close", fn);
    window.addEventListener("booking-detail:clear-overlays", fn);
    return () => {
      window.removeEventListener("booking-detail:force-close", fn);
      window.removeEventListener("booking-detail:clear-overlays", fn);
    };
  }, [clearOverlays]);

  const isAdmin = user?.role === "admin";
  const [, navigate] = useLocation();
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; gid: number | null }>({ open: false, gid: null });
  const openGroupDialog = useCallback((gid: number) => {
    try { sessionStorage.setItem("openGroupId", String(gid)); } catch {}
    setGroupDialog({ open: true, gid });
  }, []);
  const priceRequestsPath = isAdmin ? "/price-requests" : "/my-requests";
  const [canSuggestPrice, setCanSuggestPrice] = useState<boolean | null>(null);
  const [canEditNetPrice, setCanEditNetPrice] = useState<boolean>(false);
  const [pendingPriceRequest, setPendingPriceRequest] = useState<{ id: number; suggestedAmount: number } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const [assignGroupOpen, setAssignGroupOpen] = useState(false);
  const [customerInfoOpen, setCustomerInfoOpen] = useState(false);
  const [selectedPaxIds, setSelectedPaxIds] = useState<Set<string>>(new Set());
  const { openCreateTask } = useCreateTask();
  const { data: linkedTasks = [] } = useQuery<any[]>({
    queryKey: ["booking-linked-tasks", id],
    queryFn: async () => {
      const resp = await fetch(`${API_BASE}/tasks?entityType=booking&entityId=${id}`, { credentials: "include" });
      if (!resp.ok) return [];
      return resp.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });
  const activeLinkedTasks = (linkedTasks as any[]).filter(
    (t) => t && ["backlog", "todo", "in_progress", "in_review"].includes(t.status),
  );
  const [netChatOpen, setNetChatOpen] = useState(false);
  const [pendingNetPriceRequest, setPendingNetPriceRequest] = useState<{ id: number; suggestedAmount: number } | null>(null);
  const [priceCardSlot, setPriceCardSlot] = useState<HTMLElement | null>(null);
  const [paymentsSlot, setPaymentsSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const find = () => {
      setPriceCardSlot(document.getElementById("booking-price-card-slot"));
      setPaymentsSlot(document.getElementById("booking-payments-slot"));
    };
    find();
    const t = window.setTimeout(find, 0);
    return () => window.clearTimeout(t);
  }, []);

  const { data: booking, isLoading, isError: bookingError, error: bookingLoadError, refetch: retryBooking } = useGetBooking(id, { query: { enabled: !!id && !savingDraft && draftDirty === 0 } as any });
  draft.transport.bookingId = id;
  if (!savingDraft && (booking as any)?.saveVersion) draft.transport.version = (booking as any).saveVersion;
  const saveRequest = draft.transport.request;
  useEffect(() => {
    if (savingDraft) void queryClient.cancelQueries({ queryKey: getGetBookingQueryKey(id) });
  }, [savingDraft, id, queryClient]);

  // Njoftimet e ndryshimit të fluturimit nga email-i (alarmi i kuq)
  const { data: emailAlerts = [] } = useQuery<any[]>({
    queryKey: ["booking-email-alerts", id],
    enabled: !!id,
    queryFn: async () => {
      const resp = await fetch(`${API_BASE}/bookings/${id}/email-alerts`, { credentials: "include" });
      if (!resp.ok) return [];
      return resp.json();
    },
  });
  const unreadAlerts = emailAlerts.filter((a: any) => !a.readAt);
  const readAlerts = emailAlerts.filter((a: any) => !!a.readAt);
  const [markingAlertsRead, setMarkingAlertsRead] = useState(false);
  const markAlertsRead = useCallback(async () => {
    if (!id) return;
    setMarkingAlertsRead(true);
    try {
      const resp = await fetch(`${API_BASE}/bookings/${id}/email-alerts/read`, {
        method: "POST",
        credentials: "include",
      });
      if (!resp.ok) throw new Error("failed");
      await queryClient.invalidateQueries({ queryKey: ["booking-email-alerts", id] });
      await queryClient.invalidateQueries({ queryKey: ["/bookings"] });
    } catch {
      // s'bëjmë asgjë — përdoruesi mund të provojë sërish
    } finally {
      setMarkingAlertsRead(false);
    }
  }, [id]);

  const updateBookingStatus = useUpdateBookingStatus();
  const ticketBooking = useTicketBooking({ request: { headers: { Prefer: "respond-async" } } });
  const ticketBookingWithoutEmail = useTicketBookingWithoutEmail();
  const cancelBooking = useCancelBooking();
  const updateBooking = useMemo(() => draftMutation(saveRequest, "bookings"), [saveRequest]);
  const { data: agentsList = [] } = useListAgents({}, { query: { enabled: isAdmin } as any });

  const [extrasLoading, setExtrasLoading] = useState(false);
  const [selectedExtraType, setSelectedExtraType] = useState<string | null>(null);
  const [extraPassengerId, setExtraPassengerId] = useState<string>("");
  const [extraAmount, setExtraAmount] = useState("");
  const [extraCustomDesc, setExtraCustomDesc] = useState("");
  const [editingExtraId, setEditingExtraId] = useState<number | string | null>(null);
  const [editingExtraDesc, setEditingExtraDesc] = useState("");
  const [editingExtraAmount, setEditingExtraAmount] = useState("");

  const updatePassenger = useMemo(() => draftMutation(saveRequest, "passengers"), [saveRequest]);
  const [editingPassenger, setEditingPassenger] = useState<null | {
    id: number; firstName: string; lastName: string; type: string; gender: string;
    dateOfBirth: string; nationality: string; passportNumber: string;
    passportExpiry: string; seatNumber: string; baggageOption: string;
    hasSeatSelection: boolean; hasPriorityBoarding: boolean; hasInsurance: boolean;
    ticketPrice: string;
  }>(null);

  const [excelCopied, setExcelCopied] = useState(false);
  const [waCopied, setWaCopied] = useState(false);
  const [excelPnrDrafts, setExcelPnrDrafts] = useState<Record<number, string>>({});
  const [excelSaving, setExcelSaving] = useState(false);
  const [pwdAction, setPwdAction] = useState<null | "cancel" | "restore">(null);
  const [pwdValue, setPwdValue] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const runPwdAction = async () => {
    if (!pwdAction || statusTransitionBusyRef.current) return;
    const action = pwdAction;
    const pwd = pwdValue;
    const label = action === "cancel" ? "Anuluar" : "Rikthyer";
    statusTransitionBusyRef.current = true;
    setStatusTransitionBusy(true);
    setStatusTransitionLabel(label);
    setPwdBusy(true);
    try {
      await flushAllBookingDetail();
      const url = `${API_BASE}/bookings/${id}/${action}`;
      const resp = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-cancel-password": pwd },
        body: JSON.stringify({}),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Gabim i panjohur" }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      invalidate();
      setPwdAction(null);
      setPwdValue("");
      toast({ title: `Rezervimi u ${label.toLowerCase()}` });
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "Veprimi dështoi", variant: "destructive" });
    } finally {
      setPwdBusy(false);
      statusTransitionBusyRef.current = false;
      setStatusTransitionBusy(false);
      setStatusTransitionLabel(null);
    }
  };

  const invalidate = useCallback(() => {
    if (draft.isSaving()) return; // Final save invalidates once, after every changed field has finished.
    queryClient.invalidateQueries({ queryKey: getGetBookingQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: [`/api/bookings`] });
    queryClient.invalidateQueries({ queryKey: [`/api/bookings/${id}/change-log`] });
  }, [queryClient, id, draft]);

  // Kërkim manual i biletës Wizz në inbox-in e email-eve
  const [fetchingWizzTicket, setFetchingWizzTicket] = useState(false);
  const handleFetchWizzTicket = async () => {
    setFetchingWizzTicket(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}/fetch-ticket-email`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.found) {
        const n = Array.isArray(data.urls) ? data.urls.length : 1;
        toast({ title: n > 1 ? `U gjetën ${n} bileta Wizz (një për çdo PNR) dhe u ruajtën si PDF` : "Bileta Wizz u gjet dhe u ruajt si PDF" });
        invalidate();
      } else if (Number(data.matchedCount ?? 0) > 0) {
        toast({ title: "Biletat u gjetën pjesërisht", description: data.reason, variant: "destructive" });
        invalidate();
      } else {
        toast({ title: "Bileta nuk u gjet", description: data.reason || "Provo më vonë", variant: "destructive" });
        invalidate(); // rifresko kutinë e shënimit të kërkimit afër butonit
      }
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "Kërkimi dështoi", variant: "destructive" });
    } finally {
      setFetchingWizzTicket(false);
    }
  };

  // Përjashto/rikthe rezervimin nga kërkimi i biletës në email
  const [togglingTicketExclude, setTogglingTicketExclude] = useState(false);
  const handleToggleTicketExclude = async (excluded: boolean) => {
    setTogglingTicketExclude(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}/ticket-search-exclude`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded }),
      });
      if (!res.ok) throw new Error("Veprimi dështoi");
      toast({
        title: excluded
          ? "Rezervimi u përjashtua nga kërkimi në email"
          : "Kërkimi në email u rikthye për këtë rezervim",
      });
      invalidate();
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "Veprimi dështoi", variant: "destructive" });
    } finally {
      setTogglingTicketExclude(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") { setCanSuggestPrice(false); setCanEditNetPrice(true); return; }
    if (user.role !== "manager" && user.role !== "agent_staff") { setCanSuggestPrice(false); setCanEditNetPrice(false); return; }
    fetch(`${API_BASE}/permissions/my`, { credentials: "include", cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("perm-fetch-failed"); return r.json(); })
      .then(perms => {
        setCanSuggestPrice(!!(perms as any).can_suggest_price);
        setCanEditNetPrice(!!(perms as any).can_edit_booking_net_price);
      })
      .catch(() => { setCanSuggestPrice(user.role === "manager"); setCanEditNetPrice(false); });
  }, [user]);

  useEffect(() => {
    if (!id || !user) return;
    const endpoint = user.role === "admin"
      ? `${API_BASE}/price-requests/for-booking/${id}`
      : `${API_BASE}/price-requests`;
    fetch(endpoint, { credentials: "include", cache: "no-store" })
      .then(r => r.ok ? r.json() : [])
      .then((reqs: any[]) => {
        const relevant = user.role === "admin" ? reqs : reqs.filter((r: any) => Number(r.bookingId) === id);
        const pending = relevant.find((r: any) => r.status === "pending" && (!r.requestType || r.requestType === "sell"));
        setPendingPriceRequest(pending ? { id: pending.id, suggestedAmount: pending.suggestedAmount } : null);
        const pendingNet = relevant.find((r: any) => r.status === "pending" && r.requestType === "net");
        setPendingNetPriceRequest(pendingNet ? { id: pendingNet.id, suggestedAmount: pendingNet.suggestedAmount } : null);
      })
      .catch(() => { setPendingPriceRequest(null); setPendingNetPriceRequest(null); });
  }, [id, user]);

  const openEditPassenger = (p: any) => {
    setEditingPassenger({
      id: p.id, firstName: p.firstName, lastName: p.lastName, type: p.type,
      gender: p.gender ?? "",
      dateOfBirth: p.dateOfBirth ?? "", nationality: p.nationality ?? "",
      passportNumber: p.passportNumber ?? "", passportExpiry: p.passportExpiry ?? "",
      seatNumber: p.seatNumber ?? "", baggageOption: p.baggageOption ?? "",
      hasSeatSelection: p.hasSeatSelection, hasPriorityBoarding: p.hasPriorityBoarding,
      hasInsurance: p.hasInsurance,
      ticketPrice: p.ticketPrice != null ? String(Number(p.ticketPrice)) : "",
    });
  };

  const handleSavePassenger = () => {
    if (!editingPassenger) return;
    if (!isLettersOnly(editingPassenger.firstName) || !isLettersOnly(editingPassenger.lastName)) {
      toast({ title: NAME_ERROR, variant: "destructive" });
      return;
    }
    if ((editingPassenger.type === "child" || editingPassenger.type === "infant") && !editingPassenger.dateOfBirth) {
      toast({ title: "Data e lindjes e detyrueshme", description: "Për fëmijë dhe foshnjë, data e lindjes është e detyrueshme.", variant: "destructive" });
      return;
    }
    {
      const ageErr = dobAgeError(editingPassenger.type, editingPassenger.dateOfBirth, booking?.flight?.departureDate);
      if (ageErr) {
        toast({ title: "Datëlindje e pavlefshme", description: ageErr, variant: "destructive" });
        return;
      }
    }
    const snap = { ...editingPassenger };
    const tpTrim = (snap.ticketPrice ?? "").trim();
    const tpNum = tpTrim === "" ? null : parseFloat(tpTrim);
    const tpVal = tpNum != null && !isNaN(tpNum) ? tpNum : null;
    // Staged (newly-added) passenger — update overlay locally, skip API.
    const snapId = snap.id as unknown;
    if (typeof snapId === "string" && snapId.startsWith("tmp-")) {
      const tempId = snapId.slice(4);
      setPaxAddOverlay(prev => prev.map(x => x.tempId === tempId ? {
        ...x,
        firstName: snap.firstName, lastName: snap.lastName, type: snap.type,
        gender: snap.gender || null,
        dateOfBirth: snap.dateOfBirth || null, nationality: snap.nationality || null,
        passportNumber: snap.passportNumber || null, passportExpiry: snap.passportExpiry || null,
        seatNumber: snap.seatNumber || null, baggageOption: snap.baggageOption || null,
        hasSeatSelection: snap.hasSeatSelection, hasPriorityBoarding: snap.hasPriorityBoarding,
        hasInsurance: snap.hasInsurance, ticketPrice: tpVal == null ? null : Math.round(tpVal),
      } : x));
      setEditingPassenger(null);
      toast({ title: "Pasagjeri u përditësua", description: "Do të ruhet me 'Ruaj'." });
      return;
    }
    setPaxPatchOverlay(prev => ({ ...prev, [snap.id]: {
      firstName: snap.firstName, lastName: snap.lastName, type: snap.type,
      gender: snap.gender || null,
      dateOfBirth: snap.dateOfBirth || null, nationality: snap.nationality || null,
      passportNumber: snap.passportNumber || null, passportExpiry: snap.passportExpiry || null,
      seatNumber: snap.seatNumber || null, baggageOption: snap.baggageOption || null,
      hasSeatSelection: snap.hasSeatSelection, hasPriorityBoarding: snap.hasPriorityBoarding,
      hasInsurance: snap.hasInsurance, ticketPrice: tpVal == null ? null : Math.round(tpVal),
    }}));
    queueOp(`Përditëso pasagjerin ${snap.firstName} ${snap.lastName}`.trim(), () => new Promise<void>((res, rej) => {
      updatePassenger.mutate({ id: snap.id, data: {
        firstName: snap.firstName, lastName: snap.lastName,
        type: snap.type, gender: snap.gender || null, dateOfBirth: snap.dateOfBirth || null,
        nationality: snap.nationality || null, passportNumber: snap.passportNumber || null,
        passportExpiry: snap.passportExpiry || null, seatNumber: snap.seatNumber || null,
        baggageOption: snap.baggageOption || null, hasSeatSelection: snap.hasSeatSelection,
        hasPriorityBoarding: snap.hasPriorityBoarding, hasInsurance: snap.hasInsurance,
        ticketPrice: tpVal == null ? null : Math.round(tpVal),
      } as any }, {
        onSuccess: () => { setPaxPatchOverlay(prev => { const { [snap.id]: _omit, ...rest } = prev; return rest; }); res(); },
        onError: (e: any) => rej(e),
      });
    }));
    setEditingPassenger(null);
    toast({ title: "Vendoset në pritje", description: "Pasagjeri do të ruhet me 'Ruaj'." });
  };

  const handleSavePnr = async (pnr: string) => {
    await new Promise<void>((res, rej) =>
      updateBooking.mutate({ id, data: { pnr: pnr || null } }, {
        onSuccess: () => { invalidate(); res(); },
        onError: (e: any) => { toast({ title: "Gabim PNR", description: e.message, variant: "destructive" }); rej(e); }
      })
    );
  };

  const handleSaveNetPrice = async (val: number | null) => {
    const rounded = val == null || isNaN(val) ? val : Math.round(val);
    await new Promise<void>((res, rej) =>
      updateBooking.mutate({ id, data: { netPrice: rounded } }, {
        onSuccess: () => { invalidate(); res(); },
        onError: (e: any) => { toast({ title: "Gabim Çmim Neto", description: e.message, variant: "destructive" }); rej(e); }
      })
    );
  };

  const handleSaveTotalAmount = async (val: number | null) => {
    if (val == null || !Number.isFinite(val)) throw new Error("Çmimi i shitjes është i detyrueshëm.");
    val = Math.round(val);
    await new Promise<void>((res, rej) =>
      updateBooking.mutate({ id, data: { totalAmount: val } }, {
        onSuccess: () => { invalidate(); res(); },
        onError: (e: any) => { toast({ title: "Gabim Çmim Shitjeje", description: e.message, variant: "destructive" }); rej(e); }
      })
    );
  };

  const handleSaveCustomerName = async (val: string) => {
    if (!val.trim()) throw new Error("Emri i klientit është i detyrueshëm.");
    await new Promise<void>((res, rej) =>
      updateBooking.mutate({ id, data: { customerName: val.trim() } as any }, {
        onSuccess: () => { invalidate(); res(); },
        onError: (e: any) => { toast({ title: "Gabim Emri Klientit", description: e.message, variant: "destructive" }); rej(e); }
      })
    );
  };

  const handleSaveCustomerEmail = async (val: string) => {
    await new Promise<void>((res, rej) =>
      updateBooking.mutate({ id, data: { customerEmail: val.trim() || null } as any }, {
        onSuccess: () => { invalidate(); res(); },
        onError: (e: any) => { toast({ title: "Gabim Email", description: e.message, variant: "destructive" }); rej(e); }
      })
    );
  };

  const handleSaveCustomerPhone = async (val: string) => {
    await new Promise<void>((res, rej) =>
      updateBooking.mutate({ id, data: { customerPhone: val.trim() || null } as any }, {
        onSuccess: () => { invalidate(); res(); },
        onError: (e: any) => { toast({ title: "Gabim Telefoni", description: e.message, variant: "destructive" }); rej(e); }
      })
    );
  };

  const [stagedAgentId, setStagedAgentId] = useState<number | null | undefined>(undefined);
  const handleChangeAgent = (newAgentId: number | null) => {
    // Bllokim: nuk lejohet ndryshimi i agjencisë kur ka pagesa të kryera.
    const paidSoFar = Number((booking as any)?.paidAmount ?? 0);
    const curAgent = ((booking as any)?.agentId ?? null) as number | null;
    if (paidSoFar > 0 && newAgentId !== curAgent) {
      toast({
        title: "Ndryshimi i agjencisë u bllokua",
        description: `Ky rezervim ka pagesa të kryera (€${fmtM(paidSoFar)}). Fshini ose rimbursoni fillimisht pagesat ekzistuese, pastaj kalojeni rezervimin te agjencia tjetër.`,
        variant: "destructive",
      });
      return;
    }
    setStagedAgentId(newAgentId);
  };
  const currentAgentId = ((booking as any)?.agentId ?? null) as number | null;
  useEffect(() => {
    if (stagedAgentId === undefined) {
      markDirty("agent-field", false);
      return;
    }
    markDirty("agent-field", stagedAgentId !== currentAgentId);
  }, [stagedAgentId, currentAgentId]);
  useEffect(() => registerFlush("agent-field", async () => {
    if (stagedAgentId === undefined || stagedAgentId === currentAgentId) return;
    await new Promise<void>((res, rej) =>
      updateBooking.mutate({ id, data: { agentId: stagedAgentId } as any }, {
        onSuccess: () => { invalidate(); setStagedAgentId(undefined); res(); },
        onError: (e: any) => { toast({ title: "Gabim Agjenci", description: e.message, variant: "destructive" }); rej(e); }
      })
    );
  }), [stagedAgentId, currentAgentId, id]);

  const handleSaveDiscount = async (val: number | null) => {
    const v = Math.max(0, Number(val ?? 0));
    await new Promise<void>((res, rej) =>
      updateBooking.mutate({ id, data: { discount: v } as any }, {
        onSuccess: () => { invalidate(); res(); },
        onError: (e: any) => { toast({ title: "Gabim Zbritje", description: e.message, variant: "destructive" }); rej(e); }
      })
    );
  };

  const handleAddExtra = () => {
    const amt = Math.round(parseFloat(extraAmount));
    if (!selectedExtraType || isNaN(amt) || amt <= 0) return;
    let desc = selectedExtraType === "Tjetër" ? extraCustomDesc.trim() : selectedExtraType;
    if (extraPassengerId) {
      const pax = (booking as any)?.passengers?.find((p: any) => String(p.id) === extraPassengerId);
      if (pax) desc = `${desc} — ${pax.firstName} ${pax.lastName}`;
    }
    if (!desc) return;
    const descSnap = desc, amtSnap = amt;
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setExtraAddOverlay(prev => [...prev, { tempId, description: descSnap, amount: amtSnap }]);
    const opId = queueOp(`Shto extra: ${descSnap} (€${amtSnap})`, async () => {
      const resp = await saveRequest(`${API_BASE}/bookings/${id}/extras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description: descSnap, amount: Math.round(amtSnap) }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setExtraAddOverlay(prev => prev.filter(x => x.tempId !== tempId));
    });
    setExtraAddOverlay(prev => prev.map(x => x.tempId === tempId ? { ...x, opId } : x));
    setSelectedExtraType(null); setExtraAmount(""); setExtraCustomDesc(""); setExtraPassengerId("");
    toast({ title: "Vendoset në pritje", description: "Extra do të shtohet me 'Ruaj'." });
  };

  const handleUpdateExtra = (extraId: number | string) => {
    const amt = Math.round(parseFloat(editingExtraAmount));
    const desc = editingExtraDesc.trim();
    if (!desc || isNaN(amt) || amt <= 0) return;

    if (typeof extraId === "string" && extraId.startsWith("tmp-")) {
      // Staged (not-yet-saved) extra: cancel the existing queued add op and
      // re-queue with updated values. No PATCH to the server for temp rows.
      const tempId = extraId.slice(4);
      const entry = extraAddOverlay.find(x => x.tempId === tempId);
      if (entry?.opId) cancelOp(entry.opId);
      const newOpId = queueOp(`Shto extra: ${desc} (€${amt})`, async () => {
        const resp = await saveRequest(`${API_BASE}/bookings/${id}/extras`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ description: desc, amount: Math.round(amt) }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        setExtraAddOverlay(prev => prev.filter(x => x.tempId !== tempId));
      });
      setExtraAddOverlay(prev => prev.map(x => x.tempId === tempId
        ? { ...x, description: desc, amount: amt, opId: newOpId }
        : x
      ));
      setEditingExtraId(null);
      toast({ title: "Vendoset në pritje", description: "Extra do të shtohet me 'Ruaj'." });
      return;
    }

    const numId = extraId as number;
    setExtraPatchOverlay(prev => ({ ...prev, [numId]: { description: desc, amount: amt } }));
    queueOp(`Përditëso extra-n: ${desc}`, async () => {
      const resp = await saveRequest(`${API_BASE}/bookings/${id}/extras/${numId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description: desc, amount: Math.round(amt) }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setExtraPatchOverlay(prev => { const { [numId]: _o, ...rest } = prev; return rest; });
    });
    setEditingExtraId(null);
    toast({ title: "Vendoset në pritje", description: "Ndryshimi do të ruhet me 'Ruaj'." });
  };

  const handleDeleteExtra = (extraId: number | string) => {
    if (typeof extraId === "string" && extraId.startsWith("tmp-")) {
      // Staged (not-yet-saved) extra: cancel the queued add op and remove from overlay.
      const tempId = extraId.slice(4);
      const entry = extraAddOverlay.find(x => x.tempId === tempId);
      if (entry?.opId) cancelOp(entry.opId);
      setExtraAddOverlay(prev => prev.filter(x => x.tempId !== tempId));
      toast({ title: "Extra e anuluar", description: "Extra e re u hoq." });
      return;
    }
    const numId = extraId as number;
    setExtraDeleteOverlay(prev => { const next = new Set(prev); next.add(numId); return next; });
    queueOp(`Fshi extra #${numId}`, async () => {
      const resp = await saveRequest(`${API_BASE}/bookings/${id}/extras/${numId}`, { method: "DELETE", credentials: "include" });
      if (!resp.ok && resp.status !== 404) throw new Error(await resp.text());
      setExtraDeleteOverlay(prev => { const next = new Set(prev); next.delete(numId); return next; });
    });
    toast({ title: "Vendoset në pritje", description: "Fshirja do të aplikohet me 'Ruaj'." });
  };

  const handleDeleteStagedPayment = (tempId: string) => {
    const entry = paymentAddOverlay.find(x => x.tempId === tempId);
    if (entry?.opId) cancelOp(entry.opId);
    setPaymentAddOverlay(prev => prev.filter(x => x.tempId !== tempId));
    toast({ title: "Pagesa u hoq", description: "Pagesa e re u anulua." });
  };

  const [addPassengerOpen, setAddPassengerOpen] = useState(false);
  const emptyNewPax = (): typeof newPaxForm => ({
    firstName: "", lastName: "", type: "adult", gender: "",
    dateOfBirth: "", nationality: "", passportNumber: "",
    passportExpiry: "", seatNumber: "", baggageOption: "",
    hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false,
    ticketPrice: "",
  });
  const [newPaxForm, setNewPaxForm] = useState({
    firstName: "", lastName: "", type: "adult", gender: "",
    dateOfBirth: "", nationality: "", passportNumber: "",
    passportExpiry: "", seatNumber: "", baggageOption: "",
    hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false,
    ticketPrice: "",
  });

  const handleAddPassenger = () => {
    const f = newPaxForm;
    if (!f.firstName.trim() || !f.lastName.trim()) {
      toast({ title: "Emri dhe Mbiemri janë të detyrueshëm", variant: "destructive" });
      return;
    }
    if (!isLettersOnly(f.firstName) || !isLettersOnly(f.lastName)) {
      toast({ title: NAME_ERROR, variant: "destructive" });
      return;
    }
    if ((f.type === "child" || f.type === "infant") && !f.dateOfBirth) {
      toast({ title: "Data e lindjes e detyrueshme", description: "Për fëmijë dhe foshnjë, data e lindjes është e detyrueshme.", variant: "destructive" });
      return;
    }
    {
      const ageErr = dobAgeError(f.type, f.dateOfBirth, booking?.flight?.departureDate);
      if (ageErr) {
        toast({ title: "Datëlindje e pavlefshme", description: ageErr, variant: "destructive" });
        return;
      }
    }
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tp = f.ticketPrice.trim() === "" ? null : parseFloat(f.ticketPrice);
    const overlayEntry = {
      tempId,
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), type: f.type,
      gender: f.gender || null,
      dateOfBirth: f.dateOfBirth || null, nationality: f.nationality.trim() || null,
      passportNumber: f.passportNumber.trim() || null, passportExpiry: f.passportExpiry || null,
      seatNumber: f.seatNumber.trim() || null, baggageOption: f.baggageOption || null,
      hasSeatSelection: f.hasSeatSelection, hasPriorityBoarding: f.hasPriorityBoarding,
      hasInsurance: f.hasInsurance, ticketPrice: tp != null && !isNaN(tp) ? Math.round(tp) : null,
    };
    setPaxAddOverlay(prev => [...prev, overlayEntry]);
    const opId = queueOp(`Shto pasagjerin ${overlayEntry.firstName} ${overlayEntry.lastName}`.trim(), async () => {
      // Read LATEST overlay state at execution time so staged edits (price/baggage/details) persist.
      const cur = paxAddOverlayRef.current.find(x => x.tempId === tempId) ?? overlayEntry;
      const body = {
        bookingId: id,
        firstName: cur.firstName, lastName: cur.lastName, type: cur.type,
        gender: (cur as any).gender ?? null,
        dateOfBirth: cur.dateOfBirth, nationality: cur.nationality,
        passportNumber: cur.passportNumber, passportExpiry: cur.passportExpiry,
        seatNumber: cur.seatNumber, baggageOption: cur.baggageOption,
        hasSeatSelection: cur.hasSeatSelection, hasPriorityBoarding: cur.hasPriorityBoarding,
        hasInsurance: cur.hasInsurance, ticketPrice: cur.ticketPrice == null ? null : Math.round(cur.ticketPrice),
      };
      const resp = await saveRequest(`${API_BASE}/passengers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setPaxAddOverlay(prev => prev.filter(x => x.tempId !== tempId));
    });
    setPaxAddOverlay(prev => prev.map(x => x.tempId === tempId ? { ...x, opId } : x));
    setAddPassengerOpen(false);
    setNewPaxForm(emptyNewPax());
    toast({ title: "Vendoset në pritje", description: "Pasagjeri do të shtohet me 'Ruaj'." });
  };

  const handleDeletePassenger = (p: any) => {
    const pid = p.id;
    // Staged (not yet flushed): hiqe lokalisht.
    if (typeof pid === "string" && pid.startsWith("tmp-")) {
      const tempId = pid.slice(4);
      setPaxAddOverlay(prev => {
        const ent = prev.find(x => x.tempId === tempId);
        if (ent?.opId) cancelOp(ent.opId);
        return prev.filter(x => x.tempId !== tempId);
      });
      toast({ title: "Pasagjeri u hoq nga lista" });
      return;
    }
    // SOFT-CANCEL: shenjë optimiste + queue DELETE që në backend bën soft-cancel.
    setPaxDeleteOverlay(prev => { const next = new Set(prev); next.add(pid as number); return next; });
    setPaxRestoreOverlay(prev => { const next = new Set(prev); next.delete(pid as number); return next; });
    queueOp(`Anulo pasagjerin ${p.firstName} ${p.lastName}`.trim(), async () => {
      const resp = await saveRequest(`${API_BASE}/passengers/${pid}`, { method: "DELETE", credentials: "include" });
      if (!resp.ok && resp.status !== 404) throw new Error(await resp.text());
      setPaxDeleteOverlay(prev => { const next = new Set(prev); next.delete(pid as number); return next; });
      invalidate();
    });
    toast({ title: "Vendoset në pritje", description: "Pasagjeri do të anulohet me 'Ruaj' (mbetet i shfaqur me vijë)." });
  };

  const handleRestorePassenger = (p: any) => {
    const pid = p.id;
    if (typeof pid === "string" && pid.startsWith("tmp-")) return;
    setPaxRestoreOverlay(prev => { const next = new Set(prev); next.add(pid as number); return next; });
    setPaxDeleteOverlay(prev => { const next = new Set(prev); next.delete(pid as number); return next; });
    queueOp(`Riktheji pasagjerit ${p.firstName} ${p.lastName}`.trim(), async () => {
      const resp = await saveRequest(`${API_BASE}/passengers/${pid}/restore`, { method: "POST", credentials: "include" });
      if (!resp.ok) throw new Error(await resp.text());
      setPaxRestoreOverlay(prev => { const next = new Set(prev); next.delete(pid as number); return next; });
      invalidate();
    });
    toast({ title: "Vendoset në pritje", description: "Pasagjeri do të rikthehet me 'Ruaj'." });
  };

  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [newPayForm, setNewPayForm] = useState<{ amount: string; method: string; reference: string; notes: string; payerType: "invoice" | "client" | "" }>({
    amount: "", method: "", reference: "", notes: "", payerType: "",
  });
  const openAddPayment = () => {
    setNewPayForm({ amount: "", method: "", reference: "", notes: "", payerType: "" });
    setAddPaymentOpen(true);
  };
  const [editingPayment, setEditingPayment] = useState<null | { id: number; amount: string; method: string; reference: string; notes: string; payerType: "invoice" | "client" | "" }>(null);

  const handleAddPayment = () => {
    if (!newPayForm.method.trim() || !paymentMethods.some(pm => pm.name === newPayForm.method)) {
      toast({ title: "Zgjidh një mënyrë të vlefshme pagese", variant: "destructive" });
      return;
    }
    const amt = Math.round(parseFloat(newPayForm.amount));
    // Lejohen edhe shuma me minus (korrigjim/zbritje) — vetëm 0 nuk lejohet.
    if (isNaN(amt) || amt === 0) {
      toast({ title: "Shuma nuk mund të jetë 0", variant: "destructive" });
      return;
    }
    if (amt < 0 && newPayForm.method === "credit") {
      toast({ title: "Pagesa me kredit nuk mund të jetë me minus", variant: "destructive" });
      return;
    }
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      bookingId: id, amount: amt, method: newPayForm.method,
      reference: newPayForm.reference.trim() || null,
      notes: newPayForm.notes.trim() || null,
      payerType: newPayForm.payerType || null,
    };
    setPaymentAddOverlay(prev => [...prev, { tempId, amount: body.amount, method: body.method, reference: body.reference, notes: body.notes, payerType: body.payerType } as any]);
    const opId = queueOp(`Shto pagesë: €${amt} (${body.method})`, async () => {
      const resp = await saveRequest(`${API_BASE}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bookingId: body.bookingId, amount: body.amount, method: body.method, reference: body.reference ?? undefined, notes: body.notes ?? undefined, payerType: body.payerType ?? undefined }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setPaymentAddOverlay(prev => prev.filter(x => x.tempId !== tempId));
    });
    setPaymentAddOverlay(prev => prev.map(x => x.tempId === tempId ? { ...x, opId } : x));
    setAddPaymentOpen(false);
    setNewPayForm({ amount: "", method: "", reference: "", notes: "", payerType: "" });
    toast({ title: "Vendoset në pritje", description: "Pagesa do të shtohet me 'Ruaj'." });
  };

  // Anulimi i pagesës kërkon konfirmim me dialog + shënim TË DETYRUESHËM.
  const [cancelPayDlg, setCancelPayDlg] = useState<number | null>(null);
  const [cancelPayNote, setCancelPayNote] = useState("");
  const handleCancelPayment = (payId: number) => {
    setCancelPayNote("");
    setCancelPayDlg(payId);
  };
  const confirmCancelPayment = () => {
    const payId = cancelPayDlg;
    const note = cancelPayNote.trim();
    if (payId == null || !note) return;
    setPaymentPatchOverlay(prev => ({ ...prev, [payId]: { ...(prev[payId] ?? {}), status: "cancelled" } as any }));
    queueOp(`Anulo pagesën #${payId}`, async () => {
      const resp = await saveRequest(`${API_BASE}/payments/${payId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "cancelled", cancelNote: note }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setPaymentPatchOverlay(prev => { const { [payId]: _o, ...rest } = prev; return rest; });
    });
    setCancelPayDlg(null);
    setCancelPayNote("");
    toast({ title: "Vendoset në pritje", description: "Anulimi i pagesës do të ruhet me 'Ruaj'." });
  };

  const handleSavePaymentEdit = () => {
    if (!editingPayment) return;
    if (!editingPayment.method.trim() || !paymentMethods.some(pm => pm.name === editingPayment.method)) {
      toast({ title: "Zgjidh një mënyrë të vlefshme pagese", variant: "destructive" });
      return;
    }
    // Historical payment edits must preserve stored cents; only newly-created
    // payment amounts are subject to the whole-euro policy.
    const amt = parseFloat(editingPayment.amount);
    if (isNaN(amt) || amt === 0) {
      toast({ title: "Shuma nuk mund të jetë 0", variant: "destructive" });
      return;
    }
    const payId = editingPayment.id;
    const patch: any = {
      amount: amt, method: editingPayment.method,
      reference: editingPayment.reference.trim() || null,
      notes: editingPayment.notes.trim() || null,
      payerType: editingPayment.payerType || null,
    };
    setPaymentPatchOverlay(prev => ({ ...prev, [payId]: patch }));
    queueOp(`Përditëso pagesën #${payId}`, async () => {
      const resp = await saveRequest(`${API_BASE}/payments/${payId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: patch.amount, method: patch.method, reference: patch.reference ?? undefined, notes: patch.notes ?? undefined, payerType: patch.payerType }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setPaymentPatchOverlay(prev => { const { [payId]: _o, ...rest } = prev; return rest; });
    });
    setEditingPayment(null);
    toast({ title: "Vendoset në pritje", description: "Ndryshimi i pagesës do të ruhet me 'Ruaj'." });
  };

  const queueClearBaggage = (paxId: number | string) => {
    if (typeof paxId === "string" && paxId.startsWith("tmp-")) {
      const tempId = paxId.slice(4);
      setPaxAddOverlay(prev => prev.map(x => x.tempId === tempId ? { ...x, baggageOption: null } : x));
      toast({ title: "Bagazhi u hoq" });
      return;
    }
    setPaxPatchOverlay(prev => ({ ...prev, [paxId as number]: { ...(prev[paxId as number] ?? {}), baggageOption: null } }));
    queueOp(`Hiq bagazhin për pasagjerin #${paxId}`, () => new Promise<void>((res, rej) => {
      updatePassenger.mutate({ id: paxId as number, data: { baggageOption: null } }, {
        onSuccess: () => {
          setPaxPatchOverlay(prev => {
            const cur = prev[paxId as number]; if (!cur) return prev;
            const { baggageOption: _bo, ...rest } = cur;
            const next = { ...prev };
            if (Object.keys(rest).length === 0) delete next[paxId as number]; else next[paxId as number] = rest;
            return next;
          });
          res();
        },
        onError: (e: any) => rej(e),
      });
    }));
    toast({ title: "Vendoset në pritje", description: "Bagazhi do të hiqet me 'Ruaj'." });
  };

  // Status actions janë IMMEDIATE: bëjmë flush të ndryshimeve të paruajtura, pastaj ekzekutojmë veprimin direkt.
  const runStatusImmediate = async (nextStatus: string, label: string, mutateFn?: () => Promise<any>) => {
    if (statusTransitionBusyRef.current) return;
    statusTransitionBusyRef.current = true;
    setStatusTransitionBusy(true);
    setStatusTransitionLabel(label);
    try {
      try {
        await flushAllBookingDetail();
      } catch {
        toast({ title: "Gabim", description: "Ndryshimet e paruajtura nuk u ruajtën. Statusi nuk u ndryshua.", variant: "destructive" });
        return;
      }
      let mutationResult: any;
      if (mutateFn) {
        mutationResult = await mutateFn();
      } else {
        await new Promise<void>((res, rej) => {
          updateBookingStatus.mutate({ id, data: { status: nextStatus as "draft" | "pending" | "confirmed" } }, {
            onSuccess: (saved) => {
              queryClient.setQueryData(getGetBookingQueryKey(id), (current: any) =>
                current ? { ...current, status: saved.status } : current
              );
              res();
            },
            onError: (e: any) => rej(e),
          });
        });
      }
      if (nextStatus === "ticketed" && mutationResult && typeof mutationResult === "object") {
        const savedTicketed = mutationResult;
        queryClient.setQueryData(getGetBookingQueryKey(id), (current: any) => current ? ({
          ...current,
          ...(savedTicketed.status ? { status: savedTicketed.status } : {}),
          ...(typeof savedTicketed.ticketEmailPending === "boolean" ? { ticketEmailPending: savedTicketed.ticketEmailPending } : {}),
          ...(savedTicketed.ticketEmailSentAt !== undefined ? { ticketEmailSentAt: savedTicketed.ticketEmailSentAt } : {}),
        }) : current);
      }
      if (mutationResult?.ticketEmailSending === true) {
        toast({
          title: "Rezervimi është biletuar",
          description: "Emaili po përpunohet në sfond. Deri në konfirmimin e dërgimit mbetet “Pa dërguar”.",
        });
      } else if (nextStatus === "ticketed" && label === "Emaili i Biletës u Dërgua") {
        if (mutationResult?.ticketEmailPending === false) {
          toast({ title: "Emaili i biletës u dërgua" });
        } else {
          toast({
            title: "Biletat mbeten të lëshuara",
            description: mutationResult?.ticketEmailPending === true
              ? "Emaili nuk u dërgua. Provo përsëri me butonin e dërgimit."
              : "Statusi i emailit nuk u konfirmua. Kontrollo statusin dhe provo përsëri nëse duhet.",
            variant: "destructive",
          });
        }
      } else if (nextStatus === "ticketed" && label === "Bileta të Lëshuara") {
        toast({
          title: "Biletat u lëshuan",
          variant: mutationResult?.ticketEmailPending === false ? "default" : "destructive",
          description: mutationResult?.ticketEmailPending === false
            ? "Emaili i biletës u dërgua."
            : mutationResult?.ticketEmailPending === true
              ? "Emaili nuk u dërgua. Mund ta dërgosh përsëri nga rezervimi."
              : "Statusi i emailit nuk u konfirmua.",
        });
      } else {
        toast({ title: `Statusi u ndryshua në '${label}'` });
      }
      invalidate();
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message ?? "Ndryshimi i statusit dështoi", variant: "destructive" });
    } finally {
      statusTransitionBusyRef.current = false;
      setStatusTransitionBusy(false);
      setStatusTransitionLabel(null);
    }
  };

  // Mbahet për kompatibilitet me SaveBar (nuk thirret më nga veprimet e statusit).
  const stageStatusChange = (nextStatus: string, label: string, mutateFn?: () => Promise<any>) => {
    void runStatusImmediate(nextStatus, label, mutateFn);
  };

  const commitStagedStatus = useCallback(async () => {
    const fn = stagedStatusCommitRef.current;
    if (!fn) return;
    try {
      await fn();
      stagedStatusCommitRef.current = null;
      setStagedStatus(null);
      markDirty("status-field", false);
      invalidate();
    } catch (err: any) {
      throw new Error(`Ndryshimi i statusit dështoi: ${err?.message ?? "gabim"}`);
    }
  }, [invalidate]);

  const handleAction = async (action: any, successMsg: string, statusLabel: string, nextStatus: string) => {
    try { await flushAllBookingDetail(); }
    catch { toast({ title: "Gabim", description: "Ndryshimet nuk u ruajtën.", variant: "destructive" }); return; }
    action.mutate({ id }, {
      onSuccess: () => { toast({ title: successMsg }); invalidate(); },
      onError: (err: any) => { toast({ title: "Gabim", description: err.message, variant: "destructive" }); }
    });
  };

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  if (bookingError || !booking) return (
    <div className="p-8 text-center space-y-3">
      <p className="text-destructive">{bookingError ? (bookingLoadError as Error)?.message || "Rezervimi nuk u ngarkua." : "Rezervimi nuk u gjet"}</p>
      {bookingError && <Button variant="outline" size="sm" onClick={() => void retryBooking()}>Riprovo</Button>}
    </div>
  );

  const statusColors: Record<string, string> = {
    confirmed: "bg-blue-500", ticketed: "bg-green-500",
    cancelled: "bg-red-500", draft: "bg-yellow-500", pending: "bg-orange-400",
  };
  const statusLabels: Record<string, string> = {
    draft: "DRAFT", pending: "PRITJE", confirmed: "KONFIRMUAR",
    ticketed: "BILETA", cancelled: "ANULUAR",
  };

  const commissionAmount = (booking as any).commissionAmount ?? null;
  const netPrice = (booking as any).netPrice ?? null;
  const totalNetPrice = (booking as any).totalNetPrice ?? null;
  const rawExtras = (booking as any).extras ?? [];
  const rawPassengers = (booking as any).passengers ?? [];
  const extras = rawExtras
    .filter((e: any) => !extraDeleteOverlay.has(e.id))
    .map((e: any) => extraPatchOverlay[e.id] ? { ...e, ...extraPatchOverlay[e.id] } : e)
    .concat(extraAddOverlay.map((a: any) => ({ id: `tmp-${a.tempId}`, description: a.description, amount: a.amount, __staged: true })));
  const passengersView = rawPassengers
    // Mos i filtro pasagjerët e anuluar — duhen të mbeten të dukshëm me vijë.
    .map((p: any) => {
      const patched = paxPatchOverlay[p.id] ? { ...p, ...paxPatchOverlay[p.id] } : p;
      // Optimistic cancelled state: trajto si i anuluar nëse pritet anulim, jo si i anuluar nëse pritet restore.
      const effCancelled = paxRestoreOverlay.has(p.id) ? false : (paxDeleteOverlay.has(p.id) ? true : !!(p as any).cancelled);
      return { ...patched, cancelled: effCancelled };
    })
    .concat(paxAddOverlay.map((a: any) => ({
      id: `tmp-${a.tempId}`,
      bookingId: id,
      firstName: a.firstName, lastName: a.lastName, type: a.type, gender: a.gender,
      dateOfBirth: a.dateOfBirth, nationality: a.nationality,
      passportNumber: a.passportNumber, passportExpiry: a.passportExpiry,
      seatNumber: a.seatNumber, baggageOption: a.baggageOption,
      hasSeatSelection: a.hasSeatSelection, hasPriorityBoarding: a.hasPriorityBoarding,
      hasInsurance: a.hasInsurance, extraCost: 0, ticketPrice: a.ticketPrice == null ? null : Math.round(a.ticketPrice),
      __staged: true,
    })));
  // Llogarit delta optimistike për pasagjerët e anuluar/rikthyer që ende s'janë ruajtur.
  const _optFlight = (booking as any).flight;
  let _optDelta = 0;
  for (const rp of rawPassengers as any[]) {
    const optCancelled = paxRestoreOverlay.has(rp.id) ? false : (paxDeleteOverlay.has(rp.id) ? true : !!rp.cancelled);
    if (optCancelled === !!rp.cancelled) continue;
    const def = rp.type === "child" ? _optFlight?.childPrice : rp.type === "infant" ? _optFlight?.infantPrice : _optFlight?.adultPrice;
    const tp = rp.ticketPrice != null ? Number(rp.ticketPrice) : Number(def ?? 0);
    const contribution = tp + Number(rp.extraCost ?? 0);
    if (optCancelled && !rp.cancelled) _optDelta -= contribution;
    else if (!optCancelled && rp.cancelled) _optDelta += contribution;
  }
  const totalAmount = Math.max(0, Math.round((Number(booking.totalAmount) + _optDelta) * 100) / 100);
  const discountValue = Number((booking as any).discount ?? 0);
  const paidAmount = Number((booking as any).paidAmount ?? 0);
  const dueAmount = dueEuro(totalAmount - paidAmount);
  const creditAmount = Number((booking as any).creditAmount ?? 0);
  const flight = (booking as any).flight;
  const flightStatus = String(flight?.status ?? "").toLowerCase();

  return (
    <div className="space-y-2" inert={savingDraft || undefined}>
      <BookingDetailSaveBar onClose={onClose} invalidate={invalidate} commitStatus={commitStagedStatus} />
      <CloseConfirmDialog />

      {/* Njoftim ndryshimi fluturimi nga email-i — aktive (të palexuara) me të kuqe */}
      {unreadAlerts.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
              <Siren className="h-4 w-4 animate-pulse" />
              Njoftim ndryshimi fluturimi nga emaili
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-red-300 text-red-700 hover:bg-red-100 text-xs font-bold"
              disabled={markingAlertsRead}
              onClick={markAlertsRead}
            >
              {markingAlertsRead ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
              Shëno si të lexuar
            </Button>
          </div>
          {unreadAlerts.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between gap-2 flex-wrap text-sm text-red-800">
              <div className="min-w-0">
                <span className="font-medium">{a.subject || "Important changes to your flight"}</span>
                {a.pnr && <span className="ml-2 font-mono text-xs font-bold">PNR: {a.pnr}</span>}
                {a.emailDate && (
                  <span className="ml-2 text-xs text-red-600">{format(new Date(a.emailDate), "dd MMM yyyy h:mm a")}</span>
                )}
              </div>
              {a.pdfUrl && (
                <a
                  href={`${API_BASE}${String(a.pdfUrl).replace(/^\/api/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 text-white px-2 py-1 text-xs font-bold hover:bg-red-700 shrink-0"
                >
                  <FileText className="h-3 w-3" /> Emaili (PDF)
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Njoftime të lexuara — historik gri, pa alarm */}
      {unreadAlerts.length === 0 && readAlerts.length > 0 && (
        <div className="rounded-xl border border-muted bg-muted/40 p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-muted-foreground font-semibold text-xs">
            <Check className="h-3.5 w-3.5" />
            Njoftime ndryshimi fluturimi (të lexuara)
          </div>
          {readAlerts.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
              <div className="min-w-0">
                <span>{a.subject || "Important changes to your flight"}</span>
                {a.pnr && <span className="ml-2 font-mono font-bold">PNR: {a.pnr}</span>}
                {a.emailDate && <span className="ml-2">{format(new Date(a.emailDate), "dd MMM yyyy h:mm a")}</span>}
              </div>
              {a.pdfUrl && (
                <a
                  href={`${API_BASE}${String(a.pdfUrl).replace(/^\/api/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold hover:bg-muted shrink-0"
                >
                  <FileText className="h-3 w-3" /> PDF
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{booking.bookingRef}</h1>
            <Badge className={`text-white ${statusColors[stagedStatus ?? booking.status] ?? "bg-gray-400"}`}>
              {statusLabels[stagedStatus ?? booking.status] ?? (stagedStatus ?? booking.status).toUpperCase()}
              {stagedStatus && <span className="ml-1.5 text-[10px] font-bold opacity-90">(pending)</span>}
            </Badge>
            {statusTransitionBusy && (
              <span role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Po kryhet{statusTransitionLabel ? `: ${statusTransitionLabel}` : ""}…
              </span>
            )}
            {(booking as any).pnr && (
              <Badge variant="outline" className="font-mono text-sm font-bold tracking-wider border-primary/40 text-primary">
                PNR: {(booking as any).pnr}
              </Badge>
            )}
            {(booking as any).airlineTicketUrl && String((booking as any).airlineTicketUrl).split(",").filter(Boolean).map((ticketUrl: string, _i: number, arr: string[]) => {
              const pnrFromFile = ticketUrl.match(/-([A-Z0-9]{5,8})\.pdf$/i)?.[1];
              return (
                <a
                  key={ticketUrl}
                  href={`${API_BASE}${ticketUrl.replace(/^\/api/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-pink-400 bg-pink-50 px-2.5 py-0.5 text-xs font-bold text-pink-700 hover:bg-pink-100"
                  title="Konfirmimi i biletës nga email-i i Wizzair"
                >
                  <Ticket className="h-3 w-3" />
                  {arr.length > 1 && pnrFromFile ? `Bileta Wizz ${pnrFromFile} (PDF)` : "Bileta Wizz (PDF)"}
                </a>
              );
            })}
            {(booking as any).source === "CitizenPlane" && (
              <Badge className="bg-sky-600 text-white px-1.5 py-1" title="NESTI AGJENSI">
                <Globe className="h-3.5 w-3.5" />
              </Badge>
            )}
            {(booking as any).source === "CitizenPlane" && typeof booking.notes === "string" && (() => {
              const cpCode = booking.notes.match(/\[CP:([^\]]+)\]/i)?.[1];
              return cpCode ? (
                <Badge variant="outline" className="gap-1 font-mono text-sky-700 bg-sky-50 border-sky-200" data-testid="booking-detail-cp-code">
                  <span className="text-xs">CP</span> {cpCode}
                </Badge>
              ) : null;
            })()}
            {typeof (booking as any).notes === "string" && (booking as any).notes.includes("[MBISHITJE") && (
              <Badge className="bg-red-600 text-white font-bold animate-pulse" title="Rezervim i importuar MBI kapacitetin e fluturimit — verifikoni vendet!">MBISHITJE</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">Krijuar {format(new Date(booking.createdAt), "dd MMM yyyy h:mm a")}</p>
        </div>
        <div className="flex space-x-2 flex-wrap gap-y-2">
          <Button variant="outline" size="sm" className="text-gray-500 hover:text-gray-700"
            onClick={() => setChangeLogOpen(true)}>
            <History className="mr-1.5 h-3.5 w-3.5" /> Historiku
          </Button>
          <Button variant="outline" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-300"
            onClick={() => openCreateTask({ entityType: "booking", entityId: id, entityRef: booking.bookingRef, entitySublabel: booking.customerName || undefined })}>
            <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> Krijo Detyrë
          </Button>
          <BookingClaimButton key={id} bookingId={id} bookingRef={booking.bookingRef} />
          {assignGroupOpen && (
            <Button variant="outline" size="sm" className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 border-purple-300"
              onClick={() => { setAssignGroupOpen(false); }}>
              <Users className="mr-1.5 h-3.5 w-3.5" /> Mbyll Caktimin
            </Button>
          )}
          {booking.status !== "cancelled" && (
            <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => { setPwdValue(""); setPwdAction("cancel"); }} disabled={statusTransitionBusy}>
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Anulo
            </Button>
          )}
          {booking.status === "cancelled" && (
            <Button variant="outline" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-300"
              onClick={() => { setPwdValue(""); setPwdAction("restore"); }} disabled={statusTransitionBusy}>
              <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Rikthe Rezervimin
            </Button>
          )}
          {(stagedStatus ?? booking.status) === "draft" && (
            <Button size="sm" className="bg-orange-500 text-white border border-orange-600 hover:bg-orange-600 hover:text-white shadow-sm"
              onClick={() => void runStatusImmediate("pending", "Në Pritje")}
              disabled={statusTransitionBusy || updateBookingStatus.isPending}>
              {statusTransitionBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Clock className="mr-1.5 h-3.5 w-3.5" />}
              {statusTransitionBusy && statusTransitionLabel === "Në Pritje" ? "Po ruan..." : "Vendos në Pritje"}
            </Button>
          )}
          {(() => {
            const REVERT_MAP: Record<string, { prev: string; label: string }> = {
              pending:   { prev: "draft",     label: "Kthe në Draft" },
              confirmed: { prev: "pending",   label: "Kthe në Pending" },
              ticketed:  { prev: "confirmed", label: "Kthe në Konfirmuar" },
            };
            const rev = REVERT_MAP[stagedStatus ?? booking.status];
            if (!rev) return null;
            return (
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-red-600 border border-red-400 hover:bg-red-50 hover:text-red-700 hover:border-red-500 shadow-sm font-semibold"
                onClick={() => setRevertConfirm({ prev: rev.prev, label: rev.label })}
                disabled={statusTransitionBusy || updateBookingStatus.isPending}>
                <Undo2 className="mr-1.5 h-3.5 w-3.5" /> {rev.label}
              </Button>
            );
          })()}
          {(stagedStatus ?? booking.status) === "pending" && (
            <Button size="sm" className="bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 hover:text-white shadow-sm"
              onClick={() => void runStatusImmediate("confirmed", "Konfirmuar")} disabled={statusTransitionBusy || updateBookingStatus.isPending}>
              {statusTransitionBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              {statusTransitionBusy && statusTransitionLabel === "Konfirmuar" ? "Po ruan..." : "Konfirmo"}
            </Button>
          )}
          {(stagedStatus ?? booking.status) === "confirmed" && (() => {
            // Pasagjerët e anuluar s'kanë nevojë për PNR
            const activePax = (booking.passengers ?? []).filter((p: any) => !p.cancelled);
            const paxWithPnr = activePax.filter((p: any) => String(p.pnr ?? "").trim().length > 0);
            const pnrOk = activePax.length > 0 && paxWithPnr.length === activePax.length;
            const netOk = netPrice != null && Number(netPrice) > 0;
            const ready = pnrOk && netOk;
            const missing: string[] = [];
            if (!pnrOk) missing.push("PNR");
            if (!netOk) missing.push("Çmimi Neto");
            return (
              <>
                <Button
                  size="sm"
                  className={ready
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-amber-100 hover:bg-amber-100 text-amber-900 border border-amber-300 cursor-not-allowed opacity-100"}
                  onClick={() => void runStatusImmediate("ticketed", "Bileta të Lëshuara", () => new Promise<any>((res, rej) => ticketBooking.mutate({ id }, { onSuccess: saved => res(saved), onError: (e: any) => rej(e) })))}
                  disabled={statusTransitionBusy || ticketBooking.isPending || ticketBookingWithoutEmail.isPending || !ready}
                  title={ready ? "Lësho biletat dhe dërgo emailin te agjenti" : `Plotëso fillimisht: ${missing.join(", ")}`}
                >
                   {statusTransitionBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Ticket className="mr-1.5 h-3.5 w-3.5" />}
                   {statusTransitionBusy && statusTransitionLabel === "Bileta të Lëshuara" ? "Po dërgon..." : "Lësho Biletat"}
                  {!ready && <span className="ml-2 text-xs font-semibold">(mungon {missing.join(" + ")})</span>}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                  onClick={() => void runStatusImmediate("ticketed", "Biletuar pa Email", () => new Promise<any>((res, rej) => ticketBookingWithoutEmail.mutate({ id }, { onSuccess: saved => res(saved), onError: (e: any) => rej(e) })))}
                  disabled={statusTransitionBusy || ticketBooking.isPending || ticketBookingWithoutEmail.isPending || !ready}
                  title={ready ? "Lësho biletat pa ia dërguar emailin agjentit" : `Plotëso fillimisht: ${missing.join(", ")}`}
                >
                  {statusTransitionBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />}
                  {statusTransitionBusy && statusTransitionLabel === "Biletuar pa Email" ? "Po ruan..." : "Lësho pa Dërguar"}
                </Button>
              </>
            );
          })()}
          {(stagedStatus ?? booking.status) === "ticketed" && (booking as any).ticketEmailPending && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => void runStatusImmediate("ticketed", "Emaili i Biletës u Dërgua", () => new Promise<any>((res, rej) => ticketBooking.mutate({ id }, { onSuccess: saved => res(saved), onError: (e: any) => rej(e) })))}
              disabled={statusTransitionBusy || ticketBooking.isPending}
              title="Dërgo tani emailin e biletës te agjenti"
            >
              {statusTransitionBusy || ticketBooking.isPending
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <Ticket className="mr-1.5 h-3.5 w-3.5" />}
              {statusTransitionBusy && statusTransitionLabel === "Emaili i Biletës u Dërgua" ? "Po dërgon..." : "Lësho Biletat"}
            </Button>
          )}
          {(stagedStatus ?? booking.status) === "ticketed"
            && (!(booking as any).airlineTicketUrl || /Emaili më i fundit:.*pa email/i.test(String((booking as any).ticketSearchNote || "")))
            && /wizz/i.test(booking.flight?.airline ?? "") && (
            <>
              {!(booking as any).ticketSearchExcluded && (
                <Button variant="outline" size="sm" className="text-pink-600 hover:text-pink-700 hover:bg-pink-50 border-pink-300"
                  onClick={() => void handleFetchWizzTicket()} disabled={fetchingWizzTicket}
                  title="Kërko konfirmimin e biletës në inbox-in e email-eve të Wizzair">
                  {fetchingWizzTicket
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <Ticket className="mr-1.5 h-3.5 w-3.5" />}
                  Kërko Biletën në Email
                </Button>
              )}
              <button type="button"
                onClick={() => void handleToggleTicketExclude(!(booking as any).ticketSearchExcluded)}
                disabled={togglingTicketExclude}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60 select-none"
                title={(booking as any).ticketSearchExcluded
                  ? "I përjashtuar nga kërkimi i biletës në email — kliko për ta rikthyer"
                  : "Përjashto këtë rezervim nga kërkimi i biletës në email (as automatikisht, as manualisht, pa shenjë te lista)"}>
                {togglingTicketExclude
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : (
                    <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border ${(booking as any).ticketSearchExcluded ? "border-slate-600 bg-slate-600" : "border-slate-400 bg-white"}`}>
                      {(booking as any).ticketSearchExcluded && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </span>
                  )}
                Përjashto nga Emaili
              </button>
            </>
          )}
        </div>
      </div>

      {/* Përmbledhja e fluturimit — gjithmonë në krye, para të dhënave të klientit */}
      {flight && (
        <Card className={flight.isConfirmed
          ? "overflow-hidden border-emerald-300 bg-emerald-50/70 shadow-sm"
          : "overflow-hidden border-blue-200 shadow-sm"}>
          <CardHeader className={flight.isConfirmed
            ? "p-2 bg-gradient-to-r from-emerald-100 via-emerald-50 to-green-50 border-b border-emerald-200"
            : "p-2 bg-gradient-to-r from-blue-50 via-white to-slate-50 border-b border-blue-100"}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm tracking-tight flex min-w-0 items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-white text-xs">✈</span>
                <span className="shrink-0">Informacion Fluturimi</span>
                <span className="text-slate-300">·</span>
                {flight.id ? (
                  <button
                    type="button"
                    onClick={() => setFlightPanelId(flight.id)}
                    className="min-w-0 truncate font-bold text-blue-700 hover:text-blue-800 hover:underline"
                    title="Menaxho fluturimin (vendet, çmimet, etj.)"
                  >
                    {flight.airline} {fmtFlightNum(flight.flightNumber)}
                  </button>
                ) : (
                  <span className="min-w-0 truncate font-bold text-blue-700">
                    {flight.airline} {fmtFlightNum(flight.flightNumber)}
                  </span>
                )}
              </CardTitle>
              {flightStatus && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Gjendja e fluturimit</span>
                  {flightStatus === "open" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-sm">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> OPEN
                    </span>
                  ) : flightStatus === "soldout" ? (
                    <span className="inline-flex items-center rounded-lg border border-red-200 bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">SOLD OUT</span>
                  ) : flightStatus === "cancelled" ? (
                    <span className="inline-flex items-center rounded-lg border border-red-300 bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">CANCELLED</span>
                  ) : flightStatus === "closed" ? (
                    <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">CLOSED</span>
                  ) : (
                    <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">{flight.status}</span>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className={flight.isConfirmed ? "p-2 bg-emerald-50/70" : "p-2"}>
            <div className="booking-flight-summary-grid grid grid-cols-1 gap-1.5 text-sm lg:grid-cols-[1.25fr_2.2fr_1.25fr]">
              <div className={flight.isConfirmed
                ? "rounded-lg border border-emerald-200 bg-emerald-100/70 px-2.5 py-1.5"
                : "rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50/90 to-cyan-50/60 px-2.5 py-1.5"}>
                <span className={`block text-[9px] font-bold uppercase tracking-wider ${flight.isConfirmed ? "text-emerald-700" : "text-blue-500"}`}>Rruga</span>
                <span className="mt-0.5 block font-bold text-slate-900">{flight.fromCity} → {flight.toCity}</span>
              </div>

              <div className={flight.isConfirmed
                ? "grid grid-cols-[1.15fr_1.15fr_.7fr] gap-3 rounded-lg border border-emerald-200 bg-emerald-100/70 px-2.5 py-1.5"
                : "grid grid-cols-[1.15fr_1.15fr_.7fr] gap-3 rounded-lg border border-violet-100 bg-gradient-to-r from-violet-50/70 to-slate-50 px-2.5 py-1.5"}>
                <div className="min-w-0">
                  <span className={`block text-[9px] font-bold uppercase tracking-wider ${flight.isConfirmed ? "text-emerald-700" : "text-violet-500"}`}>Nisja</span>
                  <span className="booking-flight-datetime mt-0.5 block truncate font-semibold text-slate-900">{format(new Date(flight.departureDate), "dd MMM yyyy")} <strong>{fmtAmPm(flight.departureTime)}</strong></span>
                </div>
                <div className="min-w-0 border-l border-violet-200/70 pl-3">
                  <span className={`block text-[9px] font-bold uppercase tracking-wider ${flight.isConfirmed ? "text-emerald-700" : "text-violet-500"}`}>Mbërritja</span>
                  <span className="booking-flight-datetime mt-0.5 block truncate font-semibold text-slate-900">
                    {flight.arrivalDate
                      ? <>{format(new Date(flight.arrivalDate), "dd MMM yyyy")} <strong>{fmtAmPm(flight.arrivalTime)}</strong></>
                      : (flight.arrivalTime ? <strong>{fmtAmPm(flight.arrivalTime)}</strong> : "—")}
                  </span>
                </div>
                {(() => {
                  if (!flight.departureTime || !flight.arrivalTime || !flight.departureDate || !flight.arrivalDate) return null;
                  try {
                    const dep = new Date(`${flight.departureDate}T${flight.departureTime}:00`);
                    const arr = new Date(`${flight.arrivalDate}T${flight.arrivalTime}:00`);
                    const mins = Math.round((arr.getTime() - dep.getTime()) / 60000);
                    if (!isFinite(mins) || mins <= 0) return null;
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    return (
                      <div className="border-l border-violet-200/70 pl-3">
                        <span className={`block text-[9px] font-bold uppercase tracking-wider ${flight.isConfirmed ? "text-emerald-700" : "text-violet-500"}`}>Kohëzgjatja</span>
                        <span className={`mt-0.5 block font-bold ${flight.isConfirmed ? "text-emerald-900" : "text-violet-900"}`}>{h}h {m}min</span>
                      </div>
                    );
                  } catch { return null; }
                })()}
              </div>

              <div className={`grid grid-cols-2 items-center gap-2 rounded-lg border border-emerald-200 px-2.5 py-1.5 ${flight.isConfirmed ? "bg-emerald-100/70" : "bg-gradient-to-r from-emerald-50/80 to-amber-50/70"}`}>
                {typeof flight.totalSeats === "number" && (
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-emerald-600">Vendet</span>
                    <span className="mt-0.5 block font-semibold text-slate-900">
                      {(() => {
                        const free = Math.max(0, (flight.totalSeats || 0) - (flight.soldSeats || 0));
                        const cls = free < 10 ? "text-red-600" : "text-emerald-700";
                        return <><span className={`${cls} font-extrabold`}>{free}</span> / {flight.totalSeats} të lira</>;
                      })()}
                    </span>
                  </div>
                )}
                {flight.isConfirmed && (
                  <div className="flex justify-end">
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white/80 px-2 py-1 text-[11px] font-bold text-emerald-800 shadow-sm">
                      <span className="text-xs leading-none">⭐</span>
                      Konfirmuar
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2 border-t border-slate-100 pt-1.5">
              <GoogleFlightPrice
                from={flight.fromAirport || flight.fromCity}
                to={flight.toAirport || flight.toCity}
                date={flight.departureDate}
                flightNumber={flight.flightNumber}
                adultPrice={flight.adultPrice != null ? Number(flight.adultPrice) : null}
                flightId={flight.id ?? null}
              />
              <GooglePriceAdminUpdater
                flightId={flight.id ?? null}
                compact
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: getGetBookingQueryKey(id) }); }}
              />
            </div>
            {flight.id != null && (
              <FlightNotes flightId={flight.id} title="Shënime Fluturimi" hideWhenEmpty className="mt-1.5" />
            )}
          </CardContent>
        </Card>
      )}

      {/* Rezultati i fundit i kërkimit të biletës në email — shënim i përhershëm */}
      {(booking as any).ticketSearchNote
        && (!(booking as any).airlineTicketUrl || /Emaili më i fundit:.*pa email/i.test(String((booking as any).ticketSearchNote || "")))
        && /wizz/i.test(booking.flight?.airline ?? "") && (
        <div className="rounded-lg border border-pink-200 bg-pink-50/70 px-3 py-2 text-sm text-slate-700 flex items-start gap-2">
          <Ticket className="h-4 w-4 text-pink-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="font-semibold text-pink-700">Kërkimi i fundit i biletës në email</span>
            {(booking as any).ticketSearchNoteAt && (
              <span className="text-xs text-slate-500 ml-1.5">
                ({format(new Date((booking as any).ticketSearchNoteAt), "dd/MM/yyyy h:mm a")})
              </span>
            )}
            <div className="whitespace-pre-wrap break-words mt-0.5">{(booking as any).ticketSearchNote}</div>
          </div>
        </div>
      )}

      {/* Linked tasks notification */}
      {activeLinkedTasks.length > 0 && (
        <div className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-violet-800 font-semibold text-sm mb-1.5">
            <CheckSquare className="h-4 w-4" />
            {activeLinkedTasks.length === 1
              ? "1 detyrë aktive e lidhur me këtë rezervim"
              : `${activeLinkedTasks.length} detyra aktive të lidhura me këtë rezervim`}
          </div>
          <div className="flex flex-col gap-1">
            {activeLinkedTasks.map((t: any) => (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(`/tasks?task=${t.id}`)}
                className="flex items-center gap-2 text-left text-sm text-violet-900 hover:underline"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
                <span className="truncate">{t.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Assign to Group Panel */}
      {assignGroupOpen && (
        <AssignToGroupPanel
          booking={booking}
          onClose={() => { setAssignGroupOpen(false); setSelectedPaxIds(new Set()); }}
          selectedPassengerIds={Array.from(selectedPaxIds)}
        />
      )}

      {/* Flight management side panel (vendet, çmimet, etj.) */}
      {flightPanelId !== null && (
        <Suspense fallback={null}>
          <FlightSidePanel
            flightId={flightPanelId}
            onClose={() => setFlightPanelId(null)}
            onUpdated={() => {
              queryClient.invalidateQueries({ queryKey: getGetBookingQueryKey(id) });
              queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
            }}
          />
        </Suspense>
      )}

      {/* Floating "Cakto Grupin" — shfaqet vetëm kur ka pasagjerë të selektuar */}
      {!assignGroupOpen && selectedPaxIds.size > 0 && (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col items-end gap-2">
          <div className="bg-white border-2 border-purple-300 rounded-xl shadow-[0_8px_24px_rgba(124,58,237,0.25)] px-3 py-3 flex flex-col items-stretch gap-2 min-w-[180px]">
            <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-purple-600 text-white text-xs">{selectedPaxIds.size}</span>
              <span>{selectedPaxIds.size === 1 ? "pasagjer i zgjedhur" : "pasagjerë të zgjedhur"}</span>
            </div>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold w-full"
              onClick={() => setAssignGroupOpen(true)}
            >
              <Users className="mr-1.5 h-4 w-4" /> Cakto Grupin
            </Button>
            <button
              type="button"
              onClick={() => setSelectedPaxIds(new Set())}
              className="text-xs text-slate-500 hover:text-slate-700 underline self-center"
            >
              Hiq zgjedhjen
            </button>
          </div>
        </div>
      )}


      {/* Pending Price Request Banner */}
      {(pendingPriceRequest || pendingNetPriceRequest) && (
        <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-3 flex items-start gap-3">
          <MessageSquarePlus className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-orange-800 text-sm">Kërkesa në Pritje</p>
            <div className="text-sm text-orange-700 space-y-0.5 mt-0.5">
              {pendingPriceRequest && <p>• Çmim shitjeje i sugjeruar: <strong>€{fmtM(pendingPriceRequest.suggestedAmount)}</strong></p>}
              {pendingNetPriceRequest && <p>• Çmim neto i sugjeruar: <strong>€{fmtM(pendingNetPriceRequest.suggestedAmount)}</strong></p>}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {pendingPriceRequest && (
              <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white" onClick={() => setChatOpen(true)}>Hap Bisedën</Button>
            )}
            {pendingNetPriceRequest && (
              <Button size="sm" className="h-7 text-xs bg-teal-500 hover:bg-teal-600 text-white" onClick={() => setNetChatOpen(true)}>Hap Bisedën</Button>
            )}
          </div>
        </div>
      )}

      {/* Customer */}
      <div className="grid gap-2">
        <Card>
          <CardHeader className={cn("p-0", customerInfoOpen && "border-b")}>
            <button
              type="button"
              aria-expanded={customerInfoOpen}
              onClick={() => setCustomerInfoOpen(open => !open)}
              className="flex w-full items-center justify-between gap-2 p-2.5 text-left hover:bg-slate-50 transition-colors rounded-t-lg"
            >
              <CardTitle className="text-sm">Informacion Klienti</CardTitle>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", customerInfoOpen && "rotate-180")} />
            </button>
          </CardHeader>
          {customerInfoOpen && (
            <CardContent className="space-y-1.5 p-2.5">
              {isAdmin ? (
                <>
                  <AutoSaveInput label="Emri i Klientit" value={booking.customerName || ""} onSave={handleSaveCustomerName} validate={v => isLettersOnly(v) ? null : NAME_ERROR} />
                  <div className="grid grid-cols-2 gap-2">
                    <AutoSaveInput label="Email" value={booking.customerEmail || ""} onSave={handleSaveCustomerEmail} placeholder="email@example.com" />
                    <AutoSaveInput label="Telefon" value={booking.customerPhone || ""} onSave={handleSaveCustomerPhone} placeholder="+355..." />
                  </div>
                  <AgencyCombobox
                    agents={agentsList as any[]}
                    value={stagedAgentId !== undefined ? stagedAgentId : ((booking as any).agentId ?? null)}
                    onChange={handleChangeAgent}
                  />
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2"><span className="text-muted-foreground">Emri:</span><span className="font-medium">{booking.customerName}</span></div>
                  {(booking as any).agentName && (
                    <div className="grid grid-cols-2"><span className="text-muted-foreground">Agjencia:</span><span className="inline-flex items-center gap-1.5">{(booking as any).agentName}<AgentRankBadge agentName={(booking as any).agentName} /></span></div>
                  )}
                </>
              )}
              {/* Shënime brenda rezervimit (Enter dërgon, s'editohen, me reply, me scroll kur ka shumë tekst) */}
              <BookingComments bookingId={id} embedded />
            </CardContent>
          )}
        </Card>
      </div>

      {/* PNR + Çmimet */}
      {(() => {
        const uniquePnrs = Array.from(new Set(
          (booking.passengers ?? [])
            .map((p: any) => (p.pnr ?? "").toString().trim().toUpperCase())
            .filter((s: string) => s.length > 0)
        ));
        const pnrDisplay = uniquePnrs.length > 0
          ? uniquePnrs.map((p, i) => uniquePnrs.length > 1 ? `PNR${i + 1} ${p}` : p).join(" / ")
          : "—";
        const card = (
          <div className="bg-white border border-slate-200 rounded-lg text-sm divide-y divide-slate-100 shadow-sm overflow-hidden">
            <div className="p-2 flex justify-between items-center bg-amber-100/80">
              <span className="text-slate-700 text-xs font-bold uppercase tracking-wider">PNR</span>
              <span className="font-mono text-amber-900 font-bold tabular-nums text-sm truncate ml-2" title={pnrDisplay}>{pnrDisplay}</span>
            </div>
            <div className="p-2 flex justify-between items-center gap-2">
              <span className="text-slate-700 font-medium">Shuma e Shitjes</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-slate-900 font-bold tabular-nums text-base" title="Llogaritet automatikisht nga çmimi i biletës + ekstrat">€{fmtM(totalAmount)}</span>
                {canSuggestPrice === true && (
                  <button onClick={() => setChatOpen(true)}
                    className={`relative flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${pendingPriceRequest ? "border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100" : "border-blue-200 bg-blue-50 text-blue-500 hover:bg-blue-100"}`}
                    title={pendingPriceRequest ? `Në pritje: €${fmtM(pendingPriceRequest.suggestedAmount)}` : "Sugjero ndryshim çmimi"}>
                    {pendingPriceRequest ? <Clock className="h-3 w-3" /> : <MessageSquarePlus className="h-3 w-3" />}
                    {pendingPriceRequest && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 border border-white" />}
                  </button>
                )}
              </div>
            </div>
            <div className="p-2 flex justify-between items-center gap-2">
              <span className="text-slate-700 font-medium">Çmimi Neto</span>
              {booking.status !== "cancelled" && (user?.role === "admin" || canEditNetPrice) ? (
                <CompactAutoSaveNumber value={netPrice} onSave={handleSaveNetPrice} />
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-slate-900 font-bold tabular-nums text-base">
                    {netPrice != null ? `€${fmtM(netPrice)}` : <span className="text-muted-foreground/40 italic">—</span>}
                  </span>
                  {booking.status !== "cancelled" && canSuggestPrice === true && (
                    <button onClick={() => setNetChatOpen(true)}
                      className={`relative flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${pendingNetPriceRequest ? "border-teal-300 bg-teal-50 text-teal-600 hover:bg-teal-100" : "border-teal-200 bg-teal-50/60 text-teal-500 hover:bg-teal-100"}`}
                      title={pendingNetPriceRequest ? `Neto në pritje: €${fmtM(pendingNetPriceRequest.suggestedAmount)}` : "Sugjero çmim neto"}>
                      {pendingNetPriceRequest ? <Clock className="h-3 w-3" /> : <MessageSquarePlus className="h-3 w-3" />}
                      {pendingNetPriceRequest && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-teal-400 border border-white" />}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="p-2 flex justify-between items-center bg-emerald-100/70">
              <span className="text-slate-700 font-medium">Komisioni</span>
              {commissionAmount != null ? (
                <span className={`font-mono font-bold tabular-nums text-base ${commissionAmount >= 0 ? "text-emerald-700" : "text-destructive"}`}>€{fmtM(commissionAmount)}</span>
              ) : (
                <span className="text-muted-foreground/40 italic text-xs">— vendos neto</span>
              )}
            </div>
          </div>
        );
        return priceCardSlot ? createPortal(card, priceCardSlot) : card;
      })()}

      <PriceChatPanel open={chatOpen} onClose={() => setChatOpen(false)} requestId={pendingPriceRequest?.id ?? null}
        bookingId={id} bookingRef={booking.bookingRef} currentAmount={totalAmount} requestType="sell"
        onRequestCreated={(req) => { setPendingPriceRequest(req); }} onStatusChange={() => { invalidate(); }} />
      <PriceChatPanel open={netChatOpen} onClose={() => setNetChatOpen(false)} requestId={pendingNetPriceRequest?.id ?? null}
        bookingId={id} bookingRef={booking.bookingRef} currentAmount={netPrice ?? 0} requestType="net"
        onRequestCreated={(req) => { setPendingNetPriceRequest(req); }} onStatusChange={() => { invalidate(); }} />
      <ChangeLogPanel open={changeLogOpen} onClose={() => setChangeLogOpen(false)} bookingId={id} bookingRef={booking.bookingRef} />

      {/* Payment Status */}
      {(() => {
        const rawPayments = ((booking as any).payments ?? []) as any[];
        const payments = rawPayments
          .map((p: any) => paymentPatchOverlay[p.id] ? { ...p, ...paymentPatchOverlay[p.id] } : p)
          .concat(paymentAddOverlay.map((a: any) => ({
            id: `tmp-${a.tempId}`,
            bookingId: id,
            amount: a.amount, method: a.method, status: "pending",
            reference: a.reference, notes: a.notes, isRefund: false,
            createdAt: new Date().toISOString(), __staged: true,
          })));
        const methodLabelOf = (p: any) => {
          const isAutoCredit = p.isRefund && p.reference === "KREDIT-AUTO";
          return isAutoCredit ? "Kreditim (auto)" : p.isRefund ? "Rimbursim"
            : p.method === "cash" ? "Para në dorë" : p.method === "bank_transfer" ? "Transfertë"
            : p.method === "card" ? "Kartë" : p.method === "credit" ? "Kredit"
            : p.method === "online" ? "Online" : p.method;
        };
        if (paymentsSlot) {
          const compact = (
            <div className="bg-white border border-slate-200 rounded-lg text-xs divide-y divide-slate-100 shadow-sm overflow-hidden">
              <div className="px-2.5 py-1.5 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center justify-between">
                <span>Historia e Pagesave</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono normal-case tracking-normal text-slate-400">{payments.length}</span>
                  <button onClick={openAddPayment} className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-700">+ Shto</button>
                </div>
              </div>
              {payments.length === 0 ? (
                <div className="px-2.5 py-3 text-center text-slate-400 italic">Nuk ka pagesa</div>
              ) : (
                payments.map((p: any) => {
                  const isAutoCredit = p.isRefund && p.reference === "KREDIT-AUTO";
                  const isStaged = !!p.__staged;
                  const isCancelled = p.status === "cancelled";
                  const canEdit = !p.isRefund && !isStaged && !isCancelled && typeof p.id === "number";
                  const canCancel = !isStaged && !isCancelled && typeof p.id === "number" && !isAutoCredit;
                  return (
                    <div key={p.id} className={cn(
                      "px-2.5 py-2 space-y-0.5",
                      isCancelled ? "bg-red-50 opacity-70" :
                      isStaged ? "bg-amber-50/60" : isAutoCredit ? "bg-blue-50/40" : p.isRefund ? "bg-red-50/40" : ""
                    )}>
                      <div className="flex justify-between items-center gap-2">
                        <span className={cn(
                          "font-medium truncate flex items-center gap-1",
                          isCancelled ? "text-red-600 line-through" :
                          isAutoCredit ? "text-blue-700" : p.isRefund ? "text-red-700" : "text-slate-700"
                        )}>
                          {methodLabelOf(p)}
                          {isStaged && <span className="text-[9px] bg-amber-200 text-amber-900 px-1 rounded font-bold uppercase">i ri</span>}
                          {!isStaged && !isCancelled && paymentPatchOverlay[p.id] && <span className="text-[9px] bg-amber-200 text-amber-900 px-1 rounded font-bold uppercase">edit</span>}
                          {isCancelled && <span className="text-[9px] bg-red-200 text-red-900 px-1 rounded font-bold uppercase no-underline">anuluar</span>}
                        </span>
                        <span className={cn(
                          "font-mono font-semibold tabular-nums shrink-0",
                          isCancelled ? "text-red-500 line-through" :
                          isAutoCredit ? "text-blue-700" : p.isRefund ? "text-destructive" : "text-emerald-600"
                        )}>{p.isRefund ? "−" : "+"}€{fmtM(p.amount)}</span>
                      </div>
                      <div className={cn("flex justify-between items-start gap-2 text-[10px] text-slate-500", isCancelled && "line-through")}>
                        <span className="font-mono shrink-0">{format(new Date(p.createdAt), "dd.MM.yyyy h:mm a")}</span>
                        {p.reference && p.reference !== "KREDIT-AUTO" && (
                          <span className="text-slate-500 break-words text-right">{p.reference}</span>
                        )}
                      </div>
                      {p.invoiceCode && (
                        <div className={cn("font-mono text-[10px] font-semibold text-slate-600", isCancelled && "line-through")} title="Kodi i faturës">{p.invoiceCode}</div>
                      )}
                      {p.notes && <div className={cn("text-[10px] text-slate-500 italic break-words", isCancelled && "line-through")}>{p.notes}</div>}
                      {(canEdit || canCancel || isStaged || (typeof p.id === "number" && !isStaged)) && (
                        <div className="flex gap-2 pt-0.5 items-center">
                          {canEdit && (
                          <button onClick={() => setEditingPayment({ id: p.id, amount: String(p.amount), method: p.method, reference: p.reference || "", notes: p.notes || "", payerType: (p as any).payerType === "invoice" || (p as any).payerType === "client" ? (p as any).payerType : "" })}
                              className="text-[10px] text-indigo-600 hover:underline">Edito</button>
                          )}
                          {canCancel && (
                            <button onClick={() => handleCancelPayment(p.id)}
                              className="text-[10px] text-red-600 hover:underline font-semibold">Anulo pagesën</button>
                          )}
                          {isStaged && (
                            <button onClick={() => handleDeleteStagedPayment(String(p.id).slice(4))}
                              className="text-[10px] text-red-600 hover:underline font-semibold">Hiq</button>
                          )}
                          {typeof p.id === "number" && !isStaged && (
                            <a href={`${API_BASE}/payments/${p.id}/invoice`} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-slate-600 hover:underline font-semibold inline-flex items-center gap-0.5"
                              title={p.invoiceCode ? `Shkarko Faturën ${p.invoiceCode}` : "Shkarko Faturën"}>
                              <Download className="h-3 w-3" /> Faturë
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {creditAmount > 0 && (
                <div className="px-2.5 py-1.5 bg-blue-50/60 flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider text-blue-600 font-bold">Tepricë / Kredit</span>
                  <span className="font-mono font-bold text-blue-700 tabular-nums">€{fmtM(creditAmount)}</span>
                </div>
              )}
            </div>
          );
          return createPortal(compact, paymentsSlot);
        }
        return (
          <Card>
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pagesat</CardTitle>
                <Button size="sm" variant="outline" onClick={openAddPayment} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Shto Pagesë
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className={`grid ${creditAmount > 0 ? "grid-cols-4" : "grid-cols-3"} text-center divide-x border rounded-md p-2 mb-3 bg-muted/20`}>
                <div><div className="text-sm text-muted-foreground">Shuma Totale</div><div className="text-2xl font-bold">€{fmtM(totalAmount)}</div></div>
                <div><div className="text-sm text-muted-foreground">Paguar (biletë)</div><div className="text-2xl font-bold text-green-600">€{fmtM(paidAmount)}</div></div>
                {creditAmount > 0 && <div><div className="text-sm text-muted-foreground">Tepricë / Kredit</div><div className="text-2xl font-bold text-blue-600">€{fmtM(creditAmount)}</div></div>}
                <div><div className="text-sm text-muted-foreground">Mbetet</div><div className={`text-2xl font-bold ${dueAmount > 0 ? "text-destructive" : "text-muted-foreground"}`}>€{fmtM(dueAmount)}</div></div>
              </div>
              <h3 className="font-medium mb-2">Historia e Pagesave</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead><TableHead>Metoda</TableHead><TableHead>Referenca</TableHead><TableHead>Shuma</TableHead><TableHead>Statusi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">Nuk ka pagesa</TableCell></TableRow>
                  ) : (
                    payments.map((p: any) => {
                      const isAutoCredit = p.isRefund && p.reference === "KREDIT-AUTO";
                      const isCancelled = p.status === "cancelled";
                      const isStaged = !!p.__staged;
                      const canCancel = !p.__staged && !isCancelled && typeof p.id === "number" && !isAutoCredit;
                      return (
                        <TableRow key={p.id} className={cn(
                          isCancelled ? "bg-red-50 opacity-70" :
                          isStaged ? "bg-amber-50/60" :
                          isAutoCredit ? "bg-blue-50/40" : p.isRefund ? "bg-red-50/50" : ""
                        )}>
                          <TableCell className={isCancelled ? "line-through text-red-500" : ""}>{format(new Date(p.createdAt), "dd MMM yyyy h:mm a")}</TableCell>
                          <TableCell><span className={cn("font-medium text-sm", isCancelled ? "line-through text-red-500" : isAutoCredit ? "text-blue-700" : p.isRefund ? "text-red-700" : "")}>{methodLabelOf(p)}{isStaged && <span className="ml-1 text-[9px] bg-amber-200 text-amber-900 px-1 rounded font-bold uppercase">i ri</span>}</span></TableCell>
                          <TableCell className={isCancelled ? "line-through text-red-500" : ""}>{p.invoiceCode && <div className="font-mono text-[10px] font-semibold text-slate-600" title="Kodi i faturës">{p.invoiceCode}</div>}<div className="text-sm">{p.reference || "-"}</div>{p.notes && <div className="text-xs text-muted-foreground mt-0.5">{p.notes}</div>}</TableCell>
                          <TableCell className={cn("font-semibold", isCancelled ? "line-through text-red-500" : isAutoCredit ? "text-blue-700" : p.isRefund ? "text-destructive" : "text-green-600")}>{p.isRefund ? "−" : "+"}€{fmtM(p.amount)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={isCancelled ? "border-red-400 text-red-700 bg-red-50" : isAutoCredit ? "border-blue-300 text-blue-700" : p.isRefund ? "border-red-300 text-red-700" : ""}>{isCancelled ? "Anuluar" : p.status}</Badge>
                              {canCancel && (
                                <button onClick={() => handleCancelPayment(p.id)} className="text-[10px] text-red-600 hover:underline font-semibold">Anulo</button>
                              )}
                              {isStaged && (
                                <button onClick={() => handleDeleteStagedPayment(String(p.id).slice(4))} className="text-[10px] text-red-600 hover:underline font-semibold">Hiq</button>
                              )}
                              {typeof p.id === "number" && !isStaged && (
                                <a href={`${API_BASE}/payments/${p.id}/invoice`} target="_blank" rel="noopener noreferrer"
                                  className="text-[10px] text-slate-600 hover:underline font-semibold inline-flex items-center gap-0.5"
                                  title={p.invoiceCode ? `Shkarko Faturën ${p.invoiceCode}` : "Shkarko Faturën"}>
                                  <Download className="h-3 w-3" /> Faturë
                                </a>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}

      {/* Passengers */}
      <Card>
        <CardHeader className="p-2 pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Pasagjerët ({passengersView.filter((p: any) => !p.cancelled).length}{passengersView.some((p: any) => p.cancelled) ? ` + ${passengersView.filter((p: any) => p.cancelled).length} të anuluar` : ""})</CardTitle>
            {booking.status !== "cancelled" && (
              <Button size="sm" variant="outline" onClick={() => { setNewPaxForm(emptyNewPax()); setAddPassengerOpen(true); }} className="gap-1 h-6 text-xs px-2">
                <Plus className="h-3 w-3" /> Shto Pasagjer
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <Table className="[&_td]:py-0 [&_th]:h-7">
            <TableHeader>
              <TableRow className="!bg-gradient-to-r !from-indigo-600 !via-indigo-700 !to-violet-700 hover:!bg-indigo-700 border-b-2 !border-amber-300/70">
                <TableHead className="!text-white w-8 px-2">
                  {(() => {
                    const selectable = passengersView.filter((p: any) => !p.cancelled);
                    const allSelected = selectable.length > 0 && selectable.every((p: any) => selectedPaxIds.has(String(p.id)));
                    const someSelected = selectable.some((p: any) => selectedPaxIds.has(String(p.id)));
                    return (
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-purple-500"
                        title={allSelected ? "Hiq të gjithë" : "Selekto të gjithë"}
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                        onChange={() => {
                          setSelectedPaxIds(() => {
                            if (allSelected) return new Set();
                            return new Set(selectable.map((p: any) => String(p.id)));
                          });
                        }}
                      />
                    );
                  })()}
                </TableHead>
                <TableHead className="!text-white !font-semibold uppercase text-[11px] tracking-wider">Emri</TableHead>
                <TableHead className="!text-white !font-semibold uppercase text-[11px] tracking-wider">Tipi</TableHead>
                <TableHead className="!text-white !font-semibold uppercase text-[11px] tracking-wider">M/F</TableHead>
                <TableHead className="!text-white !font-semibold uppercase text-[11px] tracking-wider">Çmimi Biletës</TableHead>
                <TableHead className="!text-white !font-semibold uppercase text-[11px] tracking-wider">SEAT</TableHead>
                <TableHead className="!text-white !font-semibold uppercase text-[11px] tracking-wider">Datëlindja</TableHead>
                <TableHead className="!text-white !font-semibold uppercase text-[11px] tracking-wider">Shtesa</TableHead>
                <TableHead className="!text-white !font-semibold uppercase text-[11px] tracking-wider">Grupi</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {passengersView.map((p: any, idx: number) => (
                <TableRow key={p.id} className={cn(
                  "border-b border-blue-200 hover:!bg-inherit",
                  p.cancelled
                    ? "!bg-red-50/80 line-through text-red-700/70 [&_*]:!text-red-700/70 [&_*]:line-through"
                    : (p.__staged ? "!bg-amber-50" : (paxPatchOverlay[p.id] ? "!bg-yellow-50" : (idx % 2 === 0 ? "!bg-blue-50" : "!bg-blue-100/70")))
                )}>
                  <TableCell className="w-8 px-2">
                    {!p.cancelled && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-purple-500"
                        checked={selectedPaxIds.has(String(p.id))}
                        onChange={(e) => {
                          const id = String(p.id);
                          setSelectedPaxIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(id); else next.delete(id);
                            return next;
                          });
                        }}
                        aria-label={`Selekto ${p.firstName} ${p.lastName}`}
                      />
                    )}
                  </TableCell>
                  <TableCell className={cn("font-semibold !text-slate-900 text-sm border-l-4", p.cancelled ? "border-l-red-500" : "border-l-indigo-500")}>
                    {p.firstName} {p.lastName}
                    {p.__staged && <span className="ml-1.5 text-[9px] bg-amber-200 text-amber-900 px-1 rounded font-bold uppercase no-underline">i ri</span>}
                    {!p.__staged && paxPatchOverlay[p.id] && !p.cancelled && <span className="ml-1.5 text-[9px] bg-yellow-200 text-yellow-900 px-1 rounded font-bold uppercase no-underline">edit</span>}
                    {p.cancelled && <span className="ml-1.5 text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold uppercase no-underline">i anuluar</span>}
                  </TableCell>
                  <TableCell className="capitalize !text-slate-800 text-sm">{p.type === "adult" ? "I rritur" : p.type === "child" ? "Fëmijë" : "Foshnjë"}</TableCell>
                  <TableCell className="!text-slate-800 text-sm font-medium">{p.gender === "M" ? "M" : p.gender === "F" ? "F" : <span className="text-slate-400">-</span>}</TableCell>
                  <TableCell>
                    <InlineTicketPrice
                      passenger={p}
                      booking={booking}
                      onSave={(val) => {
                        if (typeof p.id === "string" && p.id.startsWith("tmp-")) {
                          const tempId = p.id.slice(4);
                          setPaxAddOverlay(prev => prev.map(x => x.tempId === tempId ? { ...x, ticketPrice: val == null ? null : Math.round(val) } : x));
                          return Promise.resolve();
                        }
                        return new Promise<void>((res, rej) => updatePassenger.mutate(
                          { id: p.id, data: { ticketPrice: val == null ? null : Math.round(val) } as any },
                          { onSuccess: () => { invalidate(); res(); }, onError: (e: any) => rej(e) }
                        ));
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-slate-800 font-medium">{p.seatNumber || <span className="text-slate-400">-</span>}</TableCell>
                  <TableCell>
                    {p.dateOfBirth
                      ? <span className="text-sm font-medium">{p.dateOfBirth.split("-").reverse().join("/")}</span>
                      : (p.type === "child" || p.type === "infant")
                        ? <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Mungon!</span>
                        : <span className="text-muted-foreground">-</span>
                    }
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const paxFullName = `${p.firstName} ${p.lastName}`;
                      const hasBagazhExtra = extras.some((ex: any) => {
                        const d: string = ex.description || "";
                        return d === "Bagazh" || (d.startsWith("Bagazh") && d.includes(paxFullName));
                      });
                      const hasSeatExtra = extras.some((ex: any) => {
                        const d: string = ex.description || "";
                        return d === "Ulëse" || d === "SEAT" || ((d.startsWith("Ulëse") || d.startsWith("SEAT")) && d.includes(paxFullName));
                      });
                      const hasPriorityExtra = extras.some((ex: any) => {
                        const d: string = ex.description || "";
                        return d === "Prioritet" || (d.startsWith("Prioritet") && d.includes(paxFullName));
                      });
                      const hasInsuranceExtra = extras.some((ex: any) => {
                        const d: string = ex.description || "";
                        return d === "Sigurim" || (d.startsWith("Sigurim") && d.includes(paxFullName));
                      });
                      const showBagazh = p.baggageOption === "checked" || hasBagazhExtra;
                      const showSeat = p.hasSeatSelection || hasSeatExtra;
                      const showPriority = p.hasPriorityBoarding || hasPriorityExtra;
                      const showInsurance = p.hasInsurance || hasInsuranceExtra;
                      const clearBaggageOption = () => queueClearBaggage(p.id);
                      return (
                        <div className="flex gap-1 flex-wrap">
                          {showBagazh && (
                            <Badge variant="secondary" className="text-xs flex items-center gap-1 pr-1">
                              {(() => { const kg = Number((booking as any)?.flight?.checkedBaggageKg) || 0; return kg > 0 ? `Bagazh ${kg} KG` : "Bagazh"; })()}
                              {p.baggageOption === "checked" && (
                                <button onClick={clearBaggageOption} className="ml-0.5 hover:text-destructive" title="Fshi">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              )}
                            </Badge>
                          )}
                          {showSeat && <Badge variant="secondary" className="text-xs">SEAT</Badge>}
                          {showPriority && <Badge variant="secondary" className="text-xs">Prioritet</Badge>}
                          {showInsurance && <Badge variant="secondary" className="text-xs">Sigurim</Badge>}
                          {!showBagazh && !showSeat && !showPriority && !showInsurance && <span className="text-muted-foreground text-sm">-</span>}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {p.groupPnr
                      ? (
                          p.groupTicketId
                            ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openGroupDialog(p.groupTicketId);
                                  }}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold font-mono bg-indigo-100 text-indigo-800 border border-indigo-300 hover:bg-indigo-200 hover:border-indigo-400 cursor-pointer transition-colors"
                                  title="Kliko për të parë detajet e grupit"
                                >
                                  {p.groupPnr}
                                </button>
                              )
                            : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold font-mono bg-indigo-100 text-indigo-800 border border-indigo-300" title="PNR nga grupi">{p.groupPnr}</span>
                        )
                      : <span className="text-slate-400 text-xs">-</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      {!p.__staged && !p.cancelled && (
                        <Button size="sm" variant="ghost" onClick={() => openEditPassenger(p)} title="Edito" className="h-6 w-6 p-0"><Pencil className="h-3.5 w-3.5" /></Button>
                      )}
                      {p.cancelled
                        ? <Button size="sm" variant="ghost" onClick={() => handleRestorePassenger(p)} title="Riktheji" className="h-6 w-6 p-0 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 no-underline [&_*]:no-underline"><RotateCcw className="h-3.5 w-3.5" /></Button>
                        : <Button size="sm" variant="ghost" onClick={() => setDeletePaxConfirm(p)} title="Anulo (mbetet me vijë)" className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></Button>
                      }
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Excel Copy Panel */}
          {(() => {
            const fl = (booking as any).flight;
            // ticketed = CONFIRMED; çdo gjë tjetër = WAITING
            const statusExcel = booking.status === "ticketed" ? "CONFIRMED"
              : booking.status === "cancelled" ? "ANULUAR"
              : "WAITING";
            const operatorRaw = ((booking as any).agentName || "ONLINE TRAVEL").toUpperCase();
            // Vetëm te teksti i kopjimit (Excel/WhatsApp): shfaq "TRAVEL AGENCY 771" si "AGENCY 771".
            const operator = operatorRaw === "TRAVEL AGENCY 771" ? "AGENCY 771" : operatorRaw;
            const route = fl ? `${fl.fromAirport || fl.fromCity}-${fl.toAirport || fl.toCity}` : "";
            const depTime = fmtAmPm(fl?.departureTime);
            const depDate = fl?.departureDate
              ? (() => { const d = new Date(fl.departureDate); return `${d.getUTCDate()}.${d.getUTCMonth()+1}.${d.getUTCFullYear()}`; })()
              : "";

            // Pasagjerët e anuluar hiqen nga lista "Kopjo për Excel"
            const mainPax = booking.passengers.filter((p: any) => !p.cancelled);
            const nonInfantCount = mainPax.filter((p: any) => p.type !== "infant" && !p.cancelled).length;
            const numPax = fl?.isConfirmed ? `${nonInfantCount}⭐` : String(nonInfantCount);

            const paxRows = mainPax.map((p: any) => {
                const paxPnr = (p.pnr ?? "").toString();
                const currentPnr = (excelPnrDrafts[p.id] ?? paxPnr);
                const pnrDirty = currentPnr.trim().toUpperCase() !== paxPnr.trim().toUpperCase();
                // Emri + DOB vetëm për fëmijët nën 12 vjeç dhe infantët (jo për adultët)
                let showDob = false;
                if (p.dateOfBirth) {
                  if (p.type === "infant" || p.type === "child") {
                    showDob = true;
                  } else {
                    const birth = new Date(p.dateOfBirth);
                    if (!isNaN(birth.getTime())) {
                      const dep = fl?.departureDate ? new Date(fl.departureDate) : new Date();
                      let age = dep.getFullYear() - birth.getFullYear();
                      const m = dep.getMonth() - birth.getMonth();
                      if (m < 0 || (m === 0 && dep.getDate() < birth.getDate())) age--;
                      if (age < 12) showDob = true;
                    }
                  }
                }
                const dob = showDob ? p.dateOfBirth.split("-").reverse().join("/") : "";
                const name = `${p.firstName} ${p.lastName}${dob ? ` (${dob})` : ""}`;

                // EXTRA: INF / PRIOR / {kg} KG / PRIOR+{kg} KG / bosh
                // Prioriteti dhe bagazhi zbulohen njësoj si te badge-t: nga fusha e
                // pasagjerit OSE nga një ekstra që i përket këtij pasagjeri (me emër).
                const paxFullName = `${p.firstName} ${p.lastName}`;
                const hasBagExtra = extras.some((ex: any) => {
                  const d: string = ex.description || "";
                  return d === "Bagazh" || (d.startsWith("Bagazh") && d.includes(paxFullName));
                });
                const hasPriorExtra = extras.some((ex: any) => {
                  const d: string = ex.description || "";
                  return d === "Prioritet" || (d.startsWith("Prioritet") && d.includes(paxFullName));
                });
                const hasBag = p.baggageOption === "checked" || hasBagExtra;
                const hasPrior = p.hasPriorityBoarding || hasPriorExtra;
                const bagKg = Number(fl?.checkedBaggageKg) || 0;
                const bagLabel = bagKg > 0 ? `${bagKg} KG` : "BAG";
                let col2 = "";
                if (p.type === "infant") {
                  col2 = "INF";
                } else {
                  const parts: string[] = [];
                  if (hasPrior) parts.push("PRIOR");
                  if (hasBag) parts.push(bagLabel);
                  col2 = parts.join("+");
                }

                // Çmimi — shkon te kolona -1 SHITUR
                let price = "";
                let priceDisplay = "";
                if (p.ticketPrice != null) {
                  price = `${Number(p.ticketPrice).toFixed(0)}`;
                  priceDisplay = `${price} €`;
                } else if (fl) {
                  const base = p.type === "infant" ? fl.infantPrice
                    : p.type === "child" ? fl.childPrice
                    : fl.adultPrice;
                  price = `${Number(base ?? 0).toFixed(0)}`;
                  priceDisplay = `${price} €`;
                }

                const extraCost = Number(p.extraCost ?? 0);
                return { paxId: p.id, paxPnr, currentPnr, pnrDirty, name, col2, extraCost, status: statusExcel, price, priceDisplay, op: operator, numPax, note: currentPnr.trim(), date: depDate, time: depTime, route };
              });

            const dirtyRows = paxRows.filter(r => r.pnrDirty);
            const hasUnsaved = dirtyRows.length > 0;

            const savePnrs = () => {
              if (!hasUnsaved || excelSaving) return;
              // Kodi PNR i vendosur manualisht duhet të ketë SAKTËSISHT 6 karaktere
              // (as më pak, as më shumë). Lejohet vetëm bosh (për ta pastruar PNR-në).
              const invalidPnr = dirtyRows.filter(r => {
                const v = r.currentPnr.trim();
                return v.length > 0 && v.length !== 6;
              });
              if (invalidPnr.length > 0) {
                toast({
                  title: "PNR i pavlefshëm",
                  description: "Kodi PNR duhet të ketë saktësisht 6 karaktere.",
                  variant: "destructive",
                });
                return;
              }
              const snapshot = dirtyRows.map(r => ({ paxId: r.paxId, value: r.currentPnr.trim() }));
              for (const s of snapshot) {
                setPaxPatchOverlay(prev => ({ ...prev, [s.paxId]: { ...(prev[s.paxId] ?? {}), pnr: s.value || null } }));
                queueOp(`Përditëso PNR për pasagjerin #${s.paxId}`, async () => {
                  const resp = await saveRequest(`${API_BASE}/passengers/${s.paxId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ pnr: s.value || null }),
                  });
                  if (!resp.ok) throw new Error(await resp.text());
                  setPaxPatchOverlay(prev => {
                    const cur = prev[s.paxId]; if (!cur) return prev;
                    const { pnr: _p, ...rest } = cur;
                    const next = { ...prev };
                    if (Object.keys(rest).length === 0) delete next[s.paxId]; else next[s.paxId] = rest;
                    return next;
                  });
                });
              }
              // SHËNIM (31.07.2026): sinkronizimi klient-side i booking.pnr u HOQ —
              // llogariste PNR-në nga cache i vjetëruar dhe MBISHKRUANTE derivimin e
              // saktë server-side (rasti KTF7279: 2 PNR → mbeti vetëm 1). Serveri e
              // derivon vetë bookings.pnr në çdo PATCH të pnr-së së pasagjerit.
              setExcelPnrDrafts(prev => {
                const next = { ...prev };
                for (const s of snapshot) {
                  if ((prev[s.paxId] ?? "").trim() === s.value) delete next[s.paxId];
                }
                return next;
              });
              toast({ title: "Vendoset në pritje", description: `${snapshot.length} ndryshime PNR — do të ruhen me 'Ruaj'.` });
            };

            // TSV: [PASSANGER, EXTRA, CONFIRMED, -1 SHITUR(çmimi), OPERATORI, SHENIME(numri i pasagjerëve pa INF), NISJA 2(datë), ORA, DEST(itinerar), STATUS 2]
            // Pastro çdo qelizë nga tab/rreshtat e rinj që thyejnë kolonat kur ngjiten në Excel.
            const cleanCell = (v: unknown): string => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
            const tsv = paxRows.map(r =>
              [r.name, r.col2, r.status, r.price, r.op, r.numPax, r.date, r.time, r.route, r.status].map(cleanCell).join("\t")
            ).join("\r\n");

            // Teksti serioz për klientin: header agjencie, pasagjerë me PNR + çmim,
            // dhe ÇDO shtojcë (produkt + çmim) — per-pasagjer ose e rezervimit.
            const klientText = (() => {
              if (mainPax.length === 0) return "";
              const routeNice = fl ? `${fl.fromAirport || fl.fromCity} – ${fl.toAirport || fl.toCity}` : "";
              const L: string[] = [];
              L.push(`Agjencia: *${operator}*`);
              if (routeNice) L.push(`Fluturimi: ${routeNice}`);
              if (depDate || depTime) L.push(`Data / Ora: ${[depDate, depTime].filter(Boolean).join(", ")}`);
              L.push("");
              L.push(mainPax.length > 1 ? "Pasagjerët:" : "Pasagjer:");
              const flightBagPrice = Number(fl?.checkedBaggagePrice ?? 0);
              const bagKgK = Number(fl?.checkedBaggageKg) || 0;
              const usedExtraIdx = new Set<number>();
              mainPax.forEach((p: any, i: number) => {
                const full = `${p.firstName} ${p.lastName}`;
                const childDob = p.type === "child" && p.dateOfBirth
                  ? p.dateOfBirth.split("-").reverse().join("/")
                  : "";
                const typeNote = childDob ? ` (${childDob})` : p.type === "infant" ? " (foshnjë)" : "";
                const price = p.ticketPrice != null
                  ? Number(p.ticketPrice)
                  : Number((p.type === "infant" ? fl?.infantPrice : p.type === "child" ? fl?.childPrice : fl?.adultPrice) ?? 0);
                const pnr = (p.pnr ?? "").toString().trim();
                const parts = [`${i + 1}. ${full}${typeNote}`];
                if (pnr) parts.push(`PNR: *${pnr}*`);
                parts.push(`*${price.toFixed(0)} EUR*`);
                L.push(parts.join(" — "));
                // Shtojcat e këtij pasagjeri (përshkrimi mban emrin e tij)
                extras.forEach((ex: any, xi: number) => {
                  const d: string = ex.description || "";
                  if (d.includes("—") && d.includes(full)) {
                    usedExtraIdx.add(xi);
                    const prod = d.split("—")[0].trim() || "Extra";
                    L.push(`    • ${prod} — ${Number(ex.amount).toFixed(0)} EUR`);
                  }
                });
                // Bagazhi i strukturuar i pasagjerit
                if (p.type !== "infant" && p.baggageOption === "checked") {
                  const bp = Number(p.extraCost) > 0 ? Number(p.extraCost) : flightBagPrice;
                  if (bp > 0) L.push(`    • Bagazh${bagKgK > 0 ? ` ${bagKgK} KG` : ""} — ${bp.toFixed(0)} EUR`);
                }
              });
              // Shtojcat e rezervimit (pa pasagjer të caktuar)
              const restExtras = extras.filter((_: any, xi: number) => !usedExtraIdx.has(xi));
              if (restExtras.length > 0) {
                L.push("");
                L.push("Extra:");
                restExtras.forEach((ex: any) => {
                  L.push(`• ${(ex.description || "Extra").trim()} — ${Number(ex.amount).toFixed(0)} EUR`);
                });
              }
              L.push("");
              L.push(`*Totali: ${Number(booking.totalAmount ?? 0).toFixed(0)} EUR*`);
              return L.join("\n");
            })();

            // Gjerësia minimale e kolonave (px) dhe titujt
            const COL_WIDTHS = [128, 40, 70, 56, 86, 44, 64, 38, 58, 64];
            const HEADERS = ["PASSANGER", "EXTRA", "CONFIRMED", "-1 SHITUR", "OPERATORI", "SHENIME", "NISJA 2", "ORA", "DEST", "STATUS 2"];

            return (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/40 overflow-hidden shadow-sm">
                {/* Header bar */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-700 text-white">
                  <div className="flex items-center gap-1.5">
                    <div className="grid grid-cols-3 gap-[3px] opacity-70">
                      {[...Array(9)].map((_, i) => <div key={i} className="w-1 h-1 bg-white rounded-[1px]" />)}
                    </div>
                    <span className="text-xs font-semibold tracking-wide">Kopjo për Excel</span>
                    <span className="text-[11px] text-emerald-300">· {paxRows.length} pasagjerë</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={savePnrs}
                      disabled={!hasUnsaved || excelSaving}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all duration-200 ${
                        !hasUnsaved
                          ? "bg-emerald-800/40 text-emerald-300 border-emerald-700 cursor-not-allowed"
                          : "bg-amber-500 text-white border-amber-400 hover:bg-amber-400"
                      }`}
                    >
                      {excelSaving ? "Duke ruajtur…" : hasUnsaved ? `RUAJ (${dirtyRows.length})` : "RUAJ"}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(klientText).then(() => {
                          setWaCopied(true);
                          setTimeout(() => setWaCopied(false), 2500);
                        });
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all duration-200 ${
                        waCopied
                          ? "bg-white text-green-700 border-white"
                          : "bg-green-600 text-white border-green-500 hover:bg-green-500"
                      }`}
                      title="Teksti i konfirmimit për klientin — me PNR dhe çdo extra me çmim"
                    >
                      {waCopied
                        ? <><ClipboardCheck className="h-3 w-3" /> U kopjua!</>
                        : <><ClipboardCopy className="h-3 w-3" /> Kopjo për WhatsApp</>
                      }
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(tsv).then(() => {
                          setExcelCopied(true);
                          setTimeout(() => setExcelCopied(false), 2500);
                        });
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all duration-200 ${
                        excelCopied
                          ? "bg-white text-emerald-700 border-white"
                          : "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500"
                      }`}
                    >
                      {excelCopied
                        ? <><ClipboardCheck className="h-3 w-3" /> U kopjua!</>
                        : <><ClipboardCopy className="h-3 w-3" /> Kopjo</>
                      }
                    </button>
                  </div>
                </div>

                {/* Excel-like table visual */}
                <div className="overflow-x-auto px-4 py-3">
                  <table className="border-collapse font-mono w-full">
                    <thead>
                      <tr className="bg-emerald-600 text-white">
                        {HEADERS.map((h, i) => (
                          <th key={i} className="px-1 py-1 text-left font-bold border border-emerald-500 whitespace-nowrap text-[11px]"
                            style={{ minWidth: `${COL_WIDTHS[i]}px` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paxRows.map((r, ri) => {
                        const cells = [r.name, r.col2, r.status, r.priceDisplay, r.op, r.note, r.date, r.time, r.route, r.status];
                        return (
                          <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-emerald-50/50"}>
                            {cells.map((c, ci) => {
                              if (ci === 5) {
                                return (
                                  <td key={ci} className={`px-0.5 py-0.5 border border-gray-200 whitespace-nowrap text-[12px] ${r.pnrDirty ? "bg-amber-100" : "bg-yellow-50"}`}>
                                    <input
                                      type="text"
                                      value={r.currentPnr}
                                      maxLength={6}
                                      onChange={(e) => setExcelPnrDrafts(prev => ({ ...prev, [r.paxId]: e.target.value.toUpperCase().slice(0, 6) }))}
                                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                      placeholder="PNR…"
                                      title="Kodi PNR duhet të ketë saktësisht 6 karaktere"
                                      className={`w-full px-1 py-0.5 bg-transparent font-mono text-[12px] text-center font-semibold text-gray-800 outline-none focus:bg-white focus:ring-1 rounded ${
                                        r.currentPnr.trim().length > 0 && r.currentPnr.trim().length !== 6
                                          ? "ring-1 ring-red-400 focus:ring-red-500 text-red-600"
                                          : "focus:ring-emerald-500"
                                      }`}
                                    />
                                  </td>
                                );
                              }
                              return (
                                <td key={ci}
                                  className={`px-1 py-1 border border-gray-200 whitespace-nowrap text-[12px] ${
                                    ci === 2 || ci === 9
                                      ? c === "CONFIRMED" ? "text-green-700 font-bold" : c === "WAITING" ? "text-orange-600 font-bold" : "text-red-600 font-bold"
                                      : ci === 1 && c
                                      ? "text-blue-700 font-semibold"
                                      : "text-gray-800"
                                  }`}>
                                  {c || <span className="text-gray-300">—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Hidden textarea for select-all copy fallback */}
                <textarea
                  readOnly
                  value={tsv}
                  rows={1}
                  aria-hidden
                  className="sr-only"
                />
              </div>
            );
          })()}


          {/* Extras */}
          <div className="mt-3 border-t pt-2.5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Extra Pasagjerëve</h3>
              {(() => {
                const extrasTotal = extras.reduce((s: number, e: any) => s + Number(e.amount), 0);
                const flightBagPrice = Number((booking as any).flight?.checkedBaggagePrice ?? 0);
                const bagTotal = passengersView
                  .filter((p: any) => p.baggageOption === "checked" && !p.cancelled)
                  .reduce((sum: number, p: any) => sum + (p.extraCost > 0 ? Number(p.extraCost) : flightBagPrice), 0);
                const grandTotal = extrasTotal + bagTotal;
                return grandTotal > 0 ? <span className="text-sm font-medium text-primary">Total: €{fmtM(grandTotal)}</span> : null;
              })()}
            </div>
            {booking.status !== "cancelled" && <div className="flex flex-wrap gap-2 mb-2">
              {["Bagazh", "SEAT", "Prioritet", "Sigurim", "Tjetër"].map(opt => (
                <button key={opt}
                  onClick={() => { setSelectedExtraType(selectedExtraType === opt ? null : opt); setExtraAmount(""); setExtraCustomDesc(""); setExtraPassengerId(""); }}
                  className={`px-3 py-1 rounded-full text-sm font-medium border transition-all ${selectedExtraType === opt ? "bg-primary text-white border-primary" : "bg-white text-foreground border-input hover:border-primary hover:text-primary"}`}>
                  + {opt}
                </button>
              ))}
            </div>}
            {booking.status !== "cancelled" && selectedExtraType && (
              <div className="border rounded-md p-3 bg-muted/10 mb-2 space-y-2">
                <p className="text-sm font-medium text-primary">{selectedExtraType}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {selectedExtraType === "Tjetër" && (
                    <div className="md:col-span-1">
                      <Label className="text-xs mb-1 block">Përshkrimi</Label>
                      <Input value={extraCustomDesc} onChange={e => setExtraCustomDesc(e.target.value)} placeholder="p.sh. Parking, Transfer..." autoFocus />
                    </div>
                  )}
                  {booking.passengers.length > 1 && (
                    <div>
                      <Label className="text-xs mb-1 block">Pasagjeri (opsionale)</Label>
                      <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" value={extraPassengerId} onChange={e => setExtraPassengerId(e.target.value)}>
                        <option value="">Të gjithë / Rezervimi</option>
                        {booking.passengers.map((p: any) => <option key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs mb-1 block">Çmimi (€)</Label>
                    <Input type="number" min="0" step="1" value={extraAmount} onChange={e => setExtraAmount(e.target.value)} placeholder="0"
                      autoFocus={selectedExtraType !== "Tjetër"} onKeyDown={e => e.key === "Enter" && handleAddExtra()} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddExtra} disabled={extrasLoading || !extraAmount || (selectedExtraType === "Tjetër" && !extraCustomDesc.trim())}>
                    {extrasLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />} Shto
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSelectedExtraType(null); setExtraAmount(""); setExtraCustomDesc(""); setExtraPassengerId(""); }}>Anulo</Button>
                </div>
              </div>
            )}
            {(extras.length > 0 || passengersView.some((p: any) => p.baggageOption === "checked" && !p.cancelled)) ? (
              <div className="space-y-1">
                {passengersView.filter((p: any) => p.baggageOption === "checked" && !p.cancelled).map((p: any) => {
                  const bagPrice = p.extraCost > 0 ? p.extraCost : ((booking as any).flight?.checkedBaggagePrice ?? null);
                  return (
                    <div key={`bag-pax-${p.id}`} className="flex items-center justify-between py-1 px-3 rounded-md bg-muted/30 group">
                      <span className="text-sm">{(() => { const kg = Number((booking as any)?.flight?.checkedBaggageKg) || 0; return kg > 0 ? `Bagazh ${kg} KG` : "Bagazh"; })()} — {p.firstName} {p.lastName}</span>
                      <div className="flex items-center gap-2">
                        {bagPrice != null && Number(bagPrice) > 0 && (
                          <span className="text-sm font-semibold">€{fmtM(bagPrice)}</span>
                        )}
                        {booking.status !== "cancelled" && <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={() => queueClearBaggage(p.id)}
                          title="Fshi">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>}
                      </div>
                    </div>
                  );
                })}
                {extras.map((ex: any) => (
                  editingExtraId === ex.id ? (
                    <div key={ex.id} className="border rounded-md p-3 bg-muted/10 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="md:col-span-2">
                          <Label className="text-xs mb-1 block">Përshkrimi</Label>
                          <Input value={editingExtraDesc} onChange={e => setEditingExtraDesc(e.target.value)} autoFocus
                            onKeyDown={e => e.key === "Enter" && handleUpdateExtra(ex.id)} />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">Çmimi (€)</Label>
                          <Input type="number" min="0" step="1" value={editingExtraAmount}
                            onChange={e => setEditingExtraAmount(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleUpdateExtra(ex.id)} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdateExtra(ex.id)}
                          disabled={extrasLoading || !editingExtraDesc.trim() || !editingExtraAmount}>
                          {extrasLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />} Ruaj
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingExtraId(null)}>Anulo</Button>
                      </div>
                    </div>
                  ) : (
                    <div key={ex.id} className="flex items-center justify-between py-1 px-3 rounded-md bg-muted/30 group">
                      <span className="text-sm">{ex.description}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">€{fmtM(ex.amount)}</span>
                        {booking.status !== "cancelled" && <>
                          <button className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                            onClick={() => { setEditingExtraId(ex.id); setEditingExtraDesc(ex.description); setEditingExtraAmount(String(Number(ex.amount))); setSelectedExtraType(null); }}
                            disabled={extrasLoading} title="Ndrysho">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => handleDeleteExtra(ex.id)} disabled={extrasLoading} title="Fshi">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>}
                      </div>
                    </div>
                  )
                ))}
              </div>
            ) : !selectedExtraType && <p className="text-sm text-muted-foreground text-center py-1">Klikoni një opsion sipër për të shtuar extra</p>}
          </div>
        </CardContent>
      </Card>

      {/* Edit Passenger Dialog */}
      <Dialog open={!!editingPassenger} onOpenChange={open => { if (!open) setEditingPassenger(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ndrysho Pasagjerin</DialogTitle></DialogHeader>
          {editingPassenger && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs mb-1 block">Emri</Label><Input value={editingPassenger.firstName} onChange={e => setEditingPassenger(prev => prev && ({ ...prev, firstName: e.target.value }))} /></div>
                <div><Label className="text-xs mb-1 block">Mbiemri</Label><Input value={editingPassenger.lastName} onChange={e => setEditingPassenger(prev => prev && ({ ...prev, lastName: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Tipi</Label>
                  <Select disabled={booking.status === "cancelled"} value={editingPassenger.type} onValueChange={v => setEditingPassenger(prev => prev && ({ ...prev, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adult">I rritur</SelectItem>
                      <SelectItem value="child">Fëmijë</SelectItem>
                      <SelectItem value="infant">Foshnjë</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs mb-1 block">Numri i SEAT</Label><Input value={editingPassenger.seatNumber} onChange={e => setEditingPassenger(prev => prev && ({ ...prev, seatNumber: e.target.value }))} placeholder="p.sh. 14A" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Gjinia</Label>
                  <Select value={editingPassenger.gender || "none"} onValueChange={v => setEditingPassenger(prev => prev && ({ ...prev, gender: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Zgjidh</SelectItem>
                      <SelectItem value="M">Mashkull (M)</SelectItem>
                      <SelectItem value="F">Femër (F)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">
                    Data e Lindjes {(editingPassenger.type === "child" || editingPassenger.type === "infant") && <span className="text-destructive">*</span>}
                  </Label>
                  <Input type="date" value={editingPassenger.dateOfBirth}
                    onChange={e => setEditingPassenger(prev => prev && ({ ...prev, dateOfBirth: e.target.value }))}
                    className={(editingPassenger.type === "child" || editingPassenger.type === "infant") && !editingPassenger.dateOfBirth ? "border-destructive" : ""} />
                </div>
                <div><Label className="text-xs mb-1 block">Shtetësia</Label><Input value={editingPassenger.nationality} onChange={e => setEditingPassenger(prev => prev && ({ ...prev, nationality: e.target.value }))} placeholder="p.sh. Shqiptar" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs mb-1 block">Nr. Pasaportës</Label><Input value={editingPassenger.passportNumber} onChange={e => setEditingPassenger(prev => prev && ({ ...prev, passportNumber: e.target.value }))} /></div>
                <div><Label className="text-xs mb-1 block">Skadenca Pasaportës</Label><Input type="date" value={editingPassenger.passportExpiry} onChange={e => setEditingPassenger(prev => prev && ({ ...prev, passportExpiry: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Çmimi Biletës (€)</Label>
                  <Input type="number" step="1" min="0"
                    disabled={booking.status === "cancelled"}
                    value={editingPassenger.ticketPrice}
                    onChange={e => setEditingPassenger(prev => prev && ({ ...prev, ticketPrice: e.target.value }))}
                    placeholder="0.00" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingPassenger(null)}>Anulo</Button>
                <Button onClick={handleSavePassenger} disabled={savingDraft}>{savingDraft ? "Duke ruajtur..." : "Ruaj"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Password dialog për Anulim / Rikthim */}
      <Dialog open={pwdAction !== null} onOpenChange={(o) => { if (!o && !statusTransitionBusy) { setPwdAction(null); setPwdValue(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pwdAction === "cancel" ? "Konfirmo anulimin" : "Konfirmo rikthimin"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {pwdAction === "cancel"
                ? "Për të anulluar këtë rezervim, fut fjalëkalimin e anulimit (i vendosur nga admini te Settings)."
                : "Për të rikthyer këtë rezervim, fut fjalëkalimin e anulimit. Vendet do të zihen sërish dhe rimbursimi auto do të kthehet mbrapsht."}
            </p>
            <Input
              type="password"
              autoFocus
              placeholder="Fjalëkalimi"
              value={pwdValue}
              onChange={(e) => setPwdValue(e.target.value)}
              disabled={statusTransitionBusy}
              onKeyDown={(e) => { if (e.key === "Enter" && pwdValue && !statusTransitionBusy) runPwdAction(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPwdAction(null); setPwdValue(""); }} disabled={statusTransitionBusy}>
              Mbyll
            </Button>
            <Button
              className={pwdAction === "cancel" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
              onClick={runPwdAction}
              disabled={!pwdValue || statusTransitionBusy}
            >
              {pwdBusy
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Po procedohet...</>
                : (pwdAction === "cancel" ? "Anulo Rezervimin" : "Rikthe Rezervimin")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Passenger Dialog (staged) */}
      <Dialog open={addPassengerOpen} onOpenChange={open => { if (!open) setAddPassengerOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Shto Pasagjer</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1 block">Emri *</Label><Input value={newPaxForm.firstName} onChange={e => setNewPaxForm(p => ({ ...p, firstName: e.target.value }))} /></div>
              <div><Label className="text-xs mb-1 block">Mbiemri *</Label><Input value={newPaxForm.lastName} onChange={e => setNewPaxForm(p => ({ ...p, lastName: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Tipi</Label>
                <Select value={newPaxForm.type} onValueChange={v => setNewPaxForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adult">I rritur</SelectItem>
                    <SelectItem value="child">Fëmijë</SelectItem>
                    <SelectItem value="infant">Foshnjë</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs mb-1 block">Numri i SEAT</Label><Input value={newPaxForm.seatNumber} onChange={e => setNewPaxForm(p => ({ ...p, seatNumber: e.target.value }))} placeholder="p.sh. 14A" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Gjinia</Label>
                <Select value={newPaxForm.gender || "none"} onValueChange={v => setNewPaxForm(p => ({ ...p, gender: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Zgjidh</SelectItem>
                    <SelectItem value="M">Mashkull (M)</SelectItem>
                    <SelectItem value="F">Femër (F)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Data e Lindjes {(newPaxForm.type === "child" || newPaxForm.type === "infant") && <span className="text-destructive">*</span>}</Label>
                <Input type="date" value={newPaxForm.dateOfBirth} onChange={e => setNewPaxForm(p => ({ ...p, dateOfBirth: e.target.value }))} />
              </div>
              <div><Label className="text-xs mb-1 block">Shtetësia</Label><Input value={newPaxForm.nationality} onChange={e => setNewPaxForm(p => ({ ...p, nationality: e.target.value }))} placeholder="p.sh. Shqiptar" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1 block">Nr. Pasaportës</Label><Input value={newPaxForm.passportNumber} onChange={e => setNewPaxForm(p => ({ ...p, passportNumber: e.target.value }))} /></div>
              <div><Label className="text-xs mb-1 block">Skadenca Pasaportës</Label><Input type="date" value={newPaxForm.passportExpiry} onChange={e => setNewPaxForm(p => ({ ...p, passportExpiry: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1 block">Çmimi Biletës (€)</Label><Input type="number" step="1" value={newPaxForm.ticketPrice} onChange={e => setNewPaxForm(p => ({ ...p, ticketPrice: e.target.value }))} placeholder="0" /></div>
              <div>
                <Label className="text-xs mb-1 block">Bagazh</Label>
                <Select value={newPaxForm.baggageOption || "none"} onValueChange={v => setNewPaxForm(p => ({ ...p, baggageOption: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pa bagazh</SelectItem>
                    <SelectItem value="cabin">Vetëm Kabinë</SelectItem>
                    <SelectItem value="checked">Bagazh i Regjistruar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddPassengerOpen(false)}>Anulo</Button>
              <Button onClick={handleAddPassenger}>Vendos në pritje</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Payment Dialog (staged) */}
      {/* Dialogu i anulimit të pagesës — shënim i detyrueshëm */}
      <Dialog open={cancelPayDlg != null} onOpenChange={open => { if (!open) { setCancelPayDlg(null); setCancelPayNote(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-red-600">Anulo këtë pagesë?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pagesa do të hiqet nga llogaritë por do të mbahet në histori me vijë të kuqe. Ruhet përfundimisht me "Ruaj".
          </p>
          <div>
            <Label className="text-xs mb-1 block">Shënimi i anulimit <span className="text-red-600">*</span></Label>
            <textarea
              value={cancelPayNote}
              onChange={e => setCancelPayNote(e.target.value)}
              placeholder="Pse po anulohet kjo pagesë? (i detyrueshëm)"
              rows={3}
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {!cancelPayNote.trim() && <p className="text-[11px] text-red-500 mt-1">Shënimi është i detyrueshëm për të anuluar.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelPayDlg(null); setCancelPayNote(""); }}>Mbylle</Button>
            <Button variant="destructive" disabled={!cancelPayNote.trim()} onClick={confirmCancelPayment}>Anulo Pagesën</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addPaymentOpen} onOpenChange={open => { if (!open) setAddPaymentOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Shto Pagesë</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs mb-1 block">Shuma (€) *</Label>
              <Input type="text" inputMode="numeric" className="no-number-spin" value={newPayForm.amount} onChange={e => setNewPayForm(p => ({ ...p, amount: wholeMoneyInput(e.target.value) }))} placeholder="0" autoFocus />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Metoda e Pagesës *</Label>
              <PaymentMethodCombobox
                value={newPayForm.method}
                onChange={v => setNewPayForm(p => ({ ...p, method: v }))}
                options={paymentMethods.map(pm => ({ value: pm.name, label: pm.name, color: pm.color }))}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Regjistrimi i pagesës tregon se pagesa është marrë, ose se krediti në wallet është zbritur.</p>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Lloji i Pagesës</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewPayForm(p => ({ ...p, payerType: p.payerType === "invoice" ? "" : "invoice" }))} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${newPayForm.payerType === "invoice" ? "bg-blue-600 text-white border-blue-600" : "bg-background hover:bg-muted border-border"}`}>
                  {newPayForm.payerType === "invoice" && <Check className="h-4 w-4" />}
                  📄 FATURË
                </button>
                <button type="button" onClick={() => setNewPayForm(p => ({ ...p, payerType: p.payerType === "client" ? "" : "client" }))} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${newPayForm.payerType === "client" ? "bg-green-600 text-white border-green-600" : "bg-background hover:bg-muted border-border"}`}>
                  {newPayForm.payerType === "client" && <Check className="h-4 w-4" />}
                  👤 KLIENT
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Referenca</Label>
              <Input value={newPayForm.reference} onChange={e => setNewPayForm(p => ({ ...p, reference: e.target.value }))} placeholder="opsionale" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Shënime</Label>
              <Input value={newPayForm.notes} onChange={e => setNewPayForm(p => ({ ...p, notes: e.target.value }))} placeholder="opsionale" />
            </div>
            <div className="text-[11px] text-muted-foreground bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Pagesa do të shtohet vetëm pas klikimit "Ruaj".
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddPaymentOpen(false)}>Anulo</Button>
              <Button onClick={handleAddPayment}>Vendos në pritje</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog (staged) */}
      <Dialog open={!!editingPayment} onOpenChange={open => { if (!open) setEditingPayment(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edito Pagesën</DialogTitle></DialogHeader>
          {editingPayment && (
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-xs mb-1 block">Shuma (€) *</Label>
                      <Input type="text" inputMode="numeric" className="no-number-spin" value={editingPayment.amount} onChange={e => setEditingPayment(prev => prev && ({ ...prev, amount: wholeMoneyInput(e.target.value) }))} autoFocus />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Metoda e Pagesës *</Label>
                <PaymentMethodCombobox
                  value={editingPayment.method}
                  onChange={v => setEditingPayment(prev => prev && ({ ...prev, method: v }))}
                  options={paymentMethods.map(pm => ({ value: pm.name, label: pm.name, color: pm.color }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Regjistrimi i pagesës tregon se pagesa është marrë, ose se krediti në wallet është zbritur.</p>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Lloji i Pagesës</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setEditingPayment(prev => prev && ({ ...prev, payerType: prev.payerType === "invoice" ? "" : "invoice" }))} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${editingPayment.payerType === "invoice" ? "bg-blue-600 text-white border-blue-600" : "bg-background hover:bg-muted border-border"}`}>
                    {editingPayment.payerType === "invoice" && <Check className="h-4 w-4" />}
                    📄 FATURË
                  </button>
                  <button type="button" onClick={() => setEditingPayment(prev => prev && ({ ...prev, payerType: prev.payerType === "client" ? "" : "client" }))} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${editingPayment.payerType === "client" ? "bg-green-600 text-white border-green-600" : "bg-background hover:bg-muted border-border"}`}>
                    {editingPayment.payerType === "client" && <Check className="h-4 w-4" />}
                    👤 KLIENT
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Referenca</Label>
                <Input value={editingPayment.reference} onChange={e => setEditingPayment(prev => prev && ({ ...prev, reference: e.target.value }))} placeholder="opsionale" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Shënime</Label>
                <Input value={editingPayment.notes} onChange={e => setEditingPayment(prev => prev && ({ ...prev, notes: e.target.value }))} placeholder="opsionale" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingPayment(null)}>Anulo</Button>
                <Button onClick={handleSavePaymentEdit}>Vendos në pritje</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Revert status confirmation */}
      <AlertDialog open={!!revertConfirm} onOpenChange={(o) => { if (!o && !statusTransitionBusy) setRevertConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Undo2 className="h-5 w-5" /> Konfirmo Kthimin e Statusit
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2 space-y-2">
              <span className="block">
                Po kthen statusin e rezervimit në <strong className="text-red-700">{revertConfirm?.label.replace(/^Kthe në\s*/, "")}</strong>.
              </span>
              <span className="block text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 text-sm">
                ⚠️ Ky veprim mund të ndryshojë statusin dhe të dhënat e lidhura me të. A je i sigurt?
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusTransitionBusy}>Anulo</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={statusTransitionBusy}
              onClick={() => {
                if (revertConfirm) {
                  void runStatusImmediate(revertConfirm.prev, revertConfirm.label);
                  setRevertConfirm(null);
                }
              }}
            >
              Po, Kthe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletePaxConfirm} onOpenChange={(o) => { if (!o) setDeletePaxConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-5 w-5" /> Konfirmo Fshirjen e Pasagjerit
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2 space-y-2">
              <span className="block">
                Po fshin pasagjerin <strong className="text-red-700">{`${deletePaxConfirm?.firstName ?? ""} ${deletePaxConfirm?.lastName ?? ""}`.trim()}</strong>.
              </span>
              <span className="block text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 text-sm">
                ⚠️ Pasagjeri do të anulohet (mbetet i shfaqur me vijë) pasi të klikoni "Ruaj". A je i sigurt?
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulo</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deletePaxConfirm) {
                  handleDeletePassenger(deletePaxConfirm);
                  setDeletePaxConfirm(null);
                }
              }}
            >
              Po, Fshij
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Group Ticket — embed full management page in iframe with deep-link to expand the specific group */}
      <Dialog open={groupDialog.open} onOpenChange={(o) => { if (!o) setGroupDialog({ open: false, gid: null }); }}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 py-2 border-b flex-shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-indigo-600" />
              Menaxhimi i Grupit
            </DialogTitle>
          </DialogHeader>
          {groupDialog.gid && (
            <div className="flex-1 w-full overflow-auto p-4">
              <GroupTicketsPage embedGroupId={groupDialog.gid} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CloseConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeCloseConfirm((n) => { setCount(n); setOpen(true); }), []);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center text-center pt-2">
          <div className="w-16 h-16 rounded-full bg-amber-100 border-4 border-amber-300 flex items-center justify-center mb-4">
            <span className="text-3xl text-amber-500 font-bold">!</span>
          </div>
          <DialogTitle className="text-2xl font-bold text-slate-800 mb-2">Ke ndryshime të paruajtura</DialogTitle>
          <p className="text-base text-slate-600 mb-6">
            {count} ndryshim{count === 1 ? "" : "e"} ende të paruajtur{count === 1 ? "" : "a"}. Çfarë do të bësh?
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 w-full">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try { await performSaveAndExit(); setOpen(false); }
                catch { /* alert already shown */ }
                finally { setBusy(false); }
              }}
            >
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Po ruan...</> : <><Check className="h-4 w-4 mr-2" />Ruaj dhe Dil</>}
            </Button>
            <Button
              className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5"
              disabled={busy}
              onClick={() => { performDiscardAndExit(); setOpen(false); }}
            >
              Dil pa Ruajtur
            </Button>
            <Button
              variant="outline"
              className="font-semibold px-5"
              disabled={busy}
              onClick={() => { _clearPendingNav(); setOpen(false); }}
            >
              Anulo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Public export: wraps BookingDetailInner in its own BookingDraftProvider so
 * each mounted instance has isolated per-instance draft state. Multiple
 * concurrent instances do not share dirty flags, flush callbacks, or op queues.
 */
export function BookingDetailContent({ bookingId, onClose }: { bookingId: number; onClose?: () => void }) {
  return (
    <BookingDraftProvider>
      <BookingDetailInner bookingId={bookingId} onClose={onClose} />
    </BookingDraftProvider>
  );
}

function BookingDetailSaveBar({ onClose, invalidate, commitStatus }: { onClose?: () => void; invalidate: () => void; commitStatus?: () => Promise<void> }) {
  const dirty = useDirtyCount();
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const doSave = useCallback(async (close: boolean) => {
    setSaving(true);
    try {
      await flushAllBookingDetail();
      if (commitStatus) await commitStatus();
      invalidate();
      if (close) {
        // Përdoret VETËM nga rruga "Ruaj dhe Dil" e nav-guard-it (mbyllje me ndryshime të paruajtura).
        toast({ title: "Ndryshimet u ruajtën" });
        if (onClose) {
          onClose();
        } else if (typeof window !== "undefined") {
          try { window.history.back(); } catch {}
        }
      } else {
        // Butoni "Ruaj": ruan ndryshimet dhe e LË faqen hapur; rivendos numëruesin që shiriti të fshihet.
        clearAllBookingDetail();
        toast({ title: "Ndryshimet u ruajtën" });
      }
    } catch (e: any) {
      toast({ title: "Gabim gjatë ruajtjes", description: e?.message ?? "Disa ndryshime nuk u ruajtën.", variant: "destructive" });
      throw e; // so canCloseBookingDetail doesn't proceed to close
    } finally {
      setSaving(false);
    }
  }, [invalidate, toast, commitStatus, onClose]);

  const saveAndClose = useCallback(() => doSave(true), [doSave]);
  // doSave already displays the failure and keeps unsaved edits. DOM event
  // handlers have no caller awaiting the rejection; navigation still must.
  const saveOnly = useCallback(() => { void doSave(false).catch(() => {}); }, [doSave]);

  // Register so canCloseBookingDetail's "Ruaj dhe Dil" path can call us (ruan + mbyll).
  useEffect(() => registerSaveAndClose(saveAndClose), [saveAndClose]);

  // Listen for force-close (Anulo / Dil pa Ruajtur) — works for both standalone and dialog entries.
  useEffect(() => {
    const fn = () => onClose?.();
    window.addEventListener("booking-detail:force-close", fn);
    return () => window.removeEventListener("booking-detail:force-close", fn);
  }, [onClose]);

  const hasChanges = dirty > 0;

  // Shortcut: Ctrl+S / Cmd+S = butoni "Ruaj" (vetëm kur ka ndryshime të paruajtura).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault(); // ndalon dialogun "Save page" të browserit
        if (hasChanges && !saving) saveOnly();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasChanges, saving, saveOnly]);

  // Shfaqet VETËM kur ka ndryshime të paruajtura.
  if (!hasChanges && !saving) return null;
  return (
    <div className="sticky top-2 z-50 flex justify-end pr-4 pointer-events-none -mb-2">
      <div className="pointer-events-auto inline-flex items-center gap-3 rounded-xl pl-3 pr-2 py-1.5 bg-gradient-to-b from-zinc-900 to-black border border-amber-400/60 shadow-[0_8px_30px_rgba(0,0,0,0.35),0_0_0_1px_rgba(251,191,36,0.15)]">
        <span className="inline-flex items-center justify-center h-6 min-w-6 px-1 rounded-full text-[11px] font-bold bg-gradient-to-b from-amber-300 to-amber-500 text-black shadow-inner">{dirty}</span>
        <span className="text-xs font-medium tracking-wide text-amber-100/90 uppercase hidden sm:inline">{dirty === 1 ? "Ndryshim i paruajtur" : "Ndryshime të paruajtura"}</span>
        <span className="h-5 w-px bg-amber-400/30 hidden sm:block" />
        <Button
          size="sm"
          disabled={saving}
          onClick={saveOnly}
          className="inline-flex items-center gap-1.5 rounded-lg h-8 px-4 text-xs font-bold uppercase tracking-wider bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 text-black shadow-[0_2px_8px_rgba(251,191,36,0.45)] hover:brightness-110 transition border-0"
        >
          {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Po ruan...</> : <><Check className="h-3.5 w-3.5" strokeWidth={3} />Ruaj</>}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg h-8 px-3 text-xs font-semibold text-zinc-300 border-zinc-700 hover:border-zinc-500 hover:text-white bg-transparent hover:bg-transparent transition"
          onClick={() => {
            if (!window.confirm("Anulo të gjitha ndryshimet e paruajtura?")) return;
            window.dispatchEvent(new CustomEvent("booking-detail:clear-overlays"));
            window.dispatchEvent(new CustomEvent("booking-detail:reset-fields"));
            clearAllBookingDetail();
            toast({ title: "Ndryshimet u anuluan" });
          }}
        >
          <X className="h-3 w-3" />Anulo
        </Button>
      </div>
    </div>
  );
}
