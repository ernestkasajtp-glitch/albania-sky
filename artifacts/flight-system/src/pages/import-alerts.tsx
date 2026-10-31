import { useState, useEffect, useRef } from "react";
import { PriorityHistory } from "@/components/priority-history";
import { Link } from "wouter";
import {
  AlertTriangle, Loader2, CheckCircle2, RefreshCw, Plug, FileWarning, Server, Mail, Download, Luggage
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface ImportAlert {
  id: number;
  kind: "booking" | "connection";
  source: string;
  cpCode: string | null;
  bookings?: { id: number; bookingRef: string }[];
  fileName: string | null;
  reason: string;
  hasRawCsv?: boolean;
  createdAt: string;
  resolvedAt: string | null;
  email?: { subject: string; to: string; status: string; canRetry: boolean; attempts: number; lastAttemptAt: string; sentAt?: string } | null;
}

async function downloadRawCsv(a: ImportAlert) {
  const resp = await fetch(`${API_BASE}/cp-import-alerts/${a.id}/raw`, { credentials: "include" });
  if (!resp.ok) throw new Error("download failed");
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = a.fileName || `import_${a.id}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function sourceLabel(source: string): string {
  if (source.startsWith("priority:")) return "Email";
  if (source === "sftp") return "SFTP";
  if (source === "email") return "Email / IMAP";
  return "Offline";
}

// Dosjet e bagazheve (luggages_*.csv) janë vetëm informative — shfaqen në tab-in e tyre.
function isLuggageAlert(a: ImportAlert): boolean {
  return /^luggages/i.test(a.fileName ?? "");
}

export default function ImportAlertsPage() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<ImportAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkLock = useRef(false);
  const retryEmail = async (a: ImportAlert) => {
    const uncertain = a.email?.status === "uncertain";
    if (!window.confirm(uncertain
      ? "Rezultati i dërgimit të mëparshëm është i paqartë. Mund të dërgohet një kopje e dytë. Dëshironi ta ridërgoni?"
      : `Të ridërgohet email-i "${a.email?.subject}" te ${a.email?.to}?`)) return;
    setRetrying(a.id);
    try {
      const resp = await fetch(`${API_BASE}/cp-import-alerts/${a.id}/retry-email`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmUncertain: uncertain }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Ridërgimi dështoi.");
      toast({ title: "Email-i u ridërgua", description: "U pranua nga serveri i email-it; njoftimi u mbyll." });
    } catch (e) {
      toast({ title: "Ridërgimi nuk u konfirmua", description: e instanceof Error ? e.message : "Provoni përsëri.", variant: "destructive" });
    } finally { setRetrying(null); await load(); }
  };
  const [tab, setTab] = useState<"main" | "luggage" | "priority">("main");
  useEffect(() => { setSelected(new Set()); }, [tab, showResolved]);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await fetch(
        `${API_BASE}/cp-import-alerts${showResolved ? "?resolved=1" : ""}`,
        { credentials: "include" }
      );
      if (resp.ok) {
        const data = await resp.json();
        setHasMore(data.length === 300);
        setAlerts(Array.isArray(data) ? data : []);
      }
    } catch {
      toast({ title: "Gabim", description: "Nuk u ngarkuan njoftimet.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showResolved]);

  const resolve = async (id: number) => {
    setResolving(id);
    try {
      const resp = await fetch(`${API_BASE}/cp-import-alerts/${id}/resolve`, {
        method: "POST",
        credentials: "include",
      });
      if (resp.ok) {
        toast({ title: "U shënua si e zgjidhur" });
        // Përditëso listën në vend — pa rifreskim të faqes dhe pa spinner.
        setAlerts(prev => showResolved
          ? prev.map(a => a.id === id ? { ...a, resolvedAt: new Date().toISOString() } : a)
          : prev.filter(a => a.id !== id));
      } else {
        toast({ title: "Gabim", description: "Veprimi dështoi.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Gabim", description: "Veprimi dështoi.", variant: "destructive" });
    } finally {
      setResolving(null);
    }
  };

  const priorityAlerts = alerts.filter(a => a.source.startsWith("priority:"));
  const mainAlerts = alerts.filter(a => !isLuggageAlert(a) && !a.source.startsWith("priority:"));
  const loadMore = async () => {
    if (moreBusy || !alerts.length) return;
    setMoreBusy(true);
    try {
      const response = await fetch(`${API_BASE}/cp-import-alerts?beforeId=${Math.min(...alerts.map(a => a.id))}${showResolved ? "&resolved=1" : ""}`, { credentials: "include" });
      if (!response.ok) throw new Error("Ngarkimi dështoi.");
      const data: ImportAlert[] = await response.json();
      setAlerts(prev => [...prev, ...data.filter(a => !prev.some(p => p.id === a.id))]);
      setHasMore(data.length === 300);
    } catch {
      toast({ title: "Njoftimet e tjera nuk u ngarkuan", variant: "destructive" });
    } finally { setMoreBusy(false); }
  };
  const luggageAlerts = alerts.filter(isLuggageAlert);
  const shownAlerts = tab === "priority" ? priorityAlerts : tab === "luggage" ? luggageAlerts : mainAlerts;
  const selectable = shownAlerts.filter(a => !a.resolvedAt && a.email?.status !== "sending");
  const selectedVisible = selectable.filter(a => selected.has(a.id));
  const allSelected = selectable.length > 0 && selectedVisible.length === selectable.length;
  const resolveSelected = async () => {
    if (bulkLock.current || !selectedVisible.length) return;
    const ids = selectedVisible.map(a => a.id);
    if (!window.confirm(`Të shënohen ${ids.length} njoftime si të zgjidhura? Ky veprim vetëm mbyll njoftimet; nuk riparon importet dhe nuk ridërgon email-e.`)) return;
    bulkLock.current = true; setBulkBusy(true);
    const successful = new Set<number>();
    try {
      // Reuse the admin-only single-resolution endpoint and its email-send lock.
      // Bound concurrency so selecting many alerts does not exhaust the DB pool.
      for (let i = 0; i < ids.length; i += 4) {
        await Promise.all(ids.slice(i, i + 4).map(async id => {
          try {
            const resp = await fetch(`${API_BASE}/cp-import-alerts/${id}/resolve`, { method: "POST", credentials: "include" });
            if (resp.ok) successful.add(id);
          } catch { /* Failed items remain selected and can be retried. */ }
        }));
      }
      setSelected(new Set(ids.filter(id => !successful.has(id))));
      const failed = ids.length - successful.size;
      toast({
        title: failed ? "Disa njoftime nuk u mbyllën" : "Njoftimet u shënuan si të zgjidhura",
        description: `${successful.size} u zgjidhën${failed ? `; ${failed} nuk u mbyllën. Mund të jenë në ridërgim ose kërkesa dështoi.` : "."}`,
        ...(failed ? { variant: "destructive" as const } : {}),
      });
      await load();
    } finally { bulkLock.current = false; setBulkBusy(false); }
  };
  const unresolvedCount = shownAlerts.filter(a => !a.resolvedAt).length;
  const luggageUnresolved = luggageAlerts.filter(a => !a.resolvedAt).length;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Njoftime Importi dhe Sistemi</h1>
            <p className="text-sm text-gray-500">
              Dështime importi, raportesh automatike dhe dërgimi email-esh. Mbeten këtu deri në zgjidhje.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowResolved(v => !v)}>
            {showResolved ? "Vetëm të pazgjidhurat" : "Shfaq të zgjidhurat"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        <button type="button" onClick={() => setTab("priority")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === "priority" ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500"}`}>
          PRIORITY <span className="ml-1 rounded-full bg-blue-100 px-2">{priorityAlerts.filter(a => !a.resolvedAt).length}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("main")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === "main" ? "border-red-500 text-red-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Njoftime
            {mainAlerts.filter(a => !a.resolvedAt).length > 0 && (
              <span className="text-[11px] font-bold bg-red-100 text-red-700 rounded-full px-1.5 py-0.5">
                {mainAlerts.filter(a => !a.resolvedAt).length}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("luggage")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === "luggage" ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          title="Dosjet luggages_*.csv — vetëm informative, nuk numërohen si njoftime"
        >
          <span className="inline-flex items-center gap-1.5">
            <Luggage className="h-4 w-4" /> Bagazhet (luggages)
            {luggageUnresolved > 0 && (
              <span className="text-[11px] font-bold bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5">
                {luggageUnresolved}
              </span>
            )}
          </span>
        </button>
      </div>

      {tab === "luggage" && (
        <p className="text-xs text-slate-500 mb-4">
          Dosjet e bagazheve (<span className="font-mono">luggages_*.csv</span>) janë vetëm informative — nuk numërohen te njoftimet dhe nuk shfaqen te numëruesi i kuq në menu.
        </p>
      )}
      {hasMore && <Button className="mb-4" variant="outline" disabled={moreBusy || loading || bulkBusy} onClick={loadMore}>
        {moreBusy ? "Duke ngarkuar…" : "Shfaq njoftime më të vjetra"}
      </Button>}
      {tab === "priority" && <PriorityHistory onFinished={load} />}
      {tab === "priority" && <p className="text-xs text-slate-500 mb-4">
        Email-et e reja të rezervimeve me bagazh kabine të blerë. Kontroll çdo minutë, edhe kur moduli i Email-it është i çaktivizuar.
        Njoftimet janë informative; rezervimet dhe pagesat nuk ndryshohen.
      </p>}

      {!loading && !showResolved && (
        <p className="text-sm text-gray-600 mb-4">
          {unresolvedCount > 0
            ? `${unresolvedCount} njoftim(e) të pazgjidhura.`
            : "Nuk ka njoftime të pazgjidhura. 🎉"}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : shownAlerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
            {showResolved ? "Nuk ka njoftime." : "Nuk ka njoftime të pazgjidhura."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" aria-label="Zgjidh të gjitha njoftimet e shfaqura"
                checked={allSelected} disabled={bulkBusy || loading || !selectable.length}
                onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(a => a.id)))} />
              Zgjidh të gjitha të shfaqurat ({selectable.length})
            </label>
            <Button size="sm" disabled={bulkBusy || loading || retrying !== null || resolving !== null || !selectedVisible.length} onClick={resolveSelected}>
              {bulkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {bulkBusy ? "Duke zgjidhur…" : `Shëno si të zgjidhura (${selectedVisible.length})`}
            </Button>
            <span className="text-xs text-gray-500">Vetëm njoftimet e pazgjidhura në këtë listë.</span>
          </div>
          {shownAlerts.map(a => {
            const isConn = a.kind === "connection";
            const Icon = isConn ? (a.email || a.source === "email" ? Mail : Server) : FileWarning;
            return (
              <Card key={a.id} className={a.resolvedAt ? "opacity-60" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    {!a.resolvedAt && <input type="checkbox" className="mt-3 shrink-0"
                      aria-label={`Zgjidh njoftimin ${a.id}`} checked={selected.has(a.id)}
                      disabled={bulkBusy || a.email?.status === "sending"}
                      onChange={e => setSelected(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(a.id); else next.delete(a.id);
                        return next;
                      })} />}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isConn ? "bg-orange-100" : "bg-red-100"}`}>
                      <Icon className={`h-4 w-4 ${isConn ? "text-orange-600" : "text-red-600"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {a.email && <div className="mb-3 text-sm break-words">
                        <p className="font-semibold">{a.email.subject}</p>
                        <p>Marrësi: {a.email.to}</p>
                        <p className="text-xs text-gray-600">
                          {a.email.status === "sent" ? "Pranuar nga serveri i email-it" :
                            a.email.status === "sending" ? "Ridërgimi në proces" :
                            a.email.status === "uncertain" ? "Rezultat i paqartë — mund të jetë dërguar" : "Dërgimi dështoi"}
                          {" · "}Tentativa: {a.email.attempts}
                        </p>
                        <p className="text-xs text-gray-500">Tentativa e fundit: {format(new Date(a.email.lastAttemptAt), "dd.MM.yyyy HH:mm")}</p>
                        {!a.resolvedAt && <Button className="mt-2" size="sm"
                          disabled={bulkBusy || !a.email.canRetry || retrying !== null}
                          onClick={() => retryEmail(a)}>
                          {retrying === a.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                          {retrying === a.id ? "Duke ridërguar…" : "Ridërgo email-in"}
                        </Button>}
                        {!a.email.canRetry && a.email.status === "failed" &&
                          <p className="text-xs text-red-600 mt-1">Përmbajtja nuk u ruajt; ridërgimi nuk është i disponueshëm.</p>}
                      </div>}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant={isConn ? "secondary" : "destructive"} className="text-[10px]">
                          {a.source.startsWith("priority:") ? "PRIORITY" : a.source.startsWith("system:") ? "Dështim sistemi" : isConn ? "Lidhja dështoi" : "Rezervim s'u importua"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Plug className="h-3 w-3" /> {a.source.startsWith("system:") ? (a.source === "system:smtp" || a.email ? "Email dalës" : "Raport automatik") : sourceLabel(a.source)}
                        </Badge>
                        {a.cpCode && (
                          <Badge variant="outline" className="text-[10px] gap-1 font-mono border-blue-300 text-blue-700 bg-blue-50">
                            Kodi CP: {a.cpCode}
                          </Badge>
                        )}
                        {a.resolvedAt && (
                          <Badge className="text-[10px] bg-green-100 text-green-700 hover:bg-green-100">Zgjidhur</Badge>
                        )}
                      </div>
                      {a.source.startsWith("priority:") && (
                        <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
                          <span className="text-gray-500">Rezervimi:</span>
                          {a.bookings?.length ? a.bookings.map(booking => (
                            <Link key={booking.id} href={`/bookings/${booking.id}`}
                              className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline focus-visible:outline-2">
                              {booking.bookingRef}
                            </Link>
                          )) : <span className="text-gray-500">Rezervimi nuk u gjet</span>}
                        </div>
                      )}
                      <p className="text-sm text-gray-800 break-words whitespace-pre-wrap">{a.reason.replace(/citizen\s*plane|citizen/gi, "Offline")}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                        {a.fileName && <span className="font-mono truncate">{a.fileName}</span>}
                        <span>{format(new Date(a.createdAt), "dd.MM.yyyy h:mm a")}</span>
                        {a.hasRawCsv && (
                          <button
                            onClick={() => downloadRawCsv(a).catch(() => toast({ title: "Gabim", description: "Shkarkimi i CSV dështoi.", variant: "destructive" }))}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            title="Shkarko përmbajtjen e plotë të dosjes CSV që dështoi — të dhënat s'humbin edhe pse dosja u fshi nga serveri"
                          >
                            <Download className="h-3 w-3" /> Shkarko CSV
                          </button>
                        )}
                      </div>
                    </div>
                    {!a.resolvedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolve(a.id)}
                        disabled={bulkBusy || resolving === a.id || retrying === a.id || a.email?.status === "sending"}
                        className="shrink-0"
                      >
                        {resolving === a.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><CheckCircle2 className="h-4 w-4 mr-1" /> Zgjidhur</>}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
