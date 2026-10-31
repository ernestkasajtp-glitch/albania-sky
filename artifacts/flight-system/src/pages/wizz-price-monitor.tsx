import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Play, Plus, Trash2, Pencil, ChevronDown, ChevronUp, Loader2, Activity, ArrowDownRight, TrendingDown, Clock, History, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildWizzMonitorRoutes, parseWizzAirports } from "@/lib/wizzMonitorRoutes";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface RunProgress {
  running: boolean;
  total: number;
  completed: number;
  startedAt: string;
}
interface HistoryRecord { checkedAt: string; price: number; }
interface Result {
  departureDate: string;
  flightNumber: string;
  airline: string;
  departureTime: string;
  arrivalTime: string;
  currentPrice: number | null;
  previousPrice: number | null;
  lowestPrice: number | null;
  dropAmount: number | null;
  dropPercent: number | null;
  lastCheckedAt: string | null;
  history: HistoryRecord[];
}
interface Monitor {
  id: string;
  name?: string;
  fromAirport: string;
  toAirport: string;
  startDate: string;
  endDate: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastCompletedAt?: string;
  lastError?: string;
  results: Result[];
}
interface ApiResponse {
  monitoringEnabled: boolean;
  monitors: Monitor[];
  running: Record<string, RunProgress>;
  runAllRunning: boolean;
  defaultRule: {
    startDate: string;
    endDate: string;
    intervalHours?: number;
  } | null;
}

function MonitorItem({ monitor, runningInfo, monitoringEnabled, onToggle, onRun, onEdit, onDelete }: any) {
  const [expanded, setExpanded] = useState(false);
  const [historyResult, setHistoryResult] = useState<any>(null);

  // sort results by departureDate
  const sortedResults = [...(monitor.results || [])].sort((a: any, b: any) => a.departureDate.localeCompare(b.departureDate));

  return (
    <Card className={cn("mb-4 overflow-hidden border-l-4 shadow-sm", monitor.enabled ? "border-l-emerald-500" : "border-l-gray-300 dark:border-l-gray-700")}>
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white dark:bg-gray-900 border-b gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant={monitor.enabled ? "default" : "outline"}
            className={cn("h-8 px-3 rounded-full text-xs font-semibold shadow-none border-0", monitor.enabled ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400")}
            onClick={() => onToggle(monitor.id, !monitor.enabled)}
          >
            <Activity className="w-3 h-3 mr-1.5" />
            {monitor.enabled ? "Aktiv" : "Ndalur"}
          </Button>
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              {monitor.fromAirport} <ArrowDownRight className="w-4 h-4 text-gray-400" /> {monitor.toAirport}
              {monitor.name && <span className="text-sm font-normal text-muted-foreground ml-2">({monitor.name})</span>}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Datat: {monitor.startDate} — {monitor.endDate}
              {monitor.lastRunAt && <span className="ml-3 text-gray-400">| Kontrolli i fundit: {new Date(monitor.lastRunAt).toLocaleString("sq-AL")}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {runningInfo?.running ? (
            <div className="flex items-center gap-2 text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md dark:bg-blue-900/20 dark:text-blue-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Kërkim {runningInfo.completed}/{runningInfo.total}
            </div>
          ) : (
            <Button disabled={!monitoringEnabled} variant="outline" size="sm" onClick={() => onRun(monitor.id)} className="h-8 text-xs font-medium">
              <Play className="w-3.5 h-3.5 mr-1.5" /> Kontrollo
            </Button>
          )}
          <Button variant="ghost" size="icon" title="Modifiko monitorimin" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => onEdit(monitor)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => {
            if (window.confirm("Jeni i sigurt që doni ta fshini këtë monitorim?")) {
              onDelete(monitor.id);
            }
          }}>
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {monitor.lastError && (
         <div className="px-4 py-2 bg-red-50 text-red-600 text-xs border-b border-red-100 flex items-center gap-2 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-400">
           <AlertCircle className="w-3.5 h-3.5" />
           Gabim në kërkimin e fundit: {monitor.lastError}
         </div>
      )}

      {expanded && (
        <div className="bg-gray-50/30 dark:bg-black/10 overflow-x-auto">
          <Table className="text-sm [&_th]:h-9 [&_th]:py-1.5 [&_td]:py-2">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[120px] whitespace-nowrap font-medium text-gray-500">Data</TableHead>
                <TableHead className="font-medium text-gray-500">Fluturimi</TableHead>
                <TableHead className="font-medium text-gray-500">Orari</TableHead>
                <TableHead className="text-right font-medium text-gray-500">Aktual</TableHead>
                <TableHead className="text-right font-medium text-gray-500">Mëparshëm</TableHead>
                <TableHead className="text-right font-medium text-gray-500">Më i ulëti</TableHead>
                <TableHead className="text-right font-medium text-gray-500">Rënia</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedResults.map((r, i) => {
                const isDrop = r.dropAmount > 0;
                return (
                  <TableRow key={i} className={cn("transition-colors tabular-nums", isDrop ? "bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20" : "")}>
                    <TableCell className="whitespace-nowrap font-medium tabular-nums">{r.departureDate}</TableCell>
                    <TableCell>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{r.flightNumber}</div>
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {r.departureTime} - {r.arrivalTime}
                    </TableCell>
                    <TableCell className={cn("text-right font-bold text-base", isDrop ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-gray-100")}>
                       {r.currentPrice != null ? `${r.currentPrice} €` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-gray-500 dark:text-gray-400">
                       {r.previousPrice != null ? `${r.previousPrice} €` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-blue-600 dark:text-blue-400 font-medium">
                       {r.lowestPrice != null ? `${r.lowestPrice} €` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {isDrop ? (
                        <div className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded font-bold text-xs">
                          <TrendingDown className="w-3 h-3" />
                           {r.dropAmount} € ({r.dropPercent ?? 0}%)
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-blue-600" title="Historiku" onClick={() => setHistoryResult(r)}>
                        <History className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sortedResults.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    {runningInfo?.running ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                        <span className="text-sm">Kërkimi në proces...</span>
                      </div>
                    ) : "Nuk ka asnjë datë të kontrolluar. Kliko 'Kontrollo' për të nisur."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* History Dialog */}
      <Dialog open={!!historyResult} onOpenChange={(o) => !o && setHistoryResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-500" />
              Historiku: {historyResult?.departureDate}
            </DialogTitle>
            <DialogDescription>
               Fluturimi {historyResult?.flightNumber} | Çmimi aktual: <strong className="text-gray-900 dark:text-white">{historyResult?.currentPrice != null ? `${historyResult.currentPrice} €` : "—"}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto mt-2">
            {historyResult?.history && historyResult.history.length > 0 ? (
              <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 dark:before:via-gray-700 before:to-transparent">
                {historyResult.history.map((h: any, i: number) => {
                  const d = new Date(h.checkedAt);
                  const isFirst = i === 0;
                  return (
                    <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-gray-950 bg-blue-100 dark:bg-blue-900 text-blue-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-lg border bg-white dark:bg-gray-900 shadow-sm flex justify-between items-center tabular-nums">
                        <div className="text-xs text-gray-500">
                          {d.toLocaleDateString("sq-AL", { day: "2-digit", month: "short" })} <br/>
                          {d.toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className={cn("font-bold", isFirst ? "text-base text-blue-600 dark:text-blue-400" : "text-sm text-gray-700 dark:text-gray-300")}>
                          {h.price} €
                        </div>
                      </div>
                    </div>
                  );
                }).reverse()}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500 text-sm">
                Nuk ka historik të ruajtur për këtë fluturim.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function WizzPriceMonitorPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", fromAirport: "", toAirport: "", startDate: "", endDate: "" });
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [editData, setEditData] = useState({ name: "", fromAirport: "", toAirport: "", startDate: "", endDate: "" });
  const [defaultRule, setDefaultRule] = useState({ startDate: "", endDate: "", intervalHours: "12" });

  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ["wizzPriceMonitors"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wizz-price-monitors`, { credentials: "include" });
      if (!res.ok) throw new Error("Gabim në ngarkimin e monitorimeve.");
      return res.json();
    },
    refetchInterval: (query) => {
      const running = query.state.data?.running;
      if (query.state.data?.runAllRunning || (running && Object.values(running).some(r => r.running))) return 2000;
      return 30000;
    }
  });

  useEffect(() => {
    if (data?.defaultRule) setDefaultRule({ ...data.defaultRule, intervalHours: String(data.defaultRule.intervalHours ?? 12) });
  }, [data?.defaultRule?.startDate, data?.defaultRule?.endDate, data?.defaultRule?.intervalHours]);

  const monitoringMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`${API_BASE}/wizz-price-monitors/monitoring`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Ndryshimi nuk u ruajt.");
      return result as { monitoringEnabled: boolean };
    },
    onSuccess: (result) => {
      queryClient.setQueryData<ApiResponse>(["wizzPriceMonitors"], old => old ? { ...old, ...result } : old);
      queryClient.invalidateQueries({ queryKey: ["wizzPriceMonitors"] });
      toast({ title: result.monitoringEnabled ? "Monitorimi Wizz u aktivizua" : "Monitorimi Wizz u çaktivizua" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setFormData({
      name: "",
      fromAirport: "",
      toAirport: "",
      startDate: data?.defaultRule?.startDate ?? "",
      endDate: data?.defaultRule?.endDate ?? "",
    });
    setAddOpen(true);
  };

  const saveDefaultMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/wizz-price-monitors/default`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...defaultRule, intervalHours: Number(defaultRule.intervalHours) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Gabim gjatë ruajtjes së rregullit.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rregulli default u ruajt" });
      queryClient.invalidateQueries({ queryKey: ["wizzPriceMonitors"] });
    },
    onError: (err: any) => toast({ title: "Gabim", description: err.message, variant: "destructive" }),
  });

  const createMut = useMutation({
    mutationFn: async ({ payloads }: { payloads: any[]; createAnother: boolean }) => {
      return Promise.all(payloads.map(async payload => {
        const res = await fetch(`${API_BASE}/wizz-price-monitors`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Gabim gjatë krijimit të ${payload.fromAirport} → ${payload.toAirport}.`);
        }
        return res.json();
      }));
    },
    onSuccess: (results, variables) => {
      const createdCount = results.filter(result => result.created !== false).length;
      const updatedCount = results.length - createdCount;
      toast({
        title: createdCount > 0
          ? createdCount === 1
            ? "1 monitorim u krijua me sukses"
            : `${createdCount} monitorime u krijuan me sukses`
          : "Periudha u përditësua me sukses",
        description: updatedCount > 0
          ? `${updatedCount} linjë ekzistuese u përditësua me periudhën e re.`
          : undefined,
      });
      if (variables.createAnother) {
        setFormData({
          name: "",
          fromAirport: "",
          toAirport: "",
          startDate: data?.defaultRule?.startDate ?? "",
          endDate: data?.defaultRule?.endDate ?? "",
        });
      } else {
        setAddOpen(false);
        setFormData({ name: "", fromAirport: "", toAirport: "", startDate: "", endDate: "" });
      }
      queryClient.invalidateQueries({ queryKey: ["wizzPriceMonitors"] });
    },
    onError: (err: any) => toast({ title: "Gabim", description: err.message, variant: "destructive" })
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string, enabled: boolean }) => {
      const res = await fetch(`${API_BASE}/wizz-price-monitors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled })
      });
      if (!res.ok) throw new Error("Gabim gjatë përditësimit.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wizzPriceMonitors"] }),
    onError: (err: any) => toast({ title: "Gabim", description: err.message, variant: "destructive" })
  });

  const editMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof editData }) => {
      const res = await fetch(`${API_BASE}/wizz-price-monitors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Gabim gjatë modifikimit.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Monitorimi u modifikua me sukses" });
      setEditingMonitor(null);
      queryClient.invalidateQueries({ queryKey: ["wizzPriceMonitors"] });
    },
    onError: (err: any) => toast({ title: "Gabim", description: err.message, variant: "destructive" }),
  });

  const runMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_BASE}/wizz-price-monitors/${id}/run`, {
        method: "POST",
        credentials: "include"
      });
      if (res.status === 409) throw new Error("Kërkimi është tashmë në proces.");
      if (!res.ok) throw new Error("Gabim gjatë nisjes së kërkimit.");
    },
    onSuccess: () => {
      toast({ title: "Kërkimi nisi", description: "Procesi po vazhdon në sfond." });
      queryClient.invalidateQueries({ queryKey: ["wizzPriceMonitors"] });
    },
    onError: (err: any) => toast({ title: "Gabim", description: err.message, variant: "destructive" })
  });

  const runAllMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/wizz-price-monitors/run-all`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Gabim gjatë nisjes së kontrollit.");
    },
    onSuccess: () => {
      toast({ title: "Kontrolli i listës nisi", description: "Monitorimet aktive do të kontrollohen një nga një, me radhë." });
      queryClient.invalidateQueries({ queryKey: ["wizzPriceMonitors"] });
    },
    onError: (err: any) => toast({ title: "Gabim", description: err.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_BASE}/wizz-price-monitors/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Gabim gjatë fshirjes.");
    },
    onSuccess: () => {
      toast({ title: "Monitorimi u fshi" });
      queryClient.invalidateQueries({ queryKey: ["wizzPriceMonitors"] });
    },
    onError: (err: any) => toast({ title: "Gabim", description: err.message, variant: "destructive" })
  });

  const handleCreate = (createAnother: boolean) => {
    if (!formData.fromAirport || !formData.toAirport || !formData.startDate || !formData.endDate) {
      toast({ title: "Plotëso fushat", description: "Të gjitha fushat përveç emrit janë të detyrueshme.", variant: "destructive" });
      return;
    }
    const fromAirports = parseWizzAirports(formData.fromAirport);
    const toAirports = parseWizzAirports(formData.toAirport);
    const invalidCodes = [...fromAirports, ...toAirports].filter(code => !/^[A-Z]{3}$/.test(code));
    if (fromAirports.length === 0 || toAirports.length === 0 || invalidCodes.length > 0) {
      toast({
        title: "Kod aeroporti i pavlefshëm",
        description: invalidCodes.length > 0
          ? `Kontrollo këto kode: ${invalidCodes.join(", ")}. Çdo kod duhet të ketë 3 shkronja.`
          : "Shkruaj të paktën një aeroport në secilën anë.",
        variant: "destructive",
      });
      return;
    }
    if (fromAirports.length > 1 && toAirports.length > 1) {
      toast({
        title: "Vetëm njëra anë mund të ketë disa aeroporte",
        description: "Përdor disa nisje me një mbërritje, ose një nisje me disa mbërritje.",
        variant: "destructive",
      });
      return;
    }
    const payloads = buildWizzMonitorRoutes(formData);
    createMut.mutate({ payloads, createAnother });
  };

  const openEdit = (monitor: Monitor) => {
    setEditingMonitor(monitor);
    setEditData({
      name: monitor.name ?? "",
      fromAirport: monitor.fromAirport,
      toAirport: monitor.toAirport,
      startDate: monitor.startDate,
      endDate: monitor.endDate,
    });
  };

  const handleEdit = () => {
    if (!editingMonitor) return;
    const fromAirport = editData.fromAirport.trim().toUpperCase();
    const toAirport = editData.toAirport.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(fromAirport) || !/^[A-Z]{3}$/.test(toAirport)) {
      toast({ title: "Kod aeroporti i pavlefshëm", description: "Nisja dhe mbërritja duhet të kenë nga 3 shkronja.", variant: "destructive" });
      return;
    }
    if (!editData.startDate || !editData.endDate || editData.endDate < editData.startDate) {
      toast({ title: "Periudhë e pavlefshme", description: "Data e mbarimit duhet të jetë pas datës së fillimit.", variant: "destructive" });
      return;
    }
    editMut.mutate({
      id: editingMonitor.id,
      payload: { ...editData, fromAirport, toAirport },
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-slate-900 text-slate-100 p-6 sm:p-8 rounded-xl shadow-lg mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-10 pointer-events-none">
          <Activity className="w-48 h-48" />
        </div>
        <div className="relative z-10">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <div className="bg-emerald-500/20 p-2 rounded-lg">
              <Activity className="text-emerald-400 h-6 w-6" />
            </div>
            Monitorimi Wizz
          </h1>
          <p className="text-slate-400 text-sm mt-2 max-w-xl">
            Sistemi i gjurmimit operativ. Kërkon automatikisht çmimet sipas intervaleve të caktuara dhe thekson rëniet e tarifave që ju të reagoni menjëherë.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 relative z-10">
          <Button
            onClick={() => monitoringMut.mutate(!data?.monitoringEnabled)}
            disabled={!data || monitoringMut.isPending}
            variant={data?.monitoringEnabled ? "destructive" : "default"}
            aria-label={data?.monitoringEnabled ? "Çaktivizo Monitorimin Wizz" : "Aktivizo Monitorimin Wizz"}
          >
            {monitoringMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {data?.monitoringEnabled ? "Çaktivizo" : "Aktivizo"}
          </Button>
          <Button
            onClick={() => runAllMut.mutate()}
            disabled={!data?.monitoringEnabled || monitoringMut.isPending || runAllMut.isPending || data?.runAllRunning || !data?.monitors.some(monitor => monitor.enabled)}
            variant="outline"
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white shrink-0"
          >
            {data?.runAllRunning || runAllMut.isPending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Play className="w-4 h-4 mr-2" />}
            {data?.runAllRunning ? "Kontrolli në proces" : "Fillo Kontrollin"}
          </Button>
          <Button onClick={openCreate} className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-md shrink-0">
            <Plus className="w-4 h-4 mr-2" /> Krijo Monitorim
          </Button>
        </div>
      </div>

      {data?.monitoringEnabled === false && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Monitorimi Wizz është çaktivizuar. Kontrollet automatike dhe manuale janë ndaluar.
          Rezultatet ruhen. Një kërkesë e dërguar tashmë mund të përfundojë, por nuk niset tjetra.
        </div>
      )}
      <Card className="border-emerald-200 bg-emerald-50/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rregulli Default</CardTitle>
          <CardDescription>
            Datat plotësohen automatikisht për monitorimet e reja. Intervali zbatohet për të gjitha monitorimet aktive.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="wizz-interval">Kontrollo çdo (orë)</Label>
            <Input
              id="wizz-interval"
              type="number"
              min={1}
              max={168}
              step={1}
              value={defaultRule.intervalHours}
              onChange={e => setDefaultRule({ ...defaultRule, intervalHours: e.target.value })}
              className="bg-white"
            />
            <p className="text-xs text-muted-foreground">Për të gjitha monitorimet aktive. Kontrollohen me radhë; nisja verifikohet çdo 30 minuta.</p>
          </div>
          <div className="space-y-1">
            <Label>Nga Data</Label>
            <Input
              type="date"
              value={defaultRule.startDate}
              onChange={e => setDefaultRule({ ...defaultRule, startDate: e.target.value })}
              className="bg-white"
            />
          </div>
          <div className="space-y-1">
            <Label>Deri më Datë</Label>
            <Input
              type="date"
              min={defaultRule.startDate}
              value={defaultRule.endDate}
              onChange={e => setDefaultRule({ ...defaultRule, endDate: e.target.value })}
              className="bg-white"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={() => saveDefaultMut.mutate()}
              disabled={saveDefaultMut.isPending || !Number.isInteger(Number(defaultRule.intervalHours)) || Number(defaultRule.intervalHours) < 1 || Number(defaultRule.intervalHours) > 168}
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saveDefaultMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ruaj Default
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="p-6 text-center text-red-500 bg-red-50 rounded-lg">
          {(error as Error).message}
        </div>
      ) : data?.monitors.length === 0 ? (
        <div className="text-center p-12 bg-gray-50 dark:bg-gray-900/50 border border-dashed rounded-xl">
          <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Nuk keni asnjë monitorim aktiv</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            Shtoni një rrugë dhe interval datash për të filluar gjurmimin e çmimeve të Wizz Air.
          </p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Shto të parin
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.monitors.map(monitor => (
            <MonitorItem
              key={monitor.id}
              monitor={monitor}
              runningInfo={data.running?.[monitor.id]}
              monitoringEnabled={data.monitoringEnabled && !monitoringMut.isPending}
              onToggle={(id: string, enabled: boolean) => toggleMut.mutate({ id, enabled })}
              onRun={(id: string) => runMut.mutate(id)}
              onEdit={openEdit}
              onDelete={(id: string) => delMut.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Monitorim i ri</DialogTitle>
            <DialogDescription>
              Zgjidhni aeroportet dhe periudhën e nisjes. Sistemi do të skanojë të gjitha datat brenda këtij intervali.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleCreate(false); }} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Emri (Opsionale)</Label>
              <Input
                placeholder="P.sh. Milano Nëntor"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Nisja (një ose disa aeroporte)</Label>
                <Input
                  placeholder="CGN, DTM, HHN"
                  value={formData.fromAirport}
                  onChange={e => setFormData({ ...formData, fromAirport: e.target.value.toUpperCase() })}
                  required
                />
                <p className="text-xs text-muted-foreground">Ndaji kodet me presje. Krijohet një monitorim për secilin aeroport.</p>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Mbërritja (një ose disa aeroporte)</Label>
                <Input
                  placeholder="MXP, BGY, LIN"
                  value={formData.toAirport}
                  onChange={e => setFormData({ ...formData, toAirport: e.target.value.toUpperCase() })}
                  required
                />
                <p className="text-xs text-muted-foreground">Vetëm Nisja ose Mbërritja mund të ketë disa kode, jo të dyja.</p>
              </div>
              <div className="space-y-1">
                <Label>Nga Data</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={e => {
                     setFormData({ ...formData, startDate: e.target.value, endDate: e.target.value });
                  }}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Deri më Datë</Label>
                <Input
                  type="date"
                  min={formData.startDate}
                  value={formData.endDate}
                  onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                  required
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Anulo</Button>
              <Button
                type="button"
                variant="outline"
                disabled={createMut.isPending}
                onClick={() => handleCreate(true)}
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                Ruaj dhe Krijo Tjetër
              </Button>
              <Button type="submit" disabled={createMut.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {createMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Ruaj Monitorimin
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editingMonitor != null} onOpenChange={open => { if (!open) setEditingMonitor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifiko monitorimin</DialogTitle>
            <DialogDescription>
              Ndrysho linjën ose periudhën e kërkimit. Kur ndryshojnë këto fusha, rezultatet e vjetra pastrohen.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleEdit(); }} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Emri (Opsionale)</Label>
              <Input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Nisja</Label>
                <Input maxLength={3} value={editData.fromAirport} onChange={e => setEditData({ ...editData, fromAirport: e.target.value.toUpperCase() })} required />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Mbërritja</Label>
                <Input maxLength={3} value={editData.toAirport} onChange={e => setEditData({ ...editData, toAirport: e.target.value.toUpperCase() })} required />
              </div>
              <div className="space-y-1">
                <Label>Nga Data</Label>
                <Input type="date" value={editData.startDate} onChange={e => setEditData({ ...editData, startDate: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Deri më Datë</Label>
                <Input type="date" min={editData.startDate} value={editData.endDate} onChange={e => setEditData({ ...editData, endDate: e.target.value })} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingMonitor(null)}>Anulo</Button>
              <Button type="submit" disabled={editMut.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {editMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Ruaj Ndryshimet
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
