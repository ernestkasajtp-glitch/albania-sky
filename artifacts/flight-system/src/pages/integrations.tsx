import React, { useState, useEffect, useRef, useCallback } from "react";
import { offlineText } from "@/lib/flightActivityDisplay";
import {
  Webhook, Copy, RefreshCw, Loader2, CheckCircle2, XCircle, Clock,
  Eye, EyeOff, Trash2, Info, ToggleLeft, ToggleRight, ExternalLink,
  ChevronDown, ChevronRight, Terminal, ShieldCheck, Download, Plane,
  AlertTriangle, FileSpreadsheet, History, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { confirmDangerDialog } from "@/lib/confirm";
import { fmtDateTimeAmPm } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface WebhookLog {
  id: number;
  source: string;
  status: string;
  bookingId: number | null;
  bookingRef: string | null;
  rawPayload: string;
  errorMessage: string | null;
  createdAt: string;
}

interface WebhookData {
  enabled: boolean;
  secret: string | null;
  logs: WebhookLog[];
}

const STATUS_STYLES: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  success:      { color: "bg-green-100 text-green-700 border-green-200",  icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Sukses" },
  error:        { color: "bg-red-100 text-red-700 border-red-200",        icon: <XCircle      className="h-3.5 w-3.5" />, label: "Gabim"  },
  unauthorized: { color: "bg-orange-100 text-orange-700 border-orange-200", icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "Paautorizuar" },
  pending:      { color: "bg-gray-100 text-gray-600 border-gray-200",    icon: <Clock        className="h-3.5 w-3.5" />, label: "Pritje" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s më parë`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min më parë`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h më parë`;
  return `${Math.floor(h / 24)}d më parë`;
}

function CodeBlock({ children }: { children: string }) {
  const { toast } = useToast();
  return (
    <div className="relative group rounded-lg bg-gray-950 text-gray-100 text-xs font-mono p-4 overflow-x-auto">
      <button
        onClick={() => { navigator.clipboard.writeText(children); toast({ title: "U kopjua!" }); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-gray-700 hover:bg-gray-600"
      >
        <Copy className="h-3 w-3" />
      </button>
      <pre className="whitespace-pre-wrap break-all">{children}</pre>
    </div>
  );
}

interface ImportResult {
  filesProcessed: number;
  bookingsCreated: number;
  errors: string[];
}

interface CpExportLog {
  id: number;
  exportedAt: string;
  flightsExported: number;
  status: string;
  errors: string | null;
  source: string;
}

function formatExportDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (isToday) return `sot ${time}`;
  if (isYesterday) return `dje ${time}`;
  return d.toLocaleDateString("sq-AL", { day: "2-digit", month: "short" }) + ` ${time}`;
}


export default function IntegrationsPage() {
  const [data, setData] = useState<WebhookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [secretVisible, setSecretVisible] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [showDocs, setShowDocs] = useState(true);
  const [cpImporting, setCpImporting] = useState(false);
  const [cpResult, setCpResult] = useState<ImportResult | null>(null);
  const [cpError, setCpError] = useState<string | null>(null);
  const [cpExporting, setCpExporting] = useState(false);
  const [cpExportResult, setCpExportResult] = useState<{ ok: boolean; flightsExported: number; errors: string[] } | null>(null);
  const [cpExportError, setCpExportError] = useState<string | null>(null);
  const [cpExportLogs, setCpExportLogs] = useState<CpExportLog[]>([]);
  const [showExportHistory, setShowExportHistory] = useState(true);
  const [expandedExportLog, setExpandedExportLog] = useState<number | null>(null);
  const [onlyFailedExports, setOnlyFailedExports] = useState(false);
  const [nextCronCountdown, setNextCronCountdown] = useState<string | null>(null);
  const [extApi, setExtApi] = useState<{ enabled: boolean; apiKey: string | null } | null>(null);
  const [extKeyVisible, setExtKeyVisible] = useState(false);
  const [extRegenerating, setExtRegenerating] = useState(false);
  const [extDisabling, setExtDisabling] = useState(false);
  const [showExtDocs, setShowExtDocs] = useState(true);
  const { toast } = useToast();

  const CP_EXPORT_INTERVAL_MS = 30 * 60 * 1000;

  const computeNextCron = useCallback((logs: CpExportLog[]) => {
    const lastCron = logs.find(l => l.source === "cron");
    if (!lastCron) return null;
    const nextAt = new Date(lastCron.exportedAt).getTime() + CP_EXPORT_INTERVAL_MS;
    const diffMs = nextAt - Date.now();
    if (diffMs <= 0) return "Tani...";
    const totalSec = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, []);

  const fetchExportLogs = async () => {
    try {
      const resp = await fetch(`${API_BASE}/citizenplane/export/logs`, { credentials: "include" });
      if (resp.ok) {
        const logs: CpExportLog[] = await resp.json();
        setCpExportLogs(logs);
        setNextCronCountdown(computeNextCron(logs));
      }
    } catch { }
  };

  const runCitizenPlaneExport = async () => {
    setCpExporting(true);
    setCpExportResult(null);
    setCpExportError(null);
    try {
      const resp = await fetch(`${API_BASE}/citizenplane/export`, {
        method: "POST",
        credentials: "include",
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.errors?.[0] ?? json.error ?? "Gabim i panjohur");
      setCpExportResult(json);
      if (json.ok && json.flightsExported > 0) {
        toast({ title: `${json.flightsExported} fluturime u eksportuan me sukses!` });
      } else if (json.ok && json.flightsExported === 0) {
        toast({ title: "Nuk ka fluturime aktive për eksport." });
      }
    } catch (err: any) {
      setCpExportError(err.message ?? "Gabim gjatë eksportit");
    } finally {
      setCpExporting(false);
      await fetchExportLogs();
    }
  };

  const downloadCsvPreview = () => {
    window.open(`${API_BASE}/citizenplane/export/preview`, "_blank");
  };

  const runCitizenPlaneImport = async () => {
    setCpImporting(true);
    setCpResult(null);
    setCpError(null);
    try {
      const resp = await fetch(`${API_BASE}/admin/citizenplane/import`, {
        method: "POST",
        credentials: "include",
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error ?? "Gabim i panjohur");
      setCpResult(json);
    } catch (err: any) {
      setCpError(err.message ?? "Gabim gjatë importit");
    } finally {
      setCpImporting(false);
    }
  };

  const webhookUrl = `${window.location.protocol}//${window.location.host.replace(/:\d+$/, "")}${import.meta.env.BASE_URL.replace(/\/$/, "").replace(/flight-system/, "api-server")}/api/webhook/booking`;
  const prodUrl = "https://kings-travel.tours/api/webhook/booking";

  const fetchData = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/webhook`, { credentials: "include" });
      if (resp.ok) setData(await resp.json());
    } catch {
      toast({ title: "Gabim gjatë ngarkimit", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchExtApi = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/external-api`, { credentials: "include" });
      if (resp.ok) setExtApi(await resp.json());
    } catch { }
  };

  const handleExtRegenerate = async () => {
    setExtRegenerating(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/external-api/regenerate`, {
        method: "POST", credentials: "include",
      });
      if (resp.ok) {
        toast({ title: "Çelësi API u gjenerua! Dërgoja partnerit." });
        setExtKeyVisible(true);
        await fetchExtApi();
      }
    } catch {
      toast({ title: "Gabim", variant: "destructive" });
    } finally {
      setExtRegenerating(false);
    }
  };

  const handleExtDisable = async () => {
    if (!(await confirmDangerDialog({ title: "Çaktivizo API-në e partnerëve?", text: "Partneri nuk do të mund të tërheqë më fluturimet." }))) return;
    setExtDisabling(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/external-api`, {
        method: "DELETE", credentials: "include",
      });
      if (resp.ok) { toast({ title: "API u çaktivizua" }); await fetchExtApi(); }
    } catch {
      toast({ title: "Gabim", variant: "destructive" });
    } finally {
      setExtDisabling(false);
    }
  };

  useEffect(() => { fetchData(); fetchExportLogs(); fetchExtApi(); }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNextCronCountdown(prev => {
        if (!prev) return prev;
        return computeNextCron(cpExportLogs);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cpExportLogs, computeNextCron]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/webhook/regenerate`, {
        method: "POST", credentials: "include",
      });
      if (resp.ok) {
        toast({ title: "Çelësi i ri u gjenerua! Përditëso sistemin tjetër me çelësin e ri." });
        setSecretVisible(true);
        await fetchData();
      }
    } catch {
      toast({ title: "Gabim", variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  const handleDisable = async () => {
    if (!(await confirmDangerDialog({ title: "Çaktivizo webhook-un?", text: "Të gjitha webhook-et do të bllokohen." }))) return;
    setDisabling(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/webhook`, {
        method: "DELETE", credentials: "include",
      });
      if (resp.ok) { toast({ title: "Webhook u çaktivizua" }); await fetchData(); }
    } catch {
      toast({ title: "Gabim", variant: "destructive" });
    } finally {
      setDisabling(false);
    }
  };

  const handleClearLogs = async () => {
    if (!(await confirmDangerDialog({ title: "Fshi të gjitha logs?", text: "Ky veprim nuk mund të zhbëhet." }))) return;
    setClearingLogs(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/webhook/logs`, {
        method: "DELETE", credentials: "include",
      });
      if (resp.ok) { toast({ title: "Logs u fshinë" }); await fetchData(); }
    } catch {
      toast({ title: "Gabim", variant: "destructive" });
    } finally {
      setClearingLogs(false);
    }
  };

  const copyToClipboard = (text: string, label = "U kopjua!") => {
    navigator.clipboard.writeText(text);
    toast({ title: label });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const successCount = data?.logs.filter(l => l.status === "success").length ?? 0;
  const errorCount   = data?.logs.filter(l => l.status === "error" || l.status === "unauthorized").length ?? 0;

  const examplePayload = JSON.stringify({
    flight_id: 5,
    customer_name: "Gent Leka",
    customer_email: "gent@example.com",
    customer_phone: "+355 69 123 4567",
    total_amount: "250.00",
    paid_amount: "0.00",
    pnr: "ABC123",
    status: "confirmed",
    notes: "Importuar nga sistemi ynë",
    source: "emri-sistemit-tuaj",
    passengers: [
      {
        type: "adult",
        first_name: "Gent",
        last_name: "Leka",
        passport_number: "AL1234567",
        nationality: "Albanian",
      }
    ]
  }, null, 2);

  const exampleCurl = `curl -X POST \\
  "${prodUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: ${data?.secret ? data.secret.substring(0, 8) + "..." : "ÇELËSI-JUAJ-SEKRET"}" \\
  -d '${examplePayload}'`;

  const exampleJs = `const response = await fetch("${prodUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Webhook-Secret": process.env.FMS_WEBHOOK_SECRET,
  },
  body: JSON.stringify({
    flight_id: 5,
    customer_name: "Gent Leka",
    total_amount: "250.00",
    status: "confirmed",
    passengers: [{ type: "adult", first_name: "Gent", last_name: "Leka" }]
  })
});
const result = await response.json();
console.log(result.booking_ref); // "WH3K8N2F"`;

  // ── External Partner API (Kiss & Fly / TTN) ──────────────────────────────────
  const extApiOrigin = `${window.location.protocol}//${window.location.host.replace(/:\d+$/, "")}`;
  const extApiUrl = `${extApiOrigin}/api/v1/flights`;
  const extKeyMasked = extApi?.apiKey
    ? (extKeyVisible ? extApi.apiKey : "•".repeat(Math.min(extApi.apiKey.length, 48)))
    : "";
  const extKeyForDocs = extApi?.apiKey
    ? (extKeyVisible ? extApi.apiKey : extApi.apiKey.substring(0, 8) + "...")
    : "ÇELËSI-API";

  const extCurl = `curl "${extApiUrl}" \\
  -H "X-API-Key: ${extKeyForDocs}"`;

  const extJs = `const res = await fetch("${extApiUrl}", {
  headers: { "X-API-Key": "YOUR_API_KEY" }
});
const data = await res.json();
console.log(data.count, data.flights);`;

  const extResponse = JSON.stringify({
    count: 1,
    currency: "EUR",
    generated_at: "2026-06-01T10:00:00.000Z",
    flights: [
      {
        id: 5,
        airline: "Wizz Air",
        flight_number: "W6 4567",
        from: "TIA",
        from_city: "Tirana",
        to: "BER",
        to_city: "Berlin",
        departure_date: "2026-06-15",
        departure_time: "14:30",
        arrival_date: "2026-06-15",
        arrival_time: "16:45",
        currency: "EUR",
        price_adult: 120,
        price_child: 100,
        price_infant: 20,
        tax: 15,
        total_seats: 180,
        available_seats: 42,
        baggage: { cabin_kg: 10, checked_count: 1, checked_kg: 20, checked_price: 25 },
        status: "open",
        updated_at: "2026-05-30T09:00:00.000Z",
      },
    ],
  }, null, 2);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Webhook className="h-6 w-6 text-primary" />
            Integrimet & Webhook
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Lidh sistemin tënd të jashtëm — rezervimet vijnë automatikisht këtu.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchData(); fetchExportLogs(); }} className="h-8">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Rifresko
        </Button>
      </div>

      {/* Status banner */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
        data?.enabled
          ? "bg-green-50 border-green-200"
          : "bg-gray-50 border-gray-200"
      }`}>
        {data?.enabled
          ? <ToggleRight className="h-5 w-5 text-green-600 shrink-0" />
          : <ToggleLeft  className="h-5 w-5 text-gray-400 shrink-0" />
        }
        <div className="flex-1">
          <span className={`text-sm font-semibold ${data?.enabled ? "text-green-700" : "text-gray-600"}`}>
            Webhook {data?.enabled ? "Aktiv" : "Jo Aktiv"}
          </span>
          {data?.enabled && (
            <span className="text-xs text-green-600 ml-2">
              · {successCount} sukses, {errorCount} gabim ({data.logs.length} total)
            </span>
          )}
        </div>
        {data?.enabled
          ? (
            <Button variant="outline" size="sm" className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50"
              onClick={handleDisable} disabled={disabling}>
              {disabling ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Çaktivizo
            </Button>
          ) : (
            <Button size="sm" className="h-7 text-xs" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Aktivizo & Gjenero Çelës
            </Button>
          )
        }
      </div>

      {/* External Partner API (Kiss & Fly / TTN) */}
      <Card className="border-violet-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="bg-violet-600 text-white rounded-lg p-2">
                <Plane className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  API për Partnerët
                  <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px]">Kiss &amp; Fly / TTN</Badge>
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Partneri tërheq fluturimet e tua të disponueshme (vetëm-lexim, JSON, i mbrojtur me çelës)
                </CardDescription>
              </div>
            </div>
            {extApi?.enabled
              ? (
                <Button variant="outline" size="sm" className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50"
                  onClick={handleExtDisable} disabled={extDisabling}>
                  {extDisabling ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Çaktivizo
                </Button>
              ) : (
                <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700"
                  onClick={handleExtRegenerate} disabled={extRegenerating}>
                  {extRegenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Aktivizo & Gjenero Çelës
                </Button>
              )
            }
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">URL e API-së (jepja partnerit)</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 border rounded-lg px-3 py-2 text-xs font-mono text-gray-700 break-all">
                {extApiUrl}
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                onClick={() => copyToClipboard(extApiUrl, "URL u kopjua!")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1.5">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>Metoda: <strong>GET</strong> · Header: <strong>X-API-Key</strong> · Filtra opsionalë: <code className="bg-gray-100 px-1 rounded">?from=TIA&to=BER&date=2026-06-15</code></span>
            </div>
          </div>

          {/* API Key */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Çelësi API</p>
            {extApi?.enabled && extApi.apiKey ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-950 text-gray-100 border border-gray-800 rounded-lg px-3 py-2 text-xs font-mono break-all">
                    {extKeyMasked}
                  </div>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                    onClick={() => setExtKeyVisible(v => !v)}>
                    {extKeyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                    onClick={() => copyToClipboard(extApi.apiKey!, "Çelësi u kopjua!")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 text-xs shrink-0"
                    onClick={handleExtRegenerate} disabled={extRegenerating}>
                    {extRegenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Rigjeneroj
                  </Button>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2 text-xs text-amber-700">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Mos e ndaj këtë çelës publikisht. Jepja vetëm partnerit (Kiss & Fly / TTN). Nëse komprometohet, kliko "Rigjeneroj".
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400 py-2 text-center border rounded-lg bg-gray-50">
                Aktivizoni API-në për të gjeneruar çelësin
              </div>
            )}
          </div>

          {/* Docs */}
          <div className="border-t pt-3">
            <button
              onClick={() => setShowExtDocs(v => !v)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Terminal className="h-4 w-4 text-gray-500" />
                Dokumentacioni (jepja zhvilluesve të partnerit)
              </div>
              {showExtDocs ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
            </button>
            {showExtDocs && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">cURL (terminal):</p>
                    <CodeBlock>{extCurl}</CodeBlock>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">JavaScript / Node.js:</p>
                    <CodeBlock>{extJs}</CodeBlock>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">Fushat e kthyera për çdo fluturim:</p>
                    <div className="space-y-1.5">
                      {[
                        ["id", "ID unike e fluturimit"],
                        ["airline / flight_number", "Kompania ajrore dhe numri i fluturimit"],
                        ["from / to", "Kodet IATA të aeroporteve (p.sh. TIA, BER)"],
                        ["from_city / to_city", "Emrat e qyteteve"],
                        ["departure_date / departure_time", "Data dhe ora e nisjes"],
                        ["arrival_date / arrival_time", "Data dhe ora e mbërritjes"],
                        ["price_adult / price_child / price_infant", "Çmimet sipas tipit (EUR)"],
                        ["tax", "Taksa (EUR)"],
                        ["total_seats / available_seats", "Vendet totale dhe të lira"],
                        ["baggage", "Bagazhi: cabin_kg, checked_count, checked_kg, checked_price"],
                        ["status", "Statusi (open)"],
                      ].map(([field, desc]) => (
                        <div key={field} className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
                          <code className="text-[11px] bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-700 shrink-0">{field}</code>
                          <span className="text-[11px] text-gray-500 leading-tight">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Përgjigja shembull (JSON):</p>
                  <CodeBlock>{extResponse}</CodeBlock>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-start gap-2 text-xs text-blue-700 mt-3">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      Kthen vetëm fluturimet me status <strong>open</strong>, datë në të ardhmen dhe vende të lira.
                      Pa çelës të vlefshëm përgjigja është <code className="bg-blue-100 px-0.5 rounded">401</code>.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: config */}
        <div className="space-y-4">
          {/* Webhook URL */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">URL e Webhook-ut</CardTitle>
              <CardDescription className="text-xs">Dërgoni rezervimet tek kjo adresë</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 border rounded-lg px-3 py-2 text-xs font-mono text-gray-700 break-all">
                  {prodUrl}
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                  onClick={() => copyToClipboard(prodUrl, "URL u kopjua!")}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>Metoda: <strong>POST</strong> · Content-Type: <strong>application/json</strong></span>
              </div>
            </CardContent>
          </Card>

          {/* Secret Key */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Çelësi Sekret</CardTitle>
                  <CardDescription className="text-xs">Vendoseni në header X-Webhook-Secret</CardDescription>
                </div>
                {data?.enabled && (
                  <Button variant="outline" size="sm" className="h-7 text-xs"
                    onClick={handleRegenerate} disabled={regenerating}>
                    {regenerating
                      ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      : <RefreshCw className="h-3 w-3 mr-1" />
                    }
                    Rigjeneroj
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {data?.enabled && data.secret ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-950 text-gray-100 border border-gray-800 rounded-lg px-3 py-2 text-xs font-mono break-all">
                      {secretVisible ? data.secret : "•".repeat(Math.min(data.secret.length, 48))}
                    </div>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                      onClick={() => setSecretVisible(v => !v)}>
                      {secretVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                      onClick={() => copyToClipboard(data.secret!, "Çelësi u kopjua!")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2 text-xs text-amber-700">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Mos e ndaj këtë çelës publikisht. Nëse komprometohet, klikoni "Rigjeneroj".
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400 py-2 text-center">
                  Aktivizoni webhook-un për të gjeneruar çelësin sekret
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fields reference */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Fushat e Pranuara</CardTitle>
              <CardDescription className="text-xs">Çfarë mund të dërgoni në payload</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {[
                  ["flight_id",       "integer", true,  "ID e fluturimit nga FMS (shiko listën e fluturimeve)"],
                  ["customer_name",   "string",  true,  "Emri i plotë i klientit"],
                  ["customer_email",  "string",  false, "Email i klientit"],
                  ["customer_phone",  "string",  false, "Numri i telefonit"],
                  ["total_amount",    "number",  false, "Çmimi total (€)"],
                  ["paid_amount",     "number",  false, "Shuma e paguar (€)"],
                  ["pnr",             "string",  false, "Kodi PNR (nëse ekziston)"],
                  ["status",          "string",  false, "confirmed / draft / cancelled"],
                  ["notes",           "string",  false, "Shënime shtesë"],
                  ["source",          "string",  false, "Emri i sistemit tuaj (p.sh. 'MySystem')"],
                  ["agent_id",        "integer", false, "ID e agjentit (opsional)"],
                  ["passengers",      "array",   false, "Lista e pasagjerëve (shiko shembullin)"],
                ].map(([field, type, req, desc]) => (
                  <div key={field as string} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                    <code className="text-[11px] bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-700 shrink-0">
                      {field as string}
                    </code>
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 shrink-0 ${
                      req ? "border-red-200 text-red-600 bg-red-50" : "text-gray-400"
                    }`}>
                      {req ? "kërkohet" : "opsional"}
                    </Badge>
                    <span className="text-[11px] text-gray-500 leading-tight">{desc as string}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: examples + logs */}
        <div className="space-y-4">
          {/* Code examples */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <button
                onClick={() => setShowDocs(v => !v)}
                className="flex items-center justify-between w-full text-left"
              >
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-gray-500" />
                    Shembuj Kodi
                  </CardTitle>
                  <CardDescription className="text-xs">Copy-paste direkt në sistemin tuaj</CardDescription>
                </div>
                {showDocs
                  ? <ChevronDown className="h-4 w-4 text-gray-400" />
                  : <ChevronRight className="h-4 w-4 text-gray-400" />
                }
              </button>
            </CardHeader>
            {showDocs && (
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">cURL (terminal):</p>
                  <CodeBlock>{exampleCurl}</CodeBlock>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">JavaScript / Node.js:</p>
                  <CodeBlock>{exampleJs}</CodeBlock>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Shembull payload i plotë (JSON):</p>
                  <CodeBlock>{examplePayload}</CodeBlock>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-start gap-2 text-xs text-blue-700">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Sistemi pranon emra fushash si <code className="bg-blue-100 px-0.5 rounded">customer_name</code> dhe{" "}
                    <code className="bg-blue-100 px-0.5 rounded">customerName</code> — të dyja funksionojnë.
                  </span>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Activity Logs */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Aktiviteti i Fundit</CardTitle>
                  <CardDescription className="text-xs">{data?.logs.length ?? 0} kërkesa totale</CardDescription>
                </div>
                {(data?.logs?.length ?? 0) > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700"
                    onClick={handleClearLogs} disabled={clearingLogs}>
                    {clearingLogs ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                    Fshi Logs
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!data?.logs.length ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                  <Webhook className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Ende nuk ka aktivitet</p>
                  <p className="text-xs">Logs do të shfaqen këtu sapo të marrësh rezervimet e para</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.logs.map(log => {
                    const st = STATUS_STYLES[log.status] ?? STATUS_STYLES.pending;
                    const isExpanded = expandedLog === log.id;
                    return (
                      <div key={log.id}>
                        <button
                          onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <Badge className={`${st.color} flex items-center gap-1 text-[10px] px-2 py-0.5 border shrink-0`}>
                            {st.icon} {st.label}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-800 truncate">
                              {log.bookingRef
                                ? `Rezervim: ${log.bookingRef}`
                                : offlineText(log.errorMessage ?? "Kërkesë e dërguar")
                              }
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {offlineText(log.source ?? "")} · {timeAgo(log.createdAt)}
                            </div>
                          </div>
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          }
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-3 bg-gray-50 border-t">
                            <div className="text-[11px] text-gray-500 mb-2 pt-2 flex flex-wrap gap-x-4 gap-y-1">
                              <span><strong>ID:</strong> #{log.id}</span>
                              {log.bookingId && <span><strong>Booking ID:</strong> {log.bookingId}</span>}
                              <span><strong>Datë:</strong> {fmtDateTimeAmPm(log.createdAt)}</span>
                              {log.errorMessage && (
                                <span className="text-red-600"><strong>Gabim:</strong> {offlineText(log.errorMessage)}</span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-500 mb-1 font-semibold">Payload i dërguar:</div>
                            <div className="bg-gray-900 text-gray-200 rounded p-2 text-[10px] font-mono overflow-x-auto max-h-32 overflow-y-auto">
                              {(() => {
                                try { return JSON.stringify(JSON.parse(log.rawPayload), null, 2); }
                                catch { return log.rawPayload; }
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* CitizenPlane SFTP Import */}
          <Card className="border-blue-100 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 text-white rounded-lg p-2">
                    <Plane className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Nesti Agjensi
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">SFTP Import</Badge>
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Import automatik i rezervimeve çdo 10 minuta
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Aktiv
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {cpResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Import i kryer me sukses
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white border border-green-100 rounded p-2 text-center">
                      <div className="text-2xl font-bold text-green-700">{cpResult.filesProcessed}</div>
                      <div className="text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                        <FileSpreadsheet className="h-3 w-3" /> Skedarë
                      </div>
                    </div>
                    <div className="bg-white border border-green-100 rounded p-2 text-center">
                      <div className="text-2xl font-bold text-blue-700">{cpResult.bookingsCreated}</div>
                      <div className="text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                        <Download className="h-3 w-3" /> Rezervime
                      </div>
                    </div>
                  </div>
                  {cpResult.errors.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded p-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {cpResult.errors.length} gabime gjatë importit
                      </div>
                      {cpResult.errors.slice(0, 5).map((e, i) => (
                        <div key={i} className="text-[11px] text-orange-600 font-mono pl-5">{e}</div>
                      ))}
                      {cpResult.errors.length > 5 && (
                        <div className="text-[11px] text-orange-500 pl-5">...dhe {cpResult.errors.length - 5} gabime të tjera</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {cpError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm flex items-start gap-2 text-red-700">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Import dështoi</div>
                    <div className="text-xs mt-0.5 font-mono">{cpError}</div>
                  </div>
                </div>
              )}

              <Button
                onClick={runCitizenPlaneImport}
                disabled={cpImporting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {cpImporting
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Duke importuar...</>
                  : <><Download className="h-4 w-4 mr-2" /> Importo Tani (Manual)</>
                }
              </Button>
            </CardContent>
          </Card>

          {/* CitizenPlane SFTP Export */}
          <Card className="border-emerald-100 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-600 text-white rounded-lg p-2">
                    <Plane className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Export Automatik
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">SFTP</Badge>
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {cpExportLogs.length > 0 ? (
                        <span className="text-emerald-700 font-medium">
                          Eksporti i fundit: {formatExportDate(cpExportLogs[0].exportedAt)} · {cpExportLogs[0].flightsExported} fluturime
                        </span>
                      ) : (
                        "Export automatik i fluturimeve çdo 30 minuta"
                      )}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    Aktiv
                  </div>
                  {nextCronCountdown && (
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 font-mono">
                      <Clock className="h-3 w-3" />
                      {nextCronCountdown}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {cpExportResult && (
                <div className={`border rounded-lg p-3 text-sm space-y-2 ${cpExportResult.ok ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
                  <div className={`flex items-center gap-2 font-semibold ${cpExportResult.ok ? "text-emerald-800" : "text-orange-800"}`}>
                    {cpExportResult.ok
                      ? <><CheckCircle2 className="h-4 w-4" /> Export i kryer me sukses</>
                      : <><AlertTriangle className="h-4 w-4" /> Export u krye me gabime</>
                    }
                  </div>
                  <div className="bg-white border border-emerald-100 rounded p-2 text-center w-32">
                    <div className="text-2xl font-bold text-emerald-700">{cpExportResult.flightsExported}</div>
                    <div className="text-muted-foreground text-xs mt-0.5 flex items-center justify-center gap-1">
                      <Plane className="h-3 w-3" /> Fluturime
                    </div>
                  </div>
                  {cpExportResult.errors.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded p-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {cpExportResult.errors.length} gabime
                      </div>
                      {cpExportResult.errors.slice(0, 5).map((e, i) => (
                        <div key={i} className="text-[11px] text-orange-600 font-mono pl-5">{e}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {cpExportError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm flex items-start gap-2 text-red-700">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Export dështoi</div>
                    <div className="text-xs mt-0.5 font-mono">{cpExportError}</div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={runCitizenPlaneExport}
                  disabled={cpExporting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {cpExporting
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Duke eksportuar...</>
                    : <><ExternalLink className="h-4 w-4 mr-2" /> Eksporto Tani (Manual)</>
                  }
                </Button>
                <Button
                  variant="outline"
                  onClick={downloadCsvPreview}
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Shiko CSV
                </Button>
              </div>
              <p className="text-[11px] text-gray-400 text-center">
                Ikona CSV shkarkon skedarin pa e ngarkuar online
              </p>

              {/* Export History */}
              <div className="border-t border-emerald-100 pt-3">
                <button
                  onClick={() => setShowExportHistory(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-900 font-medium w-full"
                >
                  <History className="h-3.5 w-3.5" />
                  Historiku i eksporteve {cpExportLogs.length > 0 && `(${cpExportLogs.length})`}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); fetchExportLogs(); }}
                    className="ml-2 p-0.5 rounded hover:bg-emerald-100 text-emerald-500 inline-flex"
                    title="Rifresko"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </span>
                  {showExportHistory
                    ? <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                    : <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                  }
                </button>
                {showExportHistory && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      onClick={() => setOnlyFailedExports(false)}
                      className={`h-6 px-2 rounded-md text-[11px] font-semibold ring-1 transition-colors ${
                        !onlyFailedExports ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-emerald-700 ring-emerald-200 hover:bg-emerald-50"
                      }`}
                    >
                      Të gjitha
                    </button>
                    <button
                      onClick={() => setOnlyFailedExports(true)}
                      className={`h-6 px-2 rounded-md text-[11px] font-semibold ring-1 transition-colors inline-flex items-center gap-1 ${
                        onlyFailedExports ? "bg-red-600 text-white ring-red-600" : "bg-white text-red-700 ring-red-200 hover:bg-red-50"
                      }`}
                    >
                      <XCircle className="h-3 w-3" /> Vetëm gabimet
                      {cpExportLogs.filter(l => l.status !== "success").length > 0 && (
                        <span className="font-bold">({cpExportLogs.filter(l => l.status !== "success").length})</span>
                      )}
                    </button>
                  </div>
                )}
                {showExportHistory && (() => {
                  const shownLogs = onlyFailedExports ? cpExportLogs.filter(l => l.status !== "success") : cpExportLogs;
                  return (
                  <div className="mt-2 rounded-lg border border-emerald-100 overflow-hidden">
                    {shownLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
                        <History className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-medium">{onlyFailedExports ? "Asnjë gabim eksporti" : "Asnjë eksport i regjistruar akoma"}</p>
                        <p className="text-[11px] text-gray-400">{onlyFailedExports ? "Të gjitha eksportet e regjistruara kanë qenë me sukses" : "Eksporti automatik bëhet çdo 30 minuta"}</p>
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-emerald-50 text-emerald-700 border-b border-emerald-100">
                            <th className="text-left px-3 py-2 font-semibold">Data &amp; Ora</th>
                            <th className="text-center px-3 py-2 font-semibold">Burimi</th>
                            <th className="text-center px-3 py-2 font-semibold">Fluturime</th>
                            <th className="text-center px-3 py-2 font-semibold">Statusi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-50">
                          {shownLogs.map(log => {
                            const isErrorExpanded = expandedExportLog === log.id;
                            const isError = log.status !== "success";
                            return (
                              <React.Fragment key={log.id}>
                                <tr
                                  className={`transition-colors ${isError ? "cursor-pointer hover:bg-red-50/50 bg-red-50/20" : "hover:bg-emerald-50/50"}`}
                                  onClick={() => {
                                    if (isError) setExpandedExportLog(isErrorExpanded ? null : log.id);
                                  }}
                                >
                                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap font-mono text-[11px]">
                                    {formatExportDate(log.exportedAt)}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {log.source === "cron" ? (
                                      <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 font-mono text-[10px]">
                                        <Clock className="h-2.5 w-2.5" /> automatik
                                      </span>
                                    ) : log.source === "auto" ? (
                                      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-mono text-[10px]" title="Eksport i nisur menjëherë nga ndryshimi i statusit të një fluturimi">
                                        <Zap className="h-2.5 w-2.5" /> ndryshim statusi
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-gray-600 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-[10px]">
                                        manual
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center font-bold text-gray-800">
                                    {log.flightsExported}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {log.status === "success" ? (
                                      <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 text-[11px] font-semibold">
                                        <CheckCircle2 className="h-3 w-3" /> Sukses
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 text-[11px] font-semibold">
                                        <XCircle className="h-3 w-3" /> Gabim
                                        {isErrorExpanded
                                          ? <ChevronDown className="h-3 w-3 ml-0.5" />
                                          : <ChevronRight className="h-3 w-3 ml-0.5" />
                                        }
                                      </span>
                                    )}
                                  </td>
                                </tr>
                                {isError && isErrorExpanded && (
                                  <tr className="bg-red-50">
                                    <td colSpan={4} className="px-3 pb-3 pt-1">
                                      <div className="text-[10px] text-red-600 font-semibold mb-1.5 flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" /> Detajet e gabimit:
                                      </div>
                                      <div className="relative group rounded-md bg-gray-950 text-gray-100 text-[11px] font-mono p-3 overflow-x-auto">
                                        <button
                                          onClick={e => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(offlineText(log.errors ?? ""));
                                            toast({ title: "U kopjua!" });
                                          }}
                                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-gray-700 hover:bg-gray-600"
                                        >
                                          <Copy className="h-3 w-3" />
                                        </button>
                                        <pre className="whitespace-pre-wrap break-all">{offlineText(log.errors ?? "Gabim i panjohur")}</pre>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
