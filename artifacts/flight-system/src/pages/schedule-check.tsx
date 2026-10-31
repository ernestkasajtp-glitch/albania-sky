import { useState, useRef, useEffect, useCallback, useSyncExternalStore, Fragment } from "react";
import { scheduleCheckStore } from "@/lib/scheduleCheckStore";
import { fmtM } from "@/lib/utils";
import { fmtFlightNum, fmtAmPm, fmtDateTimeAmPm } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ScanSearch, Loader2, CheckCircle2, AlertTriangle, XCircle,
  ExternalLink, ArrowRight, Info, Search, X, Mail, Plane, ChevronDown, ChevronUp,
  ListChecks, PlusCircle, Sparkles, Users, Tag, ToggleLeft, FileDown, RefreshCw,
} from "lucide-react";
import { Link } from "wouter";
import { FlightSidePanel } from "@/components/FlightSidePanel";
import { REPORT_TOOLBAR_CSS, reportToolbarHTML } from "@/lib/reportDetailed";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface FlightOption {
  id: number;
  flightNumber: string;
  airline: string;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
}

interface UniqueFlightType {
  flightNumber: string;
  airline: string;
  fromCity: string;
  toCity: string;
  flightCount: number;
  firstDate: string;
  lastDate: string;
}

interface Change { field: string; old: string; new: string }
interface CheckResult {
  id: number;
  flightNumber: string;
  airline: string;
  departureDate: string;
  ourDepartureTime: string;
  ourArrivalTime: string;
  ourArrivalDate: string;
  googleDepartureDate: string | null;
  googleArrivalDate: string | null;
  googleDepartureTime: string | null;
  googleArrivalTime: string | null;
  status: "unchanged" | "time_changed" | "not_found" | "api_empty";
  changes: Change[];
  googleRaw: number;
  ourPrice: number | null;
  googlePrice: number | null;
}

interface NewFlight {
  flightNumber: string;
  airline: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  fromCity: string;
  toCity: string;
  googlePrice: number | null;
}

interface CheckResponse {
  results: CheckResult[];
  total: number;
  from: string;
  to: string;
  startDate: string;
  endDate: string;
  newFlights?: NewFlight[];
}

function StatusBadge({ status }: { status: string }) {
  if (status === "unchanged")
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1 flex items-center"><CheckCircle2 className="h-3 w-3" />I pandryshuar</Badge>;
  if (status === "time_changed")
    return <Badge className="bg-red-100 text-red-800 border-red-200 gap-1 flex items-center"><AlertTriangle className="h-3 w-3" />Orari ndryshoi</Badge>;
  if (status === "not_found")
    return <Badge className="bg-red-100 text-red-800 border-red-200 gap-1 flex items-center"><XCircle className="h-3 w-3" />Nuk gjendet</Badge>;
  if (status === "api_empty")
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 gap-1 flex items-center"><Info className="h-3 w-3" />API pa rezultat</Badge>;
  return null;
}

const STATUS_PDF: Record<string, { label: string; bg: string; color: string }> = {
  unchanged:    { label: "I pandryshuar",  bg: "#dcfce7", color: "#166534" },
  time_changed: { label: "Orari ndryshoi", bg: "#fee2e2", color: "#991b1b" },
  not_found:    { label: "Nuk gjendet",    bg: "#fee2e2", color: "#991b1b" },
  api_empty:    { label: "API pa rezultat", bg: "#fef9c3", color: "#854d0e" },
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function generateScheduleCheckHTML(resp: CheckResponse, isBatch: boolean): string {
  const now = fmtDateTimeAmPm(new Date());
  const results = resp.results;
  const counts = {
    total:        results.length,
    unchanged:    results.filter(r => r.status === "unchanged").length,
    time_changed: results.filter(r => r.status === "time_changed").length,
    not_found:    results.filter(r => r.status === "not_found").length,
    api_empty:    results.filter(r => r.status === "api_empty").length,
  };
  const price = (p: number | null) => (p == null ? "—" : `€${fmtM(p)}`);

  const rows = results.map((r, i) => {
    const st = STATUS_PDF[r.status] ?? { label: r.status, bg: "#f1f5f9", color: "#334155" };
    const google = (r.googleDepartureTime && r.googleArrivalTime)
      ? `${esc(fmtAmPm(r.googleDepartureTime))} → ${esc(fmtAmPm(r.googleArrivalTime))}`
      : (r.status === "api_empty" ? "API pa rezultat" : "NUK GJENDET");
    const changes = r.changes && r.changes.length
      ? r.changes.map(c => `${esc(c.field)}: ${esc(c.field.startsWith("Data") ? c.old : fmtAmPm(c.old))} → ${esc(c.field.startsWith("Data") ? c.new : fmtAmPm(c.new))}`).join("<br/>")
      : "—";
    return `<tr>
      <td>${i + 1}</td>
      <td><strong>${esc(fmtFlightNum(r.flightNumber))}</strong><div class="sub">${esc(r.airline)}</div></td>
      <td>${esc(r.departureDate)}</td>
      <td>${esc(fmtAmPm(r.ourDepartureTime))} → ${esc(fmtAmPm(r.ourArrivalTime))}</td>
      <td>${google}</td>
      <td style="text-align:right">${price(r.ourPrice)}</td>
      <td style="text-align:right">${price(r.googlePrice)}</td>
      <td><span class="badge" style="background:${st.bg};color:${st.color}">${esc(st.label)}</span></td>
      <td class="changes">${changes}</td>
    </tr>`;
  }).join("");

  const newFlights = resp.newFlights ?? [];
  const newFlightsSection = newFlights.length ? `
<h2>Fluturime të Reja nga Google (${newFlights.length})</h2>
<table>
  <thead><tr><th>#</th><th>Fluturimi</th><th>Rruga</th><th>Data</th><th>Orari</th><th style="text-align:right">Çmimi Google</th></tr></thead>
  <tbody>${newFlights.map((f, i) => `<tr>
    <td>${i + 1}</td>
    <td><strong>${esc(fmtFlightNum(f.flightNumber))}</strong><div class="sub">${esc(f.airline)}</div></td>
    <td>${esc(f.fromCity)} → ${esc(f.toCity)}</td>
    <td>${esc(f.departureDate)}</td>
    <td>${esc(fmtAmPm(f.departureTime))} → ${esc(fmtAmPm(f.arrivalTime))}</td>
    <td style="text-align:right">${price(f.googlePrice)}</td>
  </tr>`).join("")}</tbody>
</table>` : "";

  const heading = isBatch
    ? `Kontroll i Plotë i Orareve — ${esc(resp.from)}`
    : `Kontroll Orari — ${esc(resp.from)} → ${esc(resp.to)} (${esc(resp.startDate)} → ${esc(resp.endDate)})`;

  return `<!DOCTYPE html>
<html lang="sq"><head><meta charset="utf-8"><title>Raport Kontrolli Orari</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #0f172a; padding: 20px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #1e3a5f; }
  h2 { font-size: 15px; margin: 24px 0 8px; color: #1e3a5f; }
  .meta { color: #64748b; font-size: 11px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #475569; }
  tr:nth-child(even) td { background: #f8fafc; }
  .sub { font-size: 10px; color: #64748b; }
  .changes { font-size: 10px; color: #991b1b; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; white-space: nowrap; }
  .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 12px 0; }
  .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .summary-box .label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.4px; }
  .summary-box .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
  .footer { margin-top: 24px; color: #94a3b8; font-size: 10px; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { body { padding: 0; } }
  ${REPORT_TOOLBAR_CSS}
</style>
</head>
<body>
${reportToolbarHTML({ filename: "Raport_Kontrolli_Orari", orientation: "landscape" })}
<h1>${heading}</h1>
<div class="meta">Gjeneruar: ${esc(now)} &nbsp;·&nbsp; ${counts.total} fluturime të kontrolluara</div>
<div class="summary">
  <div class="summary-box"><div class="label">Total</div><div class="value">${counts.total}</div></div>
  <div class="summary-box"><div class="label">Pa ndryshim</div><div class="value" style="color:#16a34a">${counts.unchanged}</div></div>
  <div class="summary-box"><div class="label">Orari ndryshoi</div><div class="value" style="color:#dc2626">${counts.time_changed}</div></div>
  <div class="summary-box"><div class="label">Nuk gjendet</div><div class="value" style="color:#dc2626">${counts.not_found}</div></div>
  <div class="summary-box"><div class="label">API pa përgjigje</div><div class="value" style="color:#ca8a04">${counts.api_empty}</div></div>
</div>
<table>
  <thead><tr>
    <th>#</th><th>Fluturimi</th><th>Data</th><th>Orari Ynë</th><th>Orari Google</th>
    <th style="text-align:right">Çmimi Ynë</th><th style="text-align:right">Çmimi Google</th><th>Statusi</th><th>Ndryshime</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
${newFlightsSection}
<div class="footer">Kings Travel &nbsp;·&nbsp; Raport i gjeneruar automatikisht &nbsp;·&nbsp; ${esc(now)}</div>
</body></html>`;
}

// ── Flight search combobox ────────────────────────────────────────────────────
function FlightSearchCombobox({
  onSelect,
  onClear,
  allTypes = [],
}: {
  onSelect: (f: UniqueFlightType) => void;
  onClear?: () => void;
  allTypes?: UniqueFlightType[];
}) {
  const [query, setQuery]       = useState("");
  const [open, setOpen]         = useState(false);
  const [selected, setSelected] = useState<UniqueFlightType | null>(null);
  const wrapRef                 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useCallback(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTypes;
    return allTypes.filter(f =>
      f.flightNumber.toLowerCase().includes(q) ||
      f.fromCity.toLowerCase().includes(q) ||
      f.toCity.toLowerCase().includes(q) ||
      f.airline.toLowerCase().includes(q) ||
      `${f.fromCity}-${f.toCity}`.toLowerCase().includes(q)
    );
  }, [query, allTypes]);

  function choose(f: UniqueFlightType) {
    setSelected(f);
    setQuery(`${f.fromCity}-${f.toCity}  ${f.flightNumber}`);
    setOpen(false);
    onSelect(f);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setOpen(false);
    onClear?.();
  }

  const results = filtered();

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Kërko p.sh. W6, BLQ, TIA, Wizz..."
          className="pl-9 pr-8 font-mono"
        />
        {(query || selected) && (
          <button
            onClick={clear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gray-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-md border bg-white shadow-lg">
          {results.map(f => (
            <button
              key={`${f.fromCity}-${f.toCity}-${f.flightNumber}`}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-blue-50 border-b last:border-0 transition-colors"
              onMouseDown={e => { e.preventDefault(); choose(f); }}
            >
              <span className="font-mono font-semibold text-sm text-gray-900">
                {f.fromCity}-{f.toCity}
                <span className="ml-2 text-blue-700">{fmtFlightNum(f.flightNumber)}</span>
              </span>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                <span className="text-xs text-muted-foreground">{f.airline}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{f.flightCount}×</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ScheduleCheckPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [from, setFrom]                           = useState("");
  const [to, setTo]                               = useState("");
  const [selectedFlightNum, setSelectedFlightNum] = useState<string>("");
  const [startDate, setStartDate]                 = useState("");
  const [endDate, setEndDate]                     = useState("");
  const [singleLoading, setSingleLoading]         = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [singleResponse, setSingleResponse]       = useState<CheckResponse | null>(null);
  const [emailSending, setEmailSending]           = useState(false);
  const [emailStatus, setEmailStatus]             = useState<{ ok: boolean; msg: string } | null>(null);
  const [firstFlightDate, setFirstFlightDate]     = useState<string | undefined>(undefined);
  const [uniqueTypes, setUniqueTypes]             = useState<UniqueFlightType[]>([]);
  const [uniqueLoading, setUniqueLoading]         = useState(true);
  const [selectedTypeKey, setSelectedTypeKey]     = useState<string | null>(null);
  const [showUniqueTypes, setShowUniqueTypes]     = useState(false);
  const [pageSize, setPageSize]                   = useState<10 | 50 | 100>(10);
  const [currentPage, setCurrentPage]             = useState(1);
  const [expandedId, setExpandedId]               = useState<number | null>(null);
  const [syncingIds, setSyncingIds]               = useState<Set<number>>(new Set());
  const [syncedResults, setSyncedResults]         = useState<Record<number, { departureTime: string; arrivalTime: string }>>({});
  const [batchSelected, setBatchSelected]         = useState<Set<string>>(new Set());
  const [sidePanelFlightId, setSidePanelFlightId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter]           = useState<string>("all");

  // ── Background batch check (survives navigating away from this page) ──────────
  const batch = useSyncExternalStore(scheduleCheckStore.subscribe, scheduleCheckStore.getSnapshot);
  // Show the batch result/progress (vs. a single-route check) — default to true on
  // mount if a batch is already running or finished, so returning to the page lands
  // exactly where the user left off.
  const [showBatch, setShowBatch] = useState(() => scheduleCheckStore.getSnapshot().status !== "idle");
  const batchRunning = batch.status === "running";
  // Computed display values keep the rest of the render untouched.
  const loading       = singleLoading || batchRunning;
  const batchProgress = batchRunning ? batch.progress : null;
  const response      = (showBatch ? batch.response : singleResponse) as CheckResponse | null;
  const isBatchResult = showBatch;

  // ── Bulk select ────────────────────────────────────────────────────────────
  const [bulkSelected, setBulkSelected2]          = useState<Set<number>>(new Set());
  const [bulkSeatsOpen, setBulkSeatsOpen2]        = useState(false);
  const [bulkPriceOpen, setBulkPriceOpen2]        = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen2]      = useState(false);
  const [bulkSeatsVal, setBulkSeatsVal]           = useState("");
  const [bulkPriceVal, setBulkPriceVal]           = useState("");
  const [bulkStatusVal, setBulkStatusVal]         = useState("open");
  const [bulkSaving2, setBulkSaving2]             = useState(false);

  // ── Add new flight dialog ──────────────────────────────────────────────────
  const emptyAdd = { airline: "", flightNumber: "", fromCity: "", toCity: "", departureDate: "", arrivalDate: "", departureTime: "", arrivalTime: "", adultPrice: "", childPrice: "", infantPrice: "", tax: "", totalSeats: "20" };
  const [addDialog, setAddDialog]   = useState<NewFlight | null>(null);
  const [addForm, setAddForm]       = useState(emptyAdd);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError]     = useState<string | null>(null);
  const [addDone, setAddDone]       = useState<string | null>(null);

  function openAddDialog(f: NewFlight) {
    setAddDialog(f);
    setAddForm({
      airline:       f.airline,
      flightNumber:  f.flightNumber,
      fromCity:      f.fromCity,
      toCity:        f.toCity,
      departureDate: f.departureDate,
      arrivalDate:   f.departureDate,
      departureTime: f.departureTime,
      arrivalTime:   f.arrivalTime,
      adultPrice:    f.googlePrice ? String(Math.round(f.googlePrice)) : "",
      childPrice:    "",
      infantPrice:   "",
      tax:           "",
      totalSeats:    "20",
    });
    setAddError(null);
    setAddDone(null);
  }

  async function submitAddFlight() {
    const { airline, flightNumber, fromCity, toCity, departureDate, arrivalDate, departureTime, arrivalTime, adultPrice, childPrice, infantPrice, tax, totalSeats } = addForm;
    if (!airline || !flightNumber || !fromCity || !toCity || !departureDate || !departureTime || !totalSeats || !adultPrice) {
      setAddError("Plotëso fushat e detyrueshme.");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch(`${API_BASE}/flights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          airline, flightNumber, fromCity, toCity,
          departureDate, arrivalDate: arrivalDate || departureDate,
          departureTime, arrivalTime,
          adultPrice: Math.round(Number(adultPrice)),
          childPrice: Math.round(Number(childPrice || 0)),
          infantPrice: Math.round(Number(infantPrice || 0)),
          tax: Math.round(Number(tax || 0)),
          totalSeats: Number(totalSeats),
          status: "open",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddError(d.error || "Gabim gjatë shtimit.");
      } else {
        const created = await res.json();
        setAddDone(`Fluturimi u shtua me sukses! (ID: ${created.id})`);
        // Remove from newFlights list in response
        if (response) {
          const updated = {
            ...response,
            newFlights: (response.newFlights || []).filter(
              x => !(x.flightNumber === addDialog?.flightNumber && x.departureDate === addDialog?.departureDate)
            ),
          };
          if (showBatch) scheduleCheckStore.setResponse(updated);
          else setSingleResponse(updated);
        }
      }
    } catch {
      setAddError("Gabim rrjeti.");
    } finally {
      setAddLoading(false);
    }
  }

  useEffect(() => {
    fetch(`${API_BASE}/flights/unique-types`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => setUniqueTypes(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setUniqueLoading(false));
  }, []);

  function handleSelect(f: UniqueFlightType) {
    setFrom(f.fromCity);
    setTo(f.toCity);
    setSelectedFlightNum(f.flightNumber);
    setFirstFlightDate(f.firstDate ?? undefined);
    setSelectedTypeKey(`${f.fromCity}-${f.toCity}-${f.flightNumber}`);
    if (f.firstDate) setStartDate(f.firstDate);
    if (f.lastDate)  setEndDate(f.lastDate);
    setSingleResponse(null);
    setError(null);
  }

  async function handleCheck() {
    if (!from || !to || !startDate || !endDate) {
      setError("Zgjidh një fluturim dhe periudhën kohore.");
      return;
    }
    setError(null);
    setSingleLoading(true);
    setSingleResponse(null);
    setShowBatch(false);
    setStatusFilter("all");
    try {
      const res = await fetch(`${API_BASE}/flights/schedule-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          from: from.trim().toUpperCase(),
          to:   to.trim().toUpperCase(),
          startDate,
          endDate,
          ...(selectedFlightNum ? { flightNumber: selectedFlightNum } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Gabim nga serveri.");
      } else {
        const data = await res.json();
        setSingleResponse(data);
        const f = from.trim().toUpperCase();
        const t = to.trim().toUpperCase();
        sendEmailAuto(f, t, startDate, endDate, selectedFlightNum || undefined);
      }
    } catch {
      setError("Nuk mund të lidhet me serverin.");
    } finally {
      setSingleLoading(false);
    }
  }

  async function sendEmailAuto(f: string, t: string, sd: string, ed: string, flNum?: string) {
    setEmailSending(true);
    setEmailStatus(null);
    try {
      const res = await fetch(`${API_BASE}/flights/schedule-check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          from: f,
          to:   t,
          startDate: sd,
          endDate:   ed,
          ...(flNum ? { flightNumber: flNum } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEmailStatus({ ok: true, msg: `Raporti u dërgua automatikisht me email (${data.sent} fluturime)` });
      } else {
        setEmailStatus({ ok: false, msg: `Email dërgimi dështoi: ${data.error ?? "Gabim i panjohur"}` });
      }
    } catch {
      setEmailStatus({ ok: false, msg: "Email: nuk mund të lidhet me serverin." });
    } finally {
      setEmailSending(false);
    }
  }

  async function runBatchCheck() {
    const targets = uniqueTypes.filter(f => batchSelected.has(`${f.fromCity}-${f.toCity}-${f.flightNumber}`));
    if (!targets.length) return;
    setError(null);
    setSyncedResults({});
    setExpandedId(null);
    setStatusFilter("all");
    setShowBatch(true);
    // The loop lives in the module-level store, so it keeps running even if the
    // user navigates away from this page; coming back re-reads its live state.
    scheduleCheckStore.start(
      targets.map(f => ({
        fromCity: f.fromCity,
        toCity: f.toCity,
        firstDate: f.firstDate,
        lastDate: f.lastDate,
        flightNumber: f.flightNumber,
      })),
      API_BASE,
    );
  }

  async function syncSchedule(r: CheckResult) {
    if (!r.googleDepartureTime || !r.googleArrivalTime || !r.googleDepartureDate || !r.googleArrivalDate) {
      toast({ title: "Orari Google është i paplotë", description: "Kryeni kontrollin përsëri.", variant: "destructive" });
      return;
    }
    setSyncingIds(prev => new Set(prev).add(r.id));
    try {
      const res = await fetch(`${API_BASE}/flights/${r.id}/sync-schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ departureDate: r.googleDepartureDate, arrivalDate: r.googleArrivalDate,
          departureTime: r.googleDepartureTime, arrivalTime: r.googleArrivalTime }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Dështoi përditësimi");
      setSyncedResults(prev => ({ ...prev, [r.id]: { departureTime: r.googleDepartureTime!, arrivalTime: r.googleArrivalTime! } }));
      queryClient.invalidateQueries();
    } catch (error) {
      toast({ title: "Gabim", description: error instanceof Error ? error.message : "Dështoi përditësimi", variant: "destructive" });
    }
    finally {
      setSyncingIds(prev => { const s = new Set(prev); s.delete(r.id); return s; });
    }
  }

  async function syncAllBulk() {
    const toSync = (response?.results ?? []).filter(
      r => bulkSelected.has(r.id) && r.status === "time_changed" && !syncedResults[r.id] && r.googleDepartureTime && r.googleArrivalTime
    );
    if (toSync.length === 0) return;
    await Promise.allSettled(toSync.map(r => syncSchedule(r)));
    setBulkSelected2(new Set());
  }

  const changed  = response?.results.filter(r => r.status === "time_changed") ?? [];
  const notFound = response?.results.filter(r => r.status === "not_found")    ?? [];
  const apiEmpty = response?.results.filter(r => r.status === "api_empty")    ?? [];
  const ok       = response?.results.filter(r => r.status === "unchanged")    ?? [];

  // ── Filtered results for current view ────────────────────────────────────
  const filteredResults = response?.results.filter(r => statusFilter === "all" || r.status === statusFilter) ?? [];
  const allFilteredIds = filteredResults.map(r => r.id);
  const allFilteredSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => bulkSelected.has(id));

  function toggleBulkOne(id: number) {
    setBulkSelected2(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleBulkAll() {
    if (allFilteredSelected) {
      setBulkSelected2(prev => { const next = new Set(prev); allFilteredIds.forEach(id => next.delete(id)); return next; });
    } else {
      setBulkSelected2(prev => { const next = new Set(prev); allFilteredIds.forEach(id => next.add(id)); return next; });
    }
  }

  async function handleBulkSeats2() {
    const seats = parseInt(bulkSeatsVal);
    if (isNaN(seats) || seats < 0) return;
    setBulkSaving2(true);
    try {
      await fetch(`${API_BASE}/flights/bulk-seats`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ ids: [...bulkSelected], totalSeats: seats }) });
      setBulkSeatsOpen2(false); setBulkSeatsVal(""); setBulkSelected2(new Set());
    } finally { setBulkSaving2(false); }
  }

  async function handleBulkPrice2() {
    const price = Math.round(parseFloat(bulkPriceVal));
    if (isNaN(price) || price < 0) return;
    setBulkSaving2(true);
    try {
      await fetch(`${API_BASE}/flights/bulk-price`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ ids: [...bulkSelected], adultPrice: price }) });
      setBulkPriceOpen2(false); setBulkPriceVal(""); setBulkSelected2(new Set());
    } finally { setBulkSaving2(false); }
  }

  async function handleBulkStatus2() {
    setBulkSaving2(true);
    try {
      await fetch(`${API_BASE}/flights/bulk-status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ ids: [...bulkSelected], status: bulkStatusVal }) });
      setBulkStatusOpen2(false); setBulkSelected2(new Set());
    } finally { setBulkSaving2(false); }
  }

  function selectUniqueType(f: UniqueFlightType) {
    const key = `${f.fromCity}-${f.toCity}-${f.flightNumber}`;
    setSelectedTypeKey(key);
    setFrom(f.fromCity);
    setTo(f.toCity);
    setSelectedFlightNum(f.flightNumber);
    setFirstFlightDate(f.firstDate);
    if (f.firstDate) setStartDate(f.firstDate);
    if (f.lastDate)  setEndDate(f.lastDate);
    setSingleResponse(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex h-full min-h-0">
    <div className="flex-1 p-4 md:p-6 max-w-6xl mx-auto space-y-6 overflow-y-auto min-h-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ScanSearch className="h-6 w-6 text-blue-600" />
          Kontrollo Oraret e Fluturimeve
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Krahason oraret e fluturimeve nga sistemi ynë me të dhënat e Google Flights.
        </p>
      </div>

      {/* Background batch status banner — visible even after navigating back */}
      {batchRunning && batchProgress && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm text-blue-800">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>
              Kontrolli po vazhdon në sfond… <b>{batchProgress.done}/{batchProgress.total}</b> rrugë
              {showUniqueTypes ? "" : " · mund të largoheni nga faqja, do të vazhdojë automatikisht"}
            </span>
          </div>
          <div className="h-1.5 w-32 rounded-full bg-blue-200 overflow-hidden shrink-0">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${Math.round((batchProgress.done / Math.max(1, batchProgress.total)) * 100)}%` }}
            />
          </div>
        </div>
      )}
      {!batchRunning && showBatch && batch.status === "done" && batch.response && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <div className="flex items-center gap-2.5 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Kontrolli i fundit përfundoi — <b>{batch.response.results.length}</b> fluturime u kontrolluan.</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-emerald-700 hover:bg-emerald-100"
            onClick={() => { scheduleCheckStore.clear(); setShowBatch(false); setSingleResponse(null); setStatusFilter("all"); }}
          >
            <X className="h-3.5 w-3.5" /> Pastro
          </Button>
        </div>
      )}

      {/* Unique flight types panel — collapsible */}
      <Card>
        <CardHeader
          className="pb-3 cursor-pointer select-none"
          onClick={() => setShowUniqueTypes(v => !v)}
        >
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4 text-blue-600" />
              Llojet e Fluturimeve
              {!uniqueLoading && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({uniqueTypes.length} lloje unike)
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-muted-foreground" onClick={e => { e.stopPropagation(); setShowUniqueTypes(v => !v); }}>
              {showUniqueTypes ? <><ChevronUp className="h-3.5 w-3.5" /> Fshih</> : <><ChevronDown className="h-3.5 w-3.5" /> Shfaq listën</>}
            </Button>
          </CardTitle>
        </CardHeader>

        {showUniqueTypes && (
          <CardContent className="p-0">
            {uniqueLoading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Duke ngarkuar…
              </div>
            ) : uniqueTypes.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                Asnjë fluturim aktiv nuk u gjet.
              </div>
            ) : (
              <>
                {/* Batch toolbar */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-gray-50">
                  <Checkbox
                    checked={batchSelected.size === uniqueTypes.length && uniqueTypes.length > 0}
                    onCheckedChange={checked => {
                      if (checked) {
                        setBatchSelected(new Set(uniqueTypes.map(f => `${f.fromCity}-${f.toCity}-${f.flightNumber}`)));
                      } else {
                        setBatchSelected(new Set());
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {batchSelected.size > 0 ? `${batchSelected.size} të zgjedhura` : "Zgjidh të gjitha"}
                  </span>
                  {batchSelected.size > 0 && (
                    <>
                      <Button
                        size="sm"
                        className="h-7 gap-1.5 bg-blue-600 hover:bg-blue-700"
                        disabled={loading}
                        onClick={runBatchCheck}
                      >
                        {loading && batchProgress ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" />{batchProgress.done}/{batchProgress.total} duke kontrolluar…</>
                        ) : (
                          <><ListChecks className="h-3.5 w-3.5" />Kontrollo {batchSelected.size} rrugë</>
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setBatchSelected(new Set())}>
                        Pastro
                      </Button>
                    </>
                  )}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Fluturimi</TableHead>
                      <TableHead>Rruga</TableHead>
                      <TableHead className="text-center">Nr. Datave</TableHead>
                      <TableHead>Periudha</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uniqueTypes.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(f => {
                      const key = `${f.fromCity}-${f.toCity}-${f.flightNumber}`;
                      const isSelected = selectedTypeKey === key;
                      const isChecked  = batchSelected.has(key);
                      return (
                        <TableRow
                          key={key}
                          className={`transition-colors ${isChecked ? "bg-blue-50/60" : isSelected ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-gray-50"}`}
                        >
                          <TableCell className="pr-0">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={checked => {
                                setBatchSelected(prev => {
                                  const next = new Set(prev);
                                  if (checked) next.add(key); else next.delete(key);
                                  return next;
                                });
                              }}
                              onClick={e => e.stopPropagation()}
                            />
                          </TableCell>
                          <TableCell
                            className="cursor-pointer"
                            onClick={() => selectUniqueType(f)}
                          >
                            <div className="font-mono font-semibold text-sm text-gray-900">{fmtFlightNum(f.flightNumber)}</div>
                            <div className="text-xs text-muted-foreground">{f.airline}</div>
                          </TableCell>
                          <TableCell
                            className="cursor-pointer"
                            onClick={() => selectUniqueType(f)}
                          >
                            <div className="flex items-center gap-1.5 font-mono text-sm">
                              <span className="font-bold text-gray-800">{f.fromCity}</span>
                              <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                              <span className="font-bold text-gray-800">{f.toCity}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                              {f.flightCount}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {f.firstDate} → {f.lastDate}
                          </TableCell>
                          <TableCell>
                            {isSelected && !isChecked ? (
                              <span className="text-xs text-blue-600 font-semibold">✓ Zgjedhur</span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Shfaq:</span>
                    {([10, 50, 100] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => { setPageSize(s); setCurrentPage(1); }}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                          pageSize === s
                            ? "bg-blue-600 text-white"
                            : "bg-white border border-gray-200 text-gray-600 hover:bg-blue-50"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                    <span className="ml-2 text-muted-foreground">
                      {(currentPage - 1) * pageSize + 1}
                      –
                      {Math.min(currentPage * pageSize, uniqueTypes.length)} nga {uniqueTypes.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 rounded-md bg-white border border-gray-200 text-gray-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-50"
                    >
                      ← Mëparshme
                    </button>
                    <span className="px-3 py-1 font-semibold text-gray-700">
                      Faqe {currentPage} / {Math.max(1, Math.ceil(uniqueTypes.length / pageSize))}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(Math.ceil(uniqueTypes.length / pageSize), p + 1))}
                      disabled={currentPage >= Math.ceil(uniqueTypes.length / pageSize)}
                      className="px-3 py-1 rounded-md bg-white border border-gray-200 text-gray-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-50"
                    >
                      Tjetra →
                    </button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Search Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Kërko Fluturimin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Flight number search */}
          <div className="space-y-1">
            <Label>Kodi i Fluturimit / Rruga</Label>
            <FlightSearchCombobox
              allTypes={uniqueTypes}
              onSelect={handleSelect}
              onClear={() => { setFrom(""); setTo(""); setSelectedFlightNum(""); setFirstFlightDate(undefined); setSelectedTypeKey(null); }}
            />
            <p className="text-xs text-muted-foreground">
              Shkruaj kodin (p.sh. <span className="font-mono">W6</span>, <span className="font-mono">BLQ</span>, <span className="font-mono">W61234</span>) dhe zgjidh nga lista
            </p>
            <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
              <Info className="h-3 w-3" /> Google Flights kthen vetëm fluturime të ARDHSHME — periudha duhet të jetë pas datës së sotme
            </p>
          </div>

          {/* Auto-filled route display */}
          {from && to && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
              <span className="font-mono font-bold text-blue-800">{from}</span>
              <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
              <span className="font-mono font-bold text-blue-800">{to}</span>
              <span className="text-blue-600 text-xs ml-1">— rruga e zgjedhur</span>
            </div>
          )}

          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Data e Fillimit</Label>
              <DatePicker
                value={startDate}
                onChange={v => { setStartDate(v); if (endDate && v > endDate) setEndDate(v); }}
                highlightDate={firstFlightDate}
              />
            </div>
            <div className="space-y-1">
              <Label>Data e Mbarimit</Label>
              <DatePicker
                value={endDate}
                min={startDate || undefined}
                onChange={v => setEndDate(v)}
                highlightDate={firstFlightDate}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> {error}
            </p>
          )}

          <div>
            <Button onClick={handleCheck} disabled={loading || !from || !to} className="gap-2">
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ScanSearch className="h-4 w-4" />}
              {loading ? "Duke kontrolluar…" : "Kontrollo Oraret"}
            </Button>
            {loading && (
              <p className="text-xs text-muted-foreground mt-2">
                Duke kontaktuar Google Flights për çdo datë — mund të zgjasë disa sekonda…
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      {response && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <div>
                  <div className="text-2xl font-bold text-emerald-700">{ok.length}</div>
                  <div className="text-xs text-emerald-600">Pa ndryshim</div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/40">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-red-500" />
                <div>
                  <div className="text-2xl font-bold text-red-700">{changed.length}</div>
                  <div className="text-xs text-red-600">Orari ndryshoi</div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/40">
              <CardContent className="p-4 flex items-center gap-3">
                <XCircle className="h-8 w-8 text-red-500" />
                <div>
                  <div className="text-2xl font-bold text-red-700">{notFound.length}</div>
                  <div className="text-xs text-red-600">Nuk gjendet</div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-yellow-200 bg-yellow-50/40">
              <CardContent className="p-4 flex items-center gap-3">
                <Info className="h-8 w-8 text-yellow-500" />
                <div>
                  <div className="text-2xl font-bold text-yellow-700">{apiEmpty.length}</div>
                  <div className="text-xs text-yellow-600">API pa përgjigje</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Auto email status */}
          <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-blue-50 border border-blue-200">
            {emailSending
              ? <><Loader2 className="h-4 w-4 animate-spin text-blue-600" /><span className="text-blue-700">Duke gjeneruar Excel &amp; PDF dhe duke dërguar email automatikisht…</span></>
              : emailStatus
                ? emailStatus.ok
                  ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-emerald-700">{emailStatus.msg}</span></>
                  : <><AlertTriangle className="h-4 w-4 text-red-500" /><span className="text-red-600">{emailStatus.msg}</span></>
                : <><Mail className="h-4 w-4 text-blue-500" /><span className="text-blue-700">Raporti do të dërgohet automatikisht me email pas kontrollit.</span></>
            }
            {(response.results.length > 0 || (response.newFlights?.length ?? 0) > 0) && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto gap-1.5 border-blue-300 bg-white text-blue-700 hover:bg-blue-100"
                onClick={() => {
                  const html = generateScheduleCheckHTML(response, isBatchResult);
                  const win = window.open("", "_blank");
                  if (win) { win.document.write(html); win.document.close(); }
                }}
              >
                <FileDown className="h-4 w-4" /> Shkarko PDF
              </Button>
            )}
          </div>

          {/* Results table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {isBatchResult
                    ? <><ListChecks className="h-4 w-4 text-blue-600" />Rezultatet — {response.from} ({response.results.length} fluturime)</>
                    : <>Rezultatet — {response.from} <ArrowRight className="inline h-4 w-4" /> {response.to} &nbsp;({response.startDate} → {response.endDate})</>
                  }
                </CardTitle>
                {/* Status filter pills */}
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "all",          label: "Të gjitha",       count: response.results.length, color: "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200" },
                    { key: "unchanged",    label: "Pa ndryshim",     count: ok.length,       color: "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100" },
                    { key: "time_changed", label: "Orari ndryshoi",  count: changed.length,  color: "bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100" },
                    { key: "not_found",    label: "Nuk gjendet",     count: notFound.length, color: "bg-red-50 text-red-700 border-red-300 hover:bg-red-100" },
                    { key: "api_empty",    label: "API pa përgjigje",count: apiEmpty.length, color: "bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100" },
                  ] as const).filter(f => f.key === "all" || f.count > 0).map(f => (
                    <button
                      key={f.key}
                      onClick={() => { setStatusFilter(f.key); setBulkSelected2(new Set()); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${f.color} ${statusFilter === f.key ? "ring-2 ring-offset-1 ring-current font-bold shadow-sm" : "opacity-80"}`}
                    >
                      {f.label}
                      <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${statusFilter === f.key ? "bg-white/70" : "bg-white/50"}`}>
                        {f.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            {/* ── Quick-action bar (shown when a specific status filter is active) ── */}
            {statusFilter !== "all" && filteredResults.length > 0 && bulkSelected.size === 0 && (
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-slate-50 border-b text-sm">
                <span className="text-slate-600 font-medium text-xs">
                  Veprime për <strong className="text-slate-800">{filteredResults.length} fluturime</strong> të filtruara:
                </span>
                <div className="flex flex-wrap gap-1.5 ml-1">
                  <button
                    onClick={() => { setBulkSelected2(new Set(allFilteredIds)); setBulkSeatsOpen2(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-md text-xs font-medium text-slate-700 transition-colors shadow-sm"
                  >
                    <Users className="h-3.5 w-3.5 text-slate-500" /> Ndrysho Vendet
                  </button>
                  <button
                    onClick={() => { setBulkSelected2(new Set(allFilteredIds)); setBulkPriceOpen2(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-md text-xs font-medium text-slate-700 transition-colors shadow-sm"
                  >
                    <Tag className="h-3.5 w-3.5 text-slate-500" /> Ndrysho Çmimin
                  </button>
                  <button
                    onClick={() => { setBulkSelected2(new Set(allFilteredIds)); setBulkStatusVal("open"); setBulkStatusOpen2(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 rounded-md text-xs font-medium text-emerald-700 transition-colors shadow-sm"
                  >
                    <ToggleLeft className="h-3.5 w-3.5" /> Hap shitjet
                  </button>
                  <button
                    onClick={() => { setBulkSelected2(new Set(allFilteredIds)); setBulkStatusVal("closed"); setBulkStatusOpen2(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-300 hover:bg-red-100 rounded-md text-xs font-medium text-red-700 transition-colors shadow-sm"
                  >
                    <ToggleLeft className="h-3.5 w-3.5" /> Mbyll shitjet
                  </button>
                </div>
              </div>
            )}

            <CardContent className="p-0">
              {/* Bulk actions toolbar (when rows are manually checked) */}
              {bulkSelected.size > 0 && (() => {
                const syncableCount = (response?.results ?? []).filter(
                  r => bulkSelected.has(r.id) && r.status === "time_changed" && !syncedResults[r.id] && r.googleDepartureTime && r.googleArrivalTime
                ).length;
                const anySyncing = (response?.results ?? []).some(r => bulkSelected.has(r.id) && syncingIds.has(r.id));
                return (
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm">
                    <span className="font-semibold">{bulkSelected.size} fluturime të zgjedhura</span>
                    <button onClick={() => setBulkSelected2(new Set())} className="text-blue-200 hover:text-white text-xs underline ml-1">Anulo</button>
                    <div className="flex-1" />
                    {syncableCount > 0 && (
                      <button
                        onClick={syncAllBulk}
                        disabled={anySyncing}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 rounded-md text-xs font-semibold border border-emerald-400 transition-colors shadow-sm"
                      >
                        {anySyncing
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />
                        }
                        Sinkronizo të Gjithë ({syncableCount})
                      </button>
                    )}
                    <button onClick={() => setBulkSeatsOpen2(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-xs font-medium border border-white/30 transition-colors">
                      <Users className="h-3.5 w-3.5" /> Ndrysho Vendet
                    </button>
                    <button onClick={() => setBulkPriceOpen2(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-xs font-medium border border-white/30 transition-colors">
                      <Tag className="h-3.5 w-3.5" /> Ndrysho Çmimin
                    </button>
                    <button onClick={() => setBulkStatusOpen2(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-xs font-medium border border-white/30 transition-colors">
                      <ToggleLeft className="h-3.5 w-3.5" /> Ndrysho Statusin
                    </button>
                  </div>
                );
              })()}
              {response.results.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Asnjë fluturim nuk u gjet në sistem për këtë rrugë dhe periudhë.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          checked={allFilteredSelected}
                          onCheckedChange={toggleBulkAll}
                          className="border-gray-400"
                        />
                      </TableHead>
                      <TableHead>Fluturimi</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Orari Ynë</TableHead>
                      <TableHead>Orari Google</TableHead>
                      <TableHead className="text-center font-bold text-gray-900 bg-gray-100">Çmimi Ynë</TableHead>
                      <TableHead className="text-center text-blue-800 bg-blue-50">Çmimi Wizz</TableHead>
                      <TableHead>Statusi</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                          Asnjë fluturim me statusin e zgjedhur.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredResults.map(r => {
                      const bad     = r.status === "time_changed" || r.status === "not_found";
                      const isSynced   = !!syncedResults[r.id];
                      const isSyncing  = syncingIds.has(r.id);
                      const isExpanded = expandedId === r.id;
                      const displayDep = syncedResults[r.id]?.departureTime ?? r.ourDepartureTime;
                      const displayArr = syncedResults[r.id]?.arrivalTime   ?? r.ourArrivalTime;

                      return (
                        <Fragment key={r.id}>
                          <TableRow
                            className={`${bulkSelected.has(r.id) ? "bg-blue-50" : bad && !isSynced ? "bg-red-50/60 hover:bg-red-50" : isSynced ? "bg-emerald-50/60" : ""}`}
                          >
                            <TableCell className="pl-4 w-10">
                              <Checkbox
                                checked={bulkSelected.has(r.id)}
                                onCheckedChange={() => toggleBulkOne(r.id)}
                                className="border-gray-400"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-mono font-semibold text-sm">{fmtFlightNum(r.flightNumber)}</div>
                              <div className="text-xs text-muted-foreground">{r.airline}</div>
                            </TableCell>
                            <TableCell className="text-sm">{r.departureDate}</TableCell>
                            <TableCell className="text-sm font-medium">
                              {fmtAmPm(displayDep)} → {fmtAmPm(displayArr)}
                            </TableCell>
                            <TableCell>
                              {r.googleDepartureTime ? (
                                <span className={`text-sm font-medium ${bad && !isSynced ? "text-red-700 font-bold" : "text-emerald-700"}`}>
                                  {fmtAmPm(r.googleDepartureTime)} → {fmtAmPm(r.googleArrivalTime) || "—"}
                                </span>
                              ) : (
                                <span className={`text-sm ${r.status === "api_empty" ? "text-yellow-600" : "text-red-600 font-semibold"}`}>
                                  {r.status === "api_empty" ? "API pa rezultat" : "NUK GJENDET"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-bold text-gray-900 text-sm">
                                {r.ourPrice != null ? `€${fmtM(r.ourPrice)}` : "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-blue-700 text-sm font-medium">
                                {r.googlePrice != null ? `€${fmtM(r.googlePrice)}` : "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              {isSynced ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1 flex items-center w-fit">
                                  <CheckCircle2 className="h-3 w-3" />U sinkronizua
                                </Badge>
                              ) : (
                                <>
                                  <StatusBadge status={r.status} />
                                  {r.changes.map((c, i) => (
                                    <div key={i} className="text-xs text-red-600 mt-0.5">
                                      <span className="font-medium">{c.field}:</span>{" "}
                                      <span className="line-through opacity-60">{c.field.startsWith("Data") ? c.old : fmtAmPm(c.old)}</span>
                                      {" → "}
                                      <span className="font-bold">{c.field.startsWith("Data") ? c.new : fmtAmPm(c.new)}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {(r.status === "time_changed") && !isSynced && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
                                      onClick={() => openAddDialog({
                                        flightNumber: r.flightNumber,
                                        airline: r.airline,
                                        departureDate: r.departureDate,
                                        departureTime: r.googleDepartureTime || r.ourDepartureTime,
                                        arrivalTime: r.googleArrivalTime || r.ourArrivalTime,
                                        fromCity: response!.from.split(" ")[0] || "",
                                        toCity:   response!.to || "",
                                        googlePrice: r.googlePrice,
                                      })}
                                    >
                                      <PlusCircle className="h-3 w-3" /> Shto
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                                      disabled={isSyncing}
                                      onClick={() => syncSchedule(r)}
                                    >
                                      {isSyncing
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <ArrowRight className="h-3 w-3" />}
                                      {isSyncing ? "Duke…" : "Sinkronizo"}
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1"
                                  onClick={() => setSidePanelFlightId(prev => prev === r.id ? null : r.id)}
                                >
                                  <ExternalLink className="h-3 w-3" /> Hap
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* New flights from Google not in our system */}
          {(response.newFlights ?? []).length > 0 && (
            <Card className="border-purple-200 bg-purple-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-purple-800">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  Fluturime të Reja nga Google ({response.newFlights!.length})
                  <span className="text-xs font-normal text-purple-600 ml-1">
                    — gjenden në Google Flights por nuk janë në sistemin tonë
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fluturimi</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Rruga</TableHead>
                      <TableHead>Orari Google</TableHead>
                      <TableHead>Çmimi Google</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {response.newFlights!.map((f, i) => (
                      <TableRow key={`${f.flightNumber}-${f.departureDate}-${i}`} className="hover:bg-purple-50/50">
                        <TableCell>
                          <div className="font-mono font-semibold text-sm">{fmtFlightNum(f.flightNumber)}</div>
                          <div className="text-xs text-muted-foreground">{f.airline}</div>
                        </TableCell>
                        <TableCell className="text-sm">{f.departureDate}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 font-mono text-sm">
                            <span className="font-bold">{f.fromCity}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                            <span className="font-bold">{f.toCity}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {fmtAmPm(f.departureTime) || "—"} → {fmtAmPm(f.arrivalTime) || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {f.googlePrice ? `€${f.googlePrice.toFixed(0)}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            className="h-7 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={() => openAddDialog(f)}
                          >
                            <PlusCircle className="h-3.5 w-3.5" /> Shto
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Legend */}
          <Card className="bg-blue-50/30 border-blue-100">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-blue-800 mb-2">Legjenda:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <div><span className="font-semibold text-emerald-700">I pandryshuar</span> — Orari përputhet me Google.</div>
                <div><span className="font-semibold text-red-700">Orari ndryshoi</span> — Ka ndryshim ore nisje/mberritje.</div>
                <div><span className="font-semibold text-red-700">Nuk gjendet</span> — Nuk ekziston në Google Flights (mund të jetë anulluar).</div>
                <div><span className="font-semibold text-yellow-700">API pa përgjigje</span> — Google nuk ktheu rezultat për atë datë.</div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

    </div>{/* end flex-1 scroll area */}

    {/* ── Flight Side Panel (right) ──────────────────────────────────────────── */}
    {sidePanelFlightId !== null && (
      <FlightSidePanel
        flightId={sidePanelFlightId}
        onClose={() => setSidePanelFlightId(null)}
        onUpdated={() => {}}
      />
    )}

      {/* ── Add New Flight Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!addDialog} onOpenChange={open => { if (!open) { setAddDialog(null); setAddDone(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-purple-600" />
              Shto Fluturim të Ri
            </DialogTitle>
          </DialogHeader>

          {addDone ? (
            <div className="py-6 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-emerald-700 font-semibold">{addDone}</p>
              <Button variant="outline" onClick={() => { setAddDialog(null); setAddDone(null); }}>Mbyll</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 py-2">
                {[
                  { label: "Kodi Fluturimit *", key: "flightNumber" },
                  { label: "Linja Ajrore *",    key: "airline" },
                  { label: "Nga (kod IATA) *",  key: "fromCity" },
                  { label: "Deri (kod IATA) *", key: "toCity" },
                  { label: "Data Nisjes *",      key: "departureDate" },
                  { label: "Data Mberritjes",    key: "arrivalDate" },
                  { label: "Ora Nisjes *",       key: "departureTime" },
                  { label: "Ora Mberritjes",     key: "arrivalTime" },
                  { label: "Çmimi Adult (€) *",  key: "adultPrice" },
                  { label: "Çmimi Fëmijë (€)",   key: "childPrice" },
                  { label: "Çmimi Foshnjë (€)",  key: "infantPrice" },
                  { label: "Taksa (€)",           key: "tax" },
                  { label: "Vendeve Totale *",    key: "totalSeats" },
                ].map(({ label, key }) => (
                  <div key={key} className={key === "flightNumber" || key === "airline" ? "col-span-1" : ""}>
                    <Label className="text-xs mb-1 block">{label}</Label>
                    <Input
                      value={addForm[key as keyof typeof addForm]}
                      onChange={e => setAddForm(p => ({ ...p, [key]: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>

              {addError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {addError}
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setAddDialog(null)}>Anulo</Button>
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  disabled={addLoading}
                  onClick={submitAddFlight}
                >
                  {addLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Duke shtuar…</> : "Shto Fluturimin"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Seats Dialog */}
      <Dialog open={bulkSeatsOpen} onOpenChange={setBulkSeatsOpen2}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Ndrysho Vendet ({bulkSelected.size} fluturime)</DialogTitle></DialogHeader>
          <div className="py-2 space-y-2">
            <Label className="text-sm">Total Seats i ri</Label>
            <Input type="number" min="0" value={bulkSeatsVal} onChange={e => setBulkSeatsVal(e.target.value)} placeholder="p.sh. 150" className="h-9" autoFocus />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkSeatsOpen2(false)}>Anulo</Button>
            <Button disabled={bulkSaving2 || !bulkSeatsVal} onClick={handleBulkSeats2}>
              {bulkSaving2 ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Duke ruajtur…</> : "Ruaj"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Price Dialog */}
      <Dialog open={bulkPriceOpen} onOpenChange={setBulkPriceOpen2}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4" />Ndrysho Çmimin Adult ({bulkSelected.size} fluturime)</DialogTitle></DialogHeader>
          <div className="py-2 space-y-2">
            <Label className="text-sm">Çmimi i ri Adult (€)</Label>
            <Input type="number" min="0" step="1" value={bulkPriceVal} onChange={e => setBulkPriceVal(e.target.value)} placeholder="p.sh. 99.99" className="h-9" autoFocus />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkPriceOpen2(false)}>Anulo</Button>
            <Button disabled={bulkSaving2 || !bulkPriceVal} onClick={handleBulkPrice2}>
              {bulkSaving2 ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Duke ruajtur…</> : "Ruaj"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Dialog */}
      <Dialog open={bulkStatusOpen} onOpenChange={setBulkStatusOpen2}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ToggleLeft className="h-4 w-4" />Ndrysho Statusin ({bulkSelected.size} fluturime)</DialogTitle></DialogHeader>
          <div className="py-2 space-y-2">
            <Label className="text-sm">Statusi i ri</Label>
            <select value={bulkStatusVal} onChange={e => setBulkStatusVal(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-background h-9">
              <option value="open">I hapur (Open)</option>
              <option value="closed">I mbyllur (Closed)</option>
              <option value="soldout">Shitur plotësisht (Sold Out)</option>
              <option value="cancelled">I anulluar (Cancelled)</option>
            </select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkStatusOpen2(false)}>Anulo</Button>
            <Button disabled={bulkSaving2} onClick={handleBulkStatus2}>
              {bulkSaving2 ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Duke ruajtur…</> : "Ruaj"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
