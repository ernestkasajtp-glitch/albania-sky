import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { fmtFlightNum, fmtAmPm, fmtM } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plane, Loader2, ArrowRight, Search, X, ChevronDown, ChevronRight,
  CalendarPlus, Plus, CheckCircle2, AlertTriangle,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface UniqueFlightType {
  flightNumber: string;
  airline: string;
  fromCity: string;
  toCity: string;
  flightCount: number;
  firstDate: string;
  lastDate: string;
}

interface NewFlightCandidate {
  date: string;
  flightNumber: string;
  airline: string;
  departureTime: string;
  arrivalTime: string;
  googlePrice: number | null;
}

interface ExtendDefaults {
  adultPrice: string | null;
  childPrice: string | null;
  infantPrice: string | null;
  totalSeats: number | null;
  checkedBaggagePrice: string | null;
  checkedBaggageCount: number | null;
  checkedBaggageKg: number | null;
}

interface ExtendSearchResponse {
  newFlights: NewFlightCandidate[];
  checkedDates: number;
  alreadyHave: number;
  apiErrors: number;
  defaults: ExtendDefaults | null;
}

interface FoundFlight {
  id: number;
  flightNumber: string;
  airline: string;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  googlePrice: number | null;
  searchStart: string | null;
  searchEnd: string | null;
  foundAt: string;
}

function routeKeyOf(f: { fromCity: string; toCity: string }): string {
  return `${f.fromCity}__${f.toCity}`;
}

function candidateKey(f: { date: string; flightNumber: string }): string {
  return `${f.date}|${f.flightNumber}`;
}

const PAGE_SIZES = [10, 50, 100] as const;
const WEEKDAYS_SQ = ["E Diel", "E Hënë", "E Martë", "E Mërkurë", "E Enjte", "E Premte", "E Shtunë"];

function addDaysIso(iso: string, n: number): string {
  const t = new Date(iso + "T00:00:00Z").getTime();
  if (Number.isNaN(t)) return iso;
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

function weekdaySq(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS_SQ[d.getUTCDay()];
}

function typeKey(f: UniqueFlightType): string {
  return `${f.fromCity}-${f.toCity}-${f.flightNumber}-${f.airline}`;
}

// ── Inline panel to extend a flight type's dates ─────────────────────────────
function ExtendPanel({ type, onAdded }: { type: UniqueFlightType; onAdded: () => void }) {
  const { toast } = useToast();
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultStart = (() => {
    const afterLast = addDaysIso(type.lastDate, 1);
    return afterLast < todayIso ? todayIso : afterLast;
  })();

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate]     = useState(addDaysIso(defaultStart, 30));
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<ExtendSearchResponse | null>(null);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [adding, setAdding]       = useState(false);

  // Confirm form (set prices/seats before creating).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fAdult, setFAdult]             = useState("");
  const [fChild, setFChild]             = useState("");
  const [fInfant, setFInfant]           = useState("");
  const [fSeats, setFSeats]             = useState("20");
  const [fBaggage, setFBaggage]         = useState("");
  const [fBaggageCount, setFBaggageCount] = useState("");
  const [fBaggageKg, setFBaggageKg]     = useState("");

  const search = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setResult(null);
    setSelected(new Set());
    try {
      const r = await fetch(`${API_BASE}/flights/extend-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          flightNumber: type.flightNumber,
          airline: type.airline,
          fromCity: type.fromCity,
          toCity: type.toCity,
          startDate, endDate,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Gabim", description: data?.error ?? "Kontrolli dështoi.", variant: "destructive" });
        return;
      }
      setResult(data);
      // Pre-select all found by default.
      setSelected(new Set((data.newFlights as NewFlightCandidate[]).map(candidateKey)));
    } catch {
      toast({ title: "Gabim", description: "Lidhja me serverin dështoi.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const allSelected = result != null && result.newFlights.length > 0 && selected.size === result.newFlights.length;
  const toggleAll = () => {
    if (!result) return;
    setSelected(allSelected ? new Set() : new Set(result.newFlights.map(candidateKey)));
  };

  // Open the confirm form, pre-filled with the type's current prices/seats.
  const openConfirm = () => {
    if (selected.size === 0) return;
    const d = result?.defaults;
    setFAdult(d?.adultPrice ?? "");
    setFChild(d?.childPrice ?? "");
    setFInfant(d?.infantPrice ?? "");
    setFSeats("20");
    setFBaggage(d?.checkedBaggagePrice ?? "");
    setFBaggageCount(d?.checkedBaggageCount != null ? String(d.checkedBaggageCount) : "");
    setFBaggageKg(d?.checkedBaggageKg != null ? String(d.checkedBaggageKg) : "");
    setConfirmOpen(true);
  };

  const confirmAdd = async () => {
    if (!result || selected.size === 0) return;
    const items = result.newFlights
      .filter(f => selected.has(candidateKey(f)))
      .map(f => ({ date: f.date, flightNumber: f.flightNumber, airline: f.airline }));
    setAdding(true);
    try {
      const r = await fetch(`${API_BASE}/flights/extend-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromCity: type.fromCity,
          toCity: type.toCity,
          items,
          adultPrice: Math.round(Number(fAdult)),
          childPrice: Math.round(Number(fChild)),
          infantPrice: Math.round(Number(fInfant)),
          totalSeats: fSeats,
          checkedBaggagePrice: Math.round(Number(fBaggage)),
          checkedBaggageCount: fBaggageCount,
          checkedBaggageKg: fBaggageKg,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Gabim", description: data?.error ?? "Shtimi dështoi.", variant: "destructive" });
        return;
      }
      toast({
        title: "U shtuan fluturimet",
        description: `${data.created} fluturime të reja u krijuan.`,
      });
      // Remove the added rows from the result list.
      setResult(prev => prev ? { ...prev, newFlights: prev.newFlights.filter(f => !selected.has(candidateKey(f))) } : prev);
      setSelected(new Set());
      setConfirmOpen(false);
      onAdded();
    } catch {
      toast({ title: "Gabim", description: "Lidhja me serverin dështoi.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="bg-blue-50/40 border-t border-blue-100 px-4 py-4 space-y-4">
      {/* Range picker */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nga data</label>
          <Input type="date" value={startDate} min={todayIso}
            onChange={e => setStartDate(e.target.value)} className="h-9 w-40" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Deri më datë</label>
          <Input type="date" value={endDate} min={startDate}
            onChange={e => setEndDate(e.target.value)} className="h-9 w-40" />
        </div>
        <Button onClick={search} disabled={loading} className="h-9 gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "Duke kontrolluar Google…" : "Gjej fluturime të reja"}
        </Button>
        <span className="text-xs text-muted-foreground self-center">
          Kontrollohet në Google nëse ekziston fluturimi <b>{fmtFlightNum(type.flightNumber)}</b> në datat që nuk i ke.
        </span>
      </div>

      {loading && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Po kontrollohen datat në Google… kjo mund të zgjasë pak (deri ~1 minutë për intervale të gjata).
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>U kontrolluan <b>{result.checkedDates}</b> data të reja.</span>
            <span>Tashmë ke <b>{result.alreadyHave}</b> në këtë interval.</span>
            {result.apiErrors > 0 && (
              <span className="text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {result.apiErrors} data s'u kontrolluan dot (gabim Google) — provo sërish.
              </span>
            )}
          </div>

          {result.newFlights.length === 0 ? (
            <div className="text-sm text-gray-600 bg-white border rounded-md px-3 py-4 text-center">
              {result.apiErrors > 0
                ? "Nuk u gjet asnjë fluturim i ri (disa data s'u kontrolluan dot)."
                : "Nuk ka fluturime të reja në Google për këtë interval — i ke të gjitha."}
            </div>
          ) : (
            <div className="bg-white border rounded-md overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-blue-600" />
                  Zgjidh të gjitha ({result.newFlights.length})
                </label>
                <Button onClick={openConfirm} disabled={adding || selected.size === 0}
                  size="sm" className="h-8 gap-1.5 bg-green-600 hover:bg-green-700">
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Shto të zgjedhurat ({selected.size})
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Dita</TableHead>
                    <TableHead>Kodi</TableHead>
                    <TableHead>Orari (Google)</TableHead>
                    <TableHead className="text-right">Çmimi (Google)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.newFlights.map(f => {
                    const key = candidateKey(f);
                    return (
                      <TableRow key={key} className="hover:bg-gray-50">
                        <TableCell>
                          <input type="checkbox" checked={selected.has(key)}
                            onChange={() => toggle(key)} className="h-4 w-4 accent-blue-600" />
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium">{f.date}</TableCell>
                        <TableCell className="text-sm text-gray-600">{weekdaySq(f.date)}</TableCell>
                        <TableCell className="font-mono text-sm font-semibold text-blue-700">{fmtFlightNum(f.flightNumber)}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {fmtAmPm(f.departureTime) || "—"}{f.arrivalTime ? ` → ${fmtAmPm(f.arrivalTime)}` : ""}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {f.googlePrice != null
                            ? <span className="font-semibold text-amber-700">€{fmtM(f.googlePrice)}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Confirm form: set prices/seats before creating the flights */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vendos çmimet & vendet</DialogTitle>
            <DialogDescription>
              Po shtohen <b>{selected.size}</b> fluturime. Vlerat më poshtë do të aplikohen për të gjitha.
              Lëri bosh për të mbajtur vlerat e fluturimit ekzistues.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div>
              <Label className="text-xs">Çmimi (Adult) €</Label>
              <Input type="number" min="0" step="1" value={fAdult}
                onChange={e => setFAdult(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Çmimi (Fëmijë) €</Label>
              <Input type="number" min="0" step="1" value={fChild}
                onChange={e => setFChild(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Çmimi (Foshnjë) €</Label>
              <Input type="number" min="0" step="1" value={fInfant}
                onChange={e => setFInfant(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Nr. personash (vende)</Label>
              <Input type="number" min="1" step="1" value={fSeats}
                onChange={e => setFSeats(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Nr. bagazhëve (copë)</Label>
              <Input type="number" min="0" step="1" value={fBaggageCount}
                onChange={e => setFBaggageCount(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Pesha (kg)</Label>
              <Input type="number" min="0" step="0.5" value={fBaggageKg}
                onChange={e => setFBaggageKg(e.target.value)} className="h-9 mt-1" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Çmimi i bagazhit €</Label>
              <Input type="number" min="0" step="1" value={fBaggage}
                onChange={e => setFBaggage(e.target.value)} className="h-9 mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={adding}>Anulo</Button>
            <Button onClick={confirmAdd} disabled={adding} className="bg-green-600 hover:bg-green-700 gap-1.5">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Shto {selected.size} fluturime
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Saved "new flights" found via batch search, grouped per destination ──────
function SavedFoundFlights({ flights, onChanged }: { flights: FoundFlight[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [openRoutes, setOpenRoutes] = useState<Set<string>>(new Set());
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [busy, setBusy]             = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fAdult, setFAdult]             = useState("");
  const [fChild, setFChild]             = useState("");
  const [fInfant, setFInfant]           = useState("");
  const [fSeats, setFSeats]             = useState("20");
  const [fBaggage, setFBaggage]         = useState("");
  const [fBaggageCount, setFBaggageCount] = useState("");
  const [fBaggageKg, setFBaggageKg]     = useState("");

  const groups = useMemo(() => {
    const m = new Map<string, { fromCity: string; toCity: string; items: FoundFlight[] }>();
    for (const f of flights) {
      const k = routeKeyOf(f);
      if (!m.has(k)) m.set(k, { fromCity: f.fromCity, toCity: f.toCity, items: [] });
      m.get(k)!.items.push(f);
    }
    return Array.from(m.values()).sort((a, b) =>
      a.fromCity.localeCompare(b.fromCity) || a.toCity.localeCompare(b.toCity));
  }, [flights]);

  // Drop selections that no longer exist after a refresh.
  useEffect(() => {
    setSelected(prev => {
      const live = new Set(flights.map(f => f.id));
      const next = new Set<number>();
      prev.forEach(id => { if (live.has(id)) next.add(id); });
      return next;
    });
  }, [flights]);

  if (flights.length === 0) return null;

  const toggleRoute = (k: string) => setOpenRoutes(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  const toggleOne = (id: number) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const setRouteAll = (ids: number[], on: boolean) => setSelected(prev => {
    const n = new Set(prev);
    ids.forEach(id => { on ? n.add(id) : n.delete(id); });
    return n;
  });

  const doDismiss = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/flights/found-flights/dismiss`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await r.json();
      if (!r.ok) { toast({ title: "Gabim", description: data?.error ?? "Heqja dështoi.", variant: "destructive" }); return; }
      toast({ title: "U hoqën nga lista", description: `${data.dismissed} fluturime u hoqën.` });
      setSelected(new Set());
      onChanged();
    } catch {
      toast({ title: "Gabim", description: "Lidhja me serverin dështoi.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const openAdd = () => {
    if (selected.size === 0) return;
    setFAdult(""); setFChild(""); setFInfant(""); setFSeats("20");
    setFBaggage(""); setFBaggageCount(""); setFBaggageKg("");
    setConfirmOpen(true);
  };

  const doAdd = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/flights/found-flights/add`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          ids: [...selected],
          adultPrice: Math.round(Number(fAdult)), childPrice: Math.round(Number(fChild)), infantPrice: Math.round(Number(fInfant)),
          totalSeats: fSeats, checkedBaggagePrice: Math.round(Number(fBaggage)),
          checkedBaggageCount: fBaggageCount, checkedBaggageKg: fBaggageKg,
        }),
      });
      const data = await r.json();
      if (!r.ok) { toast({ title: "Gabim", description: data?.error ?? "Shtimi dështoi.", variant: "destructive" }); return; }
      const parts: string[] = [`${data.created ?? 0} fluturime të reja u krijuan.`];
      if (data.alreadyExists) parts.push(`${data.alreadyExists} ekzistonin tashmë (u hoqën nga lista).`);
      if (data.skippedNoTemplate) parts.push(`${data.skippedNoTemplate} u lanë (s'ka fluturim model për t'i kopjuar) dhe rrinë në listë.`);
      if (data.skippedPast) parts.push(`${data.skippedPast} me datë të kaluar u lanë në listë.`);
      toast({ title: "U përpunuan fluturimet", description: parts.join(" ") });
      setSelected(new Set());
      setConfirmOpen(false);
      onChanged();
    } catch {
      toast({ title: "Gabim", description: "Lidhja me serverin dështoi.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-green-600" />
            Fluturime të Reja të Ruajtura
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({flights.length} në {groups.length} {groups.length === 1 ? "destinacion" : "destinacione"})
            </span>
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button onClick={doDismiss} disabled={busy} size="sm" variant="outline"
                className="h-8 gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                <X className="h-4 w-4" /> Hiq nga lista ({selected.size})
              </Button>
              <Button onClick={openAdd} disabled={busy} size="sm"
                className="h-8 gap-1.5 bg-green-600 hover:bg-green-700">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Shto të zgjedhurat ({selected.size})
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.map(g => {
          const k = routeKeyOf(g);
          const isOpen = openRoutes.has(k);
          const ids = g.items.map(i => i.id);
          const selCount = ids.filter(id => selected.has(id)).length;
          const allSel = ids.length > 0 && selCount === ids.length;
          return (
            <div key={k} className="border rounded-md overflow-hidden">
              <div
                className={`flex items-center justify-between px-3 py-2 cursor-pointer ${isOpen ? "bg-green-50/70" : "bg-gray-50 hover:bg-gray-100"}`}
                onClick={() => toggleRoute(k)}
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                  <span className="font-mono font-bold text-sm text-gray-800">{g.fromCity}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-mono font-bold text-sm text-gray-800">{g.toCity}</span>
                  <span className="ml-2 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-green-100 text-green-800 text-xs font-bold">
                    {g.items.length}
                  </span>
                  {selCount > 0 && (
                    <span className="text-xs text-green-700 font-medium">{selCount} të zgjedhura</span>
                  )}
                </div>
              </div>
              {isOpen && (
                <div className="bg-white">
                  <div className="flex items-center px-3 py-2 border-b" onClick={e => e.stopPropagation()}>
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input type="checkbox" checked={allSel}
                        onChange={() => setRouteAll(ids, !allSel)}
                        className="h-4 w-4 accent-green-600" />
                      Zgjidh të gjitha ({g.items.length})
                    </label>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Dita</TableHead>
                        <TableHead>Kodi</TableHead>
                        <TableHead>Orari (Google)</TableHead>
                        <TableHead className="text-right">Çmimi (Google)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.items.map(f => (
                        <TableRow key={f.id} className="hover:bg-gray-50">
                          <TableCell onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(f.id)}
                              onChange={() => toggleOne(f.id)} className="h-4 w-4 accent-green-600" />
                          </TableCell>
                          <TableCell className="font-mono text-sm font-medium">{f.departureDate}</TableCell>
                          <TableCell className="text-sm text-gray-600">{weekdaySq(f.departureDate)}</TableCell>
                          <TableCell className="font-mono text-sm font-semibold text-blue-700">{fmtFlightNum(f.flightNumber)}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {fmtAmPm(f.departureTime) || "—"}{f.arrivalTime ? ` → ${fmtAmPm(f.arrivalTime)}` : ""}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {f.googlePrice != null
                              ? <span className="font-semibold text-amber-700">€{fmtM(f.googlePrice)}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      {/* Confirm form: optional price/seat overrides before creating the flights */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vendos çmimet & vendet</DialogTitle>
            <DialogDescription>
              Po shtohen <b>{selected.size}</b> fluturime. Lëri bosh për të mbajtur vlerat e fluturimit ekzistues të të njëjtit lloj.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div>
              <Label className="text-xs">Çmimi (Adult) €</Label>
              <Input type="number" min="0" step="1" value={fAdult}
                onChange={e => setFAdult(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Çmimi (Fëmijë) €</Label>
              <Input type="number" min="0" step="1" value={fChild}
                onChange={e => setFChild(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Çmimi (Foshnjë) €</Label>
              <Input type="number" min="0" step="1" value={fInfant}
                onChange={e => setFInfant(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Nr. personash (vende)</Label>
              <Input type="number" min="1" step="1" value={fSeats}
                onChange={e => setFSeats(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Nr. bagazhëve (copë)</Label>
              <Input type="number" min="0" step="1" value={fBaggageCount}
                onChange={e => setFBaggageCount(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Pesha (kg)</Label>
              <Input type="number" min="0" step="0.5" value={fBaggageKg}
                onChange={e => setFBaggageKg(e.target.value)} className="h-9 mt-1" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Çmimi i bagazhit €</Label>
              <Input type="number" min="0" step="1" value={fBaggage}
                onChange={e => setFBaggage(e.target.value)} className="h-9 mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Anulo</Button>
            <Button onClick={doAdd} disabled={busy} className="bg-green-600 hover:bg-green-700 gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Shto {selected.size} fluturime
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function FlightTypesPage() {
  const [types, setTypes]     = useState<UniqueFlightType[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { toast } = useToast();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  // Optional global override. When empty, each flight uses its OWN interval.
  const [bStart, setBStart]   = useState("");
  const [bEnd, setBEnd]       = useState("");
  const [searching, setSearching] = useState(false);
  const [saved, setSaved]     = useState<FoundFlight[]>([]);

  const loadTypes = useCallback(() => {
    return fetch(`${API_BASE}/flights/unique-types`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : []))
      .then(data => setTypes(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadSaved = useCallback(() => {
    return fetch(`${API_BASE}/flights/found-flights`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : []))
      .then(data => setSaved(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  const refreshAll = useCallback(() => { loadTypes(); loadSaved(); }, [loadTypes, loadSaved]);

  const toggleType = (key: string) =>
    setSelectedTypes(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const batchSearch = async () => {
    if (selectedTypes.size === 0) return;
    // A global interval is optional and, if half-filled, both ends are required.
    if ((bStart && !bEnd) || (bEnd && !bStart)) {
      toast({ title: "Interval i paplotë", description: "Plotëso të dyja datat ose lëri bosh që secili fluturim të përdorë intervalin e vet." });
      return;
    }
    const byKey = new Map(types.map(f => [typeKey(f), f] as const));
    const chosen = [...selectedTypes].map(k => byKey.get(k)).filter((f): f is UniqueFlightType => !!f);
    if (chosen.length === 0) return;
    setSearching(true);
    try {
      const r = await fetch(`${API_BASE}/flights/found-flights/search`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          // Global override only when both ends are set; otherwise each flight
          // searches its OWN interval (firstDate → lastDate).
          ...(bStart && bEnd ? { startDate: bStart, endDate: bEnd } : {}),
          types: chosen.map(f => ({
            flightNumber: f.flightNumber, airline: f.airline, fromCity: f.fromCity, toCity: f.toCity,
            startDate: f.firstDate, endDate: f.lastDate,
          })),
        }),
      });
      const data = await r.json();
      if (!r.ok) { toast({ title: "Gabim", description: data?.error ?? "Kërkimi dështoi.", variant: "destructive" }); return; }
      toast({
        title: "Kërkimi përfundoi",
        variant: data.apiErrors > 0 ? "destructive" : "default",
        description: `U ruajtën ${data.saved} fluturime të reja (u gjetën ${data.found}).` +
          (data.apiErrors > 0 ? ` ${data.apiErrors} kontrolle dështuan — provo sërish.` : ""),
      });
      setSelectedTypes(new Set());
      await loadSaved();
    } catch {
      toast({ title: "Gabim", description: "Lidhja me serverin dështoi.", variant: "destructive" });
    } finally { setSearching(false); }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return types;
    return types.filter(f =>
      f.flightNumber.toLowerCase().includes(q) ||
      f.airline.toLowerCase().includes(q) ||
      f.fromCity.toLowerCase().includes(q) ||
      f.toCity.toLowerCase().includes(q) ||
      `${f.fromCity}-${f.toCity}`.toLowerCase().includes(q) ||
      `${f.fromCity} ${f.toCity}`.toLowerCase().includes(q)
    );
  }, [types, query]);

  useEffect(() => { setCurrentPage(1); }, [query, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="flex-1 p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Plane className="h-6 w-6 text-blue-600" />
          Llojet e Fluturimeve
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lista e llojeve të ndryshme të fluturimeve që ofrojmë — pa datat individuale.
          Kliko një rresht për të <b>zgjeruar datat</b> e atij fluturimi.
        </p>
      </div>

      {/* Batch: find new flights for the selected flight codes over an interval */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="p-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <div className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <Search className="h-4 w-4 text-blue-600" />
                Gjej fluturime të reja për kodet e zgjedhura
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Zgjidh një ose disa lloje më poshtë dhe kontrollohet në Google për data të reja që s'i ke.
                Si parazgjedhje, secili fluturim kontrollohet brenda <b>intervalit të vet</b> (periudha që ke aktualisht).
                Rezultatet <b>ruhen</b> për secilin destinacion dhe rrinë aty derisa t'i shtosh ose t'i heqësh.
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nga data <span className="text-gray-400">(opsionale)</span></label>
              <Input type="date" value={bStart} min={todayIso}
                onChange={e => setBStart(e.target.value)} className="h-9 w-40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Deri më datë <span className="text-gray-400">(opsionale)</span></label>
              <Input type="date" value={bEnd} min={bStart || todayIso}
                onChange={e => setBEnd(e.target.value)} className="h-9 w-40" />
            </div>
            <Button onClick={batchSearch} disabled={searching || selectedTypes.size === 0} className="h-9 gap-1.5">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? "Duke kontrolluar Google…" : `Gjej fluturime të reja (${selectedTypes.size})`}
            </Button>
          </div>
          {searching && (
            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Po kontrollohen datat në Google për llojet e zgjedhura… kjo mund të zgjasë pak.
            </div>
          )}
        </CardContent>
      </Card>

      <SavedFoundFlights flights={saved} onChanged={refreshAll} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4 text-blue-600" />
              Llojet e Fluturimeve
              {!loading && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({filtered.length} {filtered.length === 1 ? "lloj unik" : "lloje unike"})
                </span>
              )}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Kërko fluturim, kompani ose rrugë…"
                className="pl-8 pr-8 h-9"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title="Pastro"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Duke ngarkuar…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-sm text-muted-foreground text-center">
              {query ? "Asnjë fluturim nuk përputhet me kërkimin." : "Asnjë fluturim aktiv nuk u gjet."}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every(f => selectedTypes.has(typeKey(f)))}
                        onChange={e => setSelectedTypes(prev => {
                          const n = new Set(prev);
                          if (e.target.checked) filtered.forEach(f => n.add(typeKey(f)));
                          else filtered.forEach(f => n.delete(typeKey(f)));
                          return n;
                        })}
                        className="h-4 w-4 accent-blue-600 align-middle"
                        title="Zgjidh të gjitha"
                      />
                    </TableHead>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Fluturimi</TableHead>
                    <TableHead>Rruga</TableHead>
                    <TableHead className="text-center">Nr. Datave</TableHead>
                    <TableHead>Periudha</TableHead>
                    <TableHead className="text-right">Veprime</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map(f => {
                    const key = typeKey(f);
                    const isOpen = expandedKey === key;
                    return (
                      <Fragment key={key}>
                        <TableRow
                          className={`cursor-pointer ${isOpen ? "bg-blue-50/60" : "hover:bg-gray-50"}`}
                          onClick={() => setExpandedKey(isOpen ? null : key)}
                        >
                          <TableCell onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedTypes.has(key)}
                              onChange={() => toggleType(key)} className="h-4 w-4 accent-blue-600 align-middle" />
                          </TableCell>
                          <TableCell className="text-gray-400">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell>
                            <div className="font-mono font-semibold text-sm text-gray-900">{fmtFlightNum(f.flightNumber)}</div>
                            <div className="text-xs text-muted-foreground">{f.airline}</div>
                          </TableCell>
                          <TableCell>
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
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <Button
                              variant={isOpen ? "secondary" : "outline"}
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => setExpandedKey(isOpen ? null : key)}
                            >
                              <CalendarPlus className="h-4 w-4" />
                              Zgjero datat
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={7} className="p-0">
                              <ExtendPanel type={f} onAdded={refreshAll} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination footer */}
              <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-xs flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Shfaq:</span>
                  {PAGE_SIZES.map(s => (
                    <button
                      key={s}
                      onClick={() => setPageSize(s)}
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
                    {Math.min(currentPage * pageSize, filtered.length)} nga {filtered.length}
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
                    Faqe {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-1 rounded-md bg-white border border-gray-200 text-gray-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-50"
                  >
                    Tjetra →
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
