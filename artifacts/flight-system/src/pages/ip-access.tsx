import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  ShieldAlert,
  Loader2,
  Search,
  Shield,
  ShieldBan,
  Activity,
  History,
  Lock,
  Unlock,
  AlertTriangle,
  ArrowLeft,
  Pencil
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PaginationControls, type PageLimit } from "@/components/ip-access/pagination-controls";
import { IpIdentityDialog, browserDescription, type KnownDevice } from "@/components/ip-access/ip-identity-dialog";
import { confirmDangerDialog } from "@/lib/confirm";
import { format, formatDistanceToNow } from "date-fns";
import { sq } from "date-fns/locale";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface IpRecord {
  ip: string;
  label: string | null;
  devices: KnownDevice[];
  loginCount: number;
  verifiedCount: number;
  lastVerifiedUser: string | null;
  lastLoginAt: string | null;
  activeSessions: number;
  isBlocked: boolean;
  blockedAt: string | null;
}

interface AttemptRecord {
  id: number;
  ip: string;
  ipLabel: string | null;
  deviceId: string | null;
  deviceLabel: string | null;
  deviceUserAgent: string | null;
  result: string;
  verifiedUser: string | null;
  createdAt: string;
  isBlocked: boolean;
}

export default function IpAccessPage() {
  const { toast } = useToast();
  
  // IP Data
  const [ips, setIps] = useState<IpRecord[]>([]);
  const [ipsTotal, setIpsTotal] = useState(0);
  const [ipsPage, setIpsPage] = useState(1);
  const [ipsLimit, setIpsLimit] = useState<PageLimit>(10);
  const [ipsSearch, setIpsSearch] = useState("");
  const [currentIp, setCurrentIp] = useState("");
  const [ipsLoading, setIpsLoading] = useState(true);
  const [selectedIps, setSelectedIps] = useState<Map<string, boolean>>(new Map());
  const [pendingIps, setPendingIps] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [batchFailures, setBatchFailures] = useState<string[]>([]);
  const [activeIdentityIp, setActiveIdentityIp] = useState<string | null>(null);

  // Attempts Data
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [attemptsTotal, setAttemptsTotal] = useState(0);
  const [attemptsPage, setAttemptsPage] = useState(1);
  const [attemptsLimit, setAttemptsLimit] = useState<PageLimit>(10);
  const [attemptsSearch, setAttemptsSearch] = useState("");
  const [attemptsFilter, setAttemptsFilter] = useState("all");
  const [attemptsLoading, setAttemptsLoading] = useState(true);

  const loadIps = async () => {
    setIpsLoading(true);
    try {
      const resp = await fetch(
        `${API_BASE}/settings/ip-access/ips?page=${ipsPage}&limit=${ipsLimit}&search=${encodeURIComponent(ipsSearch)}`,
        { credentials: "include" }
      );
      if (!resp.ok) throw new Error("Failed to load IPs");
      const data = await resp.json();
      setIps(data.items || []);
      setIpsTotal(data.total || 0);
      setCurrentIp(data.currentIp || "");
    } catch (err) {
      toast({ title: "Gabim", description: "Nuk u ngarkuan IP-të", variant: "destructive" });
    } finally {
      setIpsLoading(false);
    }
  };

  const loadAttempts = async () => {
    setAttemptsLoading(true);
    try {
      const resp = await fetch(
        `${API_BASE}/settings/ip-access/attempts?page=${attemptsPage}&limit=${attemptsLimit}&search=${encodeURIComponent(
          attemptsSearch
        )}${attemptsFilter !== "all" ? `&result=${attemptsFilter}` : ""}`,
        { credentials: "include" }
      );
      if (!resp.ok) throw new Error("Failed to load attempts");
      const data = await resp.json();
      setAttempts(data.items || []);
      setAttemptsTotal(data.total || 0);
    } catch (err) {
      toast({ title: "Gabim", description: "Nuk u ngarkuan përpjekjet", variant: "destructive" });
    } finally {
      setAttemptsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadIps();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipsPage, ipsSearch, ipsLimit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAttempts();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptsPage, attemptsSearch, attemptsFilter, attemptsLimit]);

  const renameIp = async (ip: string, label: string): Promise<boolean> => {
    try {
      const resp = await fetch(`${API_BASE}/settings/ip-access/ips/label`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, label }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Emri nuk u ruajt");
      setIps(previous => previous.map(row => row.ip === ip ? { ...row, label: data.label } : row));
      setAttempts(previous => previous.map(row => row.ip === ip ? { ...row, ipLabel: data.label } : row));
      toast({ title: "Emri i IP-së u ruajt" });
      return true;
    } catch (error) {
      toast({ title: "Gabim", description: error instanceof Error ? error.message : "Emri nuk u ruajt", variant: "destructive" });
      return false;
    }
  };

  const renameDevice = async (deviceId: string, label: string): Promise<boolean> => {
    try {
      const resp = await fetch(`${API_BASE}/settings/ip-access/devices/label`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, label }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Emri nuk u ruajt");
      setIps(previous => previous.map(row => ({
        ...row, devices: row.devices.map(device =>
          device.deviceId === deviceId ? { ...device, label: data.label } : device),
      })));
      setAttempts(previous => previous.map(row =>
        row.deviceId === deviceId ? { ...row, deviceLabel: data.label } : row));
      toast({ title: "Emri i shfletuesit u ruajt" });
      return true;
    } catch (error) {
      toast({ title: "Gabim", description: error instanceof Error ? error.message : "Emri nuk u ruajt", variant: "destructive" });
      return false;
    }
  };

  const applyBlockedChanges = (changedIps: string[], blocked: boolean) => {
    if (changedIps.length === 0) return;
    const changed = new Set(changedIps);
    const now = new Date().toISOString();
    setIps(previous => previous.map(row => changed.has(row.ip)
      ? { ...row, isBlocked: blocked, blockedAt: blocked ? now : null, activeSessions: blocked ? 0 : row.activeSessions }
      : row));
    // The outcome of an old attempt never changes; only its current IP action does.
    setAttempts(previous => previous.map(row => changed.has(row.ip) ? { ...row, isBlocked: blocked } : row));
    setSelectedIps(previous => {
      const next = new Map(previous);
      for (const ip of changed) {
        if (next.has(ip)) next.set(ip, blocked);
      }
      return next;
    });
  };

  const toggleSelection = (ip: string, isBlocked: boolean, selected: boolean) => {
    setSelectedIps(previous => {
      const next = new Map(previous);
      if (selected) next.set(ip, isBlocked);
      else next.delete(ip);
      return next;
    });
  };

  const selectableVisible = ips;
  const selectedVisibleCount = selectableVisible.filter(row => selectedIps.has(row.ip)).length;
  const allVisibleSelected = selectableVisible.length > 0 && selectedVisibleCount === selectableVisible.length;
  const selectedToBlock = [...selectedIps].filter(([, blocked]) => !blocked).map(([ip]) => ip)
    .sort((a, b) => Number(a === currentIp) - Number(b === currentIp));
  const selectedToUnblock = [...selectedIps].filter(([, blocked]) => blocked).map(([ip]) => ip);

  const selectVisible = (select: boolean) => {
    setSelectedIps(previous => {
      const next = new Map(previous);
      for (const row of selectableVisible) {
        if (select) next.set(row.ip, row.isBlocked);
        else next.delete(row.ip);
      }
      return next;
    });
  };

  const toggleBlock = async (ip: string, currentIsBlocked: boolean) => {
    if (bulkPending || pendingIps.has(ip)) return;
    setPendingIps(previous => new Set(previous).add(ip));
    try {
      if (!currentIsBlocked) {
        const ok = await confirmDangerDialog({
          title: ip === currentIp ? "Blloko IP-në tënde aktuale?" : "Blloko IP",
          text: `${ip === currentIp ? "Kjo është IP-ja jote aktuale. Bllokimi mund të të nxjerrë nga sistemi; hyrja tjetër do të kërkojë verifikimin për IP të bllokuar ose zhbllokimin nga një administrator në një rrjet tjetër. " : ""}Jeni të sigurt që doni të bllokoni IP-në ${ip}? Kujdes: IP-të publike shpesh ndahen mes shumë përdoruesve në të njëjtin rrjet ose zyrë. Bllokimi mund të pengojë përdorues të tjerë legjitimë.`,
          confirmText: "Blloko IP",
        });
        if (!ok) return;
      }
      const resp = await fetch(`${API_BASE}/settings/ip-access/block`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, blocked: !currentIsBlocked, confirmCurrentIp: !currentIsBlocked && ip === currentIp }),
        credentials: "include",
      });
      if (!resp.ok) {
        const error = await resp.json().catch(() => null);
        throw new Error(error?.error || "Veprimi dështoi");
      }
      applyBlockedChanges([ip], !currentIsBlocked);
      toast({
        title: "Sukses",
        description: `IP ${ip} u ${currentIsBlocked ? "zhbllokua" : "bllokua"} me sukses.`,
      });
    } catch (err) {
      toast({ title: "Gabim", description: err instanceof Error ? err.message : "Veprimi dështoi", variant: "destructive" });
    } finally {
      setPendingIps(previous => {
        const next = new Set(previous);
        next.delete(ip);
        return next;
      });
    }
  };

  const runBulk = async (blocked: boolean) => {
    const targets = blocked ? selectedToBlock : selectedToUnblock;
    if (bulkPending || pendingIps.size > 0 || targets.length === 0) return;
    if (blocked) {
      const ok = await confirmDangerDialog({
        title: `Blloko ${targets.length} IP`,
        text: `${targets.includes(currentIp) ? "Lista përfshin IP-në tënde aktuale. Mund të dalësh nga sistemi dhe të nevojitet verifikimi për IP të bllokuar ose zhbllokimi nga një administrator në një rrjet tjetër. " : ""}Dëshiron të bllokosh ${targets.length} IP të zgjedhura? Një IP publike mund të përdoret nga disa persona; sesionet e tyre të sistemit të brendshëm do të ndërpriten.`,
        confirmText: "Blloko të zgjedhurat",
      });
      if (!ok) return;
    }
    setBulkPending(true);
    setBatchFailures([]);
    const succeeded: string[] = [];
    const failed: string[] = [];
    try {
      for (let offset = 0; offset < targets.length; offset += 100) {
        const chunk = targets.slice(offset, offset + 100);
        try {
          const resp = await fetch(`${API_BASE}/settings/ip-access/blocks`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ips: chunk, blocked, confirmCurrentIp: blocked && targets.includes(currentIp) }),
          });
          if (!resp.ok) throw new Error("Kërkesa nuk u pranua nga serveri.");
          const data: { succeeded: string[]; failed: { ip: string; error: string }[] } = await resp.json();
          if (!Array.isArray(data.succeeded) || !Array.isArray(data.failed)) throw new Error("Përgjigje e pavlefshme nga serveri.");
          const confirmed = data.succeeded.filter(ip => chunk.includes(ip));
          succeeded.push(...confirmed);
          failed.push(...chunk.filter(ip => !confirmed.includes(ip)));
          applyBlockedChanges(confirmed, blocked);
        } catch {
          // Without confirmation, leave these rows unchanged and selected for retry.
          failed.push(...chunk);
        }
      }
      setSelectedIps(previous => {
        const next = new Map(previous);
        for (const ip of succeeded) next.delete(ip);
        return next;
      });
      setBatchFailures(failed);
      if (succeeded.length) {
        toast({ title: `${succeeded.length} IP u ${blocked ? "bllokuan" : "zhbllokuan"}` });
      }
      if (failed.length) {
        toast({
          title: `${failed.length} IP nuk u konfirmuan`,
          description: `Mbetën të përzgjedhura për riprovë: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}`,
          variant: "destructive",
        });
      }
    } finally {
      setBulkPending(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      return format(date, "dd MMM yyyy HH:mm", { locale: sq });
    } catch {
      return "-";
    }
  };

  const formatRelative = (dateStr: string | null) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return formatDistanceToNow(date, { addSuffix: true, locale: sq });
    } catch {
      return "";
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Link href="/settings">
          <Button variant="outline" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Siguria dhe Aksesi i IP-ve
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Monitoroni hyrjet dhe mbroni sistemin nga IP të padëshiruara.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* IPs Table */}
        <Card className="flex flex-col h-full shadow-sm">
          <CardHeader className="pb-3 border-b bg-gray-50/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  IP-të e Njohura
                </CardTitle>
                <CardDescription>Përdoruesit që janë kyçur me sukses</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Kërko IP ose emër..."
                  className="pl-9 h-9 text-sm"
                  value={ipsSearch}
                  onChange={(e) => {
                    setIpsSearch(e.target.value);
                    setIpsPage(1);
                  }}
                />
              </div>
            </div>
          </CardHeader>
          {selectedIps.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-blue-50/60 px-4 py-2 text-xs">
              <span className="font-medium text-blue-900 mr-auto">{selectedIps.size} IP të zgjedhura</span>
              <Button size="sm" variant="outline" className="h-8 text-red-700 border-red-200" disabled={bulkPending || pendingIps.size > 0 || selectedToBlock.length === 0} onClick={() => runBulk(true)}>
                {bulkPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Lock className="h-3.5 w-3.5 mr-1" />}
                Blloko ({selectedToBlock.length})
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-green-700 border-green-200" disabled={bulkPending || pendingIps.size > 0 || selectedToUnblock.length === 0} onClick={() => runBulk(false)}>
                <Unlock className="h-3.5 w-3.5 mr-1" /> Zhblloko ({selectedToUnblock.length})
              </Button>
              <Button size="sm" variant="ghost" className="h-8" disabled={bulkPending} onClick={() => setSelectedIps(new Map())}>Hiq përzgjedhjen</Button>
            </div>
          )}
          {batchFailures.length > 0 && (
            <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              <p className="font-semibold">Gjendja e {batchFailures.length} IP-ve nuk u konfirmua. Mbetën të përzgjedhura për riprovë:</p>
              <p className="mt-1 break-words">{batchFailures.join(", ")}</p>
            </div>
          )}
          <CardContent className="p-0 flex-1 flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50/50">
                  <tr>
                    <th className="pl-4 pr-0 py-3 w-9">
                      <Checkbox
                        aria-label="Zgjidh ose hiq të gjitha IP-të në këtë faqe"
                        checked={allVisibleSelected ? true : selectedVisibleCount > 0 ? "indeterminate" : false}
                        onCheckedChange={checked => selectVisible(checked === true)}
                        disabled={ipsLoading || bulkPending || selectableVisible.length === 0}
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">IP Adresa</th>
                    <th className="px-4 py-3 font-medium">Aktivitet</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Kyçje</th>
                    <th className="px-4 py-3 font-medium text-right">Veprime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ipsLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                        Po ngarkohet...
                      </td>
                    </tr>
                  ) : ips.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        Nuk u gjetën IP.
                      </td>
                    </tr>
                  ) : (
                    ips.map((row) => (
                      <tr key={row.ip} className="hover:bg-gray-50/50 transition-colors">
                        <td className="pl-4 pr-0 py-3">
                          <Checkbox
                            aria-label={`Zgjidh IP ${row.ip}`}
                            checked={selectedIps.has(row.ip)}
                            onCheckedChange={checked => toggleSelection(row.ip, row.isBlocked, checked === true)}
                            disabled={bulkPending || pendingIps.has(row.ip)}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            {row.ip}
                            {row.ip === currentIp && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 shrink-0">
                                Ti
                              </Badge>
                            )}
                            {row.isBlocked && (
                              <Badge variant="destructive" className="shrink-0 text-[10px] px-1.5 py-0">Bllokuar</Badge>
                            )}
                            {row.verifiedCount > 0 && (
                              <Badge variant="outline" title={row.lastVerifiedUser ? `Hyrja e fundit: ${row.lastVerifiedUser}` : undefined}
                                className="shrink-0 bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
                                Me verifikim ({row.verifiedCount})
                              </Badge>
                            )}
                          </div>
                          {row.label && <p className="mt-0.5 text-xs font-normal text-blue-700">{row.label}</p>}
                          <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-blue-700 hover:underline" onClick={() => setActiveIdentityIp(row.ip)}>
                            <Pencil className="h-3 w-3" />
                            Emërto IP · Shfletues ({row.devices?.length ?? 0})
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          {row.activeSessions > 0 ? (
                            <div className="flex items-center gap-1.5 text-green-600 font-medium text-xs">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                              </span>
                              Aktiv ({row.activeSessions})
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500" title={formatDate(row.lastLoginAt)}>
                              {formatRelative(row.lastLoginAt)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-gray-600">
                          {row.loginCount} herë
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant={row.isBlocked ? "outline" : "ghost"}
                            size="sm"
                            className={row.isBlocked ? "text-green-600 border-green-200 hover:bg-green-50" : "text-red-600 hover:text-red-700 hover:bg-red-50"}
                            onClick={() => toggleBlock(row.ip, row.isBlocked)}
                            disabled={bulkPending || pendingIps.has(row.ip)}
                            title={row.ip === currentIp && !row.isBlocked ? "Bllokimi mund të ndërpresë aksesin tënd" : ""}
                          >
                            {pendingIps.has(row.ip) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : row.isBlocked ? (
                              <><Unlock className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Zhblloko</span></>
                            ) : (
                              <><Lock className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Blloko</span></>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-auto">
              <PaginationControls
                page={ipsPage} total={ipsTotal} limit={ipsLimit} onChange={setIpsPage}
                onLimitChange={limit => { setIpsLimit(limit); setIpsPage(1); }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Attempts Table */}
        <Card className="flex flex-col h-full shadow-sm">
          <CardHeader className="pb-3 border-b bg-gray-50/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-purple-500" />
                  Historiku i Përpjekjeve
                </CardTitle>
                <CardDescription>Log-u i plotë i tentativave</CardDescription>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Select value={attemptsFilter} onValueChange={(v) => { setAttemptsFilter(v); setAttemptsPage(1); }}>
                  <SelectTrigger className="w-[120px] h-9 text-sm">
                    <SelectValue placeholder="Filtro" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Të gjitha</SelectItem>
                    <SelectItem value="success">Sukses</SelectItem>
                    <SelectItem value="failed">Dështim</SelectItem>
                    <SelectItem value="blocked">Bllokuar</SelectItem>
                     <SelectItem value="verified">Me verifikim</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1 sm:w-48">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                  placeholder="Kërko IP ose emër..."
                    className="pl-9 h-9 text-sm"
                    value={attemptsSearch}
                    onChange={(e) => {
                      setAttemptsSearch(e.target.value);
                      setAttemptsPage(1);
                    }}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">IP / Shfletuesi</th>
                    <th className="px-4 py-3 font-medium">Statusi</th>
                    <th className="px-4 py-3 font-medium text-right">Koha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {attemptsLoading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-gray-500">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                        Po ngarkohet...
                      </td>
                    </tr>
                  ) : attempts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-gray-500">
                        Nuk u gjetën të dhëna.
                      </td>
                    </tr>
                  ) : (
                    attempts.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center justify-between gap-2">
                            <span>{row.ip}</span>
                            {/* Block quick-action for failed attempts */}
                            {row.result === "failed" && !row.isBlocked && (
                              <Button
                                variant="ghost"
                                size="icon"
                                 className="h-6 w-6 text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                onClick={() => toggleBlock(row.ip, false)}
                                 disabled={pendingIps.has(row.ip) || bulkPending}
                                title="Blloko këtë IP"
                              >
                                <Lock className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          {row.ipLabel && <p className="text-xs font-normal text-blue-700">{row.ipLabel}</p>}
                          {row.deviceId && (
                            <p className="text-xs font-normal text-gray-600" title={`ID …${row.deviceId.slice(-8)}`}>
                              {row.deviceLabel || browserDescription(row.deviceUserAgent)}
                            </p>
                          )}
                          {row.result === "verified" && row.verifiedUser && (
                            <p className="text-xs font-normal text-amber-800">Përdoruesi: {row.verifiedUser}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.result === "success" && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Sukses</Badge>}
                          {row.result === "failed" && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Dështim</Badge>}
                          {row.result === "blocked" && <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">Bllokuar</Badge>}
                           {row.result === "verified" && <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Me verifikim</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs whitespace-nowrap">
                          <span title={formatDate(row.createdAt)}>{formatRelative(row.createdAt)}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-auto">
              <PaginationControls
                page={attemptsPage} total={attemptsTotal} limit={attemptsLimit} onChange={setAttemptsPage}
                onLimitChange={limit => { setAttemptsLimit(limit); setAttemptsPage(1); }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
      {activeIdentityIp && ips.find(row => row.ip === activeIdentityIp) && (
        <IpIdentityDialog
          key={activeIdentityIp}
          record={ips.find(row => row.ip === activeIdentityIp)!}
          onClose={() => setActiveIdentityIp(null)}
          onRenameIp={renameIp}
          onRenameDevice={renameDevice}
        />
      )}
      
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-amber-800">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="text-sm space-y-1">
          <p className="font-semibold">Kujdes me bllokimin e IP-ve</p>
          <p className="text-amber-700/80">
            Shumë përdorues në të njëjtin rrjet (p.sh. në një zyrë ose përmes një operatori celular) shpesh ndajnë të njëjtën IP publike.
            Bllokimi i një IP-je për shkak të një sulmuesi mund të bllokojë aksidentalisht përdorues të tjerë legjitimë.
          </p>
        </div>
      </div>
    </div>
  );
}
