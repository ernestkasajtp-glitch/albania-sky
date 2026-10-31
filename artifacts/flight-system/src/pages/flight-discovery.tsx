import { useState, useEffect, useRef, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Telescope, Play, Plus, X, Search, AlertTriangle, Clock } from "lucide-react";
import { fmtFlightNum, fmtAmPm, fmtM } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

let globalLastProgressStr: string | null = null;

const WEEKDAYS_SQ = ["E Diel", "E Hënë", "E Martë", "E Mërkurë", "E Enjte", "E Premte", "E Shtunë"];
function weekdaySq(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS_SQ[d.getUTCDay()];
}

function openDatePicker(input: HTMLInputElement): void {
  input.showPicker?.();
}

interface Candidate {
  id: number;
  flightNumber: string;
  airline: string;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  googlePrice: number | null;
  foundAt: string;
}

interface Progress {
  running: boolean;
  checked: number;
  total: number;
  found: number;
  errors: number;
  error?: string;
}

interface ConfigRoute {
  enabled: boolean;
  intervalMinutes: number;
  startDate: string;
  endDate: string;
  fromCity: string;
  toCity: string;
  hasActiveInventory: boolean;
  eligible: boolean;
}

interface Config {
  revision: number;
  routes: ConfigRoute[];
}

type ConfigSaveError = Error & { status?: number };

export default function FlightDiscoveryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Polling for search progress
  const { data: progress } = useQuery<Progress>({
    queryKey: ["flightDiscoveryProgress"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/flight-discovery/progress`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch progress");
      return res.json();
    },
    refetchInterval: (query) => (query.state.data?.running ? 2000 : 15000),
  });

  useEffect(() => {
    if (!progress) return;
    const progStr = JSON.stringify(progress);
    
    if (globalLastProgressStr !== progStr) {
      const prev = globalLastProgressStr ? JSON.parse(globalLastProgressStr) : null;
      
      if (prev !== null && !progress.running) {
        if (progress.checked > 0 || progress.error) {
          queryClient.invalidateQueries({ queryKey: ["flightDiscoveryCandidates"] });
          if (progress.error) {
            toast({ title: "Kërkimi dështoi", description: progress.error, variant: "destructive" });
          } else if (progress.errors > 0) {
            toast({
              title: "Kërkimi përfundoi me gabime",
              description: `U kontrolluan ${progress.checked} data. U gjetën ${progress.found} fluturime, por pati ${progress.errors} gabime.`,
              variant: "destructive"
            });
          } else {
            toast({
              title: "Kërkimi përfundoi",
              description: `U kontrolluan ${progress.checked} data. U gjetën ${progress.found} fluturime të reja.`,
            });
          }
        }
      }
      globalLastProgressStr = progStr;
    }
  }, [progress, queryClient, toast]);

  // Candidates
  const { data: candidates = [], isLoading: isLoadingCandidates, error: candidatesError, refetch: reloadCandidates } = useQuery<Candidate[]>({
    queryKey: ["flightDiscoveryCandidates"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/flight-discovery/candidates`, { credentials: "include" });
      if (!res.ok) throw new Error("Nuk u ngarkua lista e fluturimeve. Provo përsëri.");
      return res.json();
    },
    retry: false,
  });

  // Dismiss candidate
  const dismissMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/flight-discovery/candidates/${id}/dismiss`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to dismiss");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flightDiscoveryCandidates"] });
      toast({ title: "Fluturimi u fshi nga lista" });
    },
    onError: () => toast({ title: "Gabim gjatë fshirjes", variant: "destructive" })
  });

  // Manual Search Form
  const [sFrom, setSFrom] = useState("");
  const [sTo, setSTo] = useState("");
  const [sStart, setSStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [sEnd, setSEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  const searchMut = useMutation({
    mutationFn: async (payload: { fromCity: string; toCity: string; startDate: string; endDate: string }) => {
      const res = await fetch(`${API_BASE}/flight-discovery/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Search start failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flightDiscoveryProgress"] });
      toast({ title: "Kërkimi filloi", description: "Po kontrollohen datat në sfond..." });
    },
    onError: (err: any) => toast({ title: "Gabim në nisjen e kërkimit", description: err.message, variant: "destructive" })
  });

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const f = sFrom.toUpperCase().trim();
    const t = sTo.toUpperCase().trim();
    if (f.length !== 3 || t.length !== 3 || f === t) {
      toast({ title: "Kodet gabim", description: "Kodet duhet të jenë 3 shkronja dhe të ndryshme.", variant: "destructive" });
      return;
    }
    const d1 = new Date(sStart);
    const d2 = new Date(sEnd);
    if (d1 > d2 || (d2.getTime() - d1.getTime()) / 86400000 > 30) {
      toast({ title: "Datat gabim", description: "Maksimumi 31 ditë.", variant: "destructive" });
      return;
    }
    searchMut.mutate({ fromCity: f, toCity: t, startDate: sStart, endDate: sEnd });
  };

  // Config
  const {
    data: config,
    isLoading: isLoadingConfig,
    error: configError,
    refetch: reloadConfig,
  } = useQuery<Config>({
    queryKey: ["flightDiscoveryConfig"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/flight-discovery/config`, { credentials: "include" });
      if (!res.ok) throw new Error("Nuk u ngarkua konfigurimi automatik. Provo përsëri.");
      return res.json();
    },
    retry: false,
  });

  const [draftRoutes, setDraftRoutes] = useState<ConfigRoute[]>([]);
  const [draftRevision, setDraftRevision] = useState(0);
  const [draftDirty, setDraftDirty] = useState(false);

  const initializedConfig = useRef(false);
  useEffect(() => {
    if (config && (!initializedConfig.current || !draftDirty)) {
      setDraftRoutes(config.routes.map(route => ({ ...route })));
      setDraftRevision(config.revision);
      initializedConfig.current = true;
    }
  }, [config, draftDirty]);

  const configMut = useMutation({
    mutationFn: async (payload: { revision: number; routes: ConfigRoute[] }) => {
      const res = await fetch(`${API_BASE}/flight-discovery/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const error = new Error(body.error || "Failed to save config") as ConfigSaveError;
        error.status = res.status;
        throw error;
      }
      return res.json();
    },
    onSuccess: (data: Config) => {
      queryClient.setQueryData(["flightDiscoveryConfig"], data);
      setDraftRoutes(data.routes.map(route => ({ ...route })));
      setDraftRevision(data.revision);
      setDraftDirty(false);
      toast({ title: "Itineraret automatike u ruajtën me sukses" });
    },
    onError: async (err: ConfigSaveError) => {
      if (err.status === 409) {
        setDraftDirty(false);
        await queryClient.invalidateQueries({ queryKey: ["flightDiscoveryConfig"] });
        toast({
          title: "Konfigurimi u ndryshua",
          description: "U ringarkua konfigurimi i fundit. Kontrollojeni dhe ruajeni përsëri.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Gabim në ruajtje", description: err.message, variant: "destructive" });
    },
  });

  const updateRoute = (index: number, patch: Partial<ConfigRoute>) => {
    setDraftDirty(true);
    setDraftRoutes(current => current.map((route, routeIndex) =>
      routeIndex === index ? { ...route, ...patch } : route,
    ));
  };

  const dateRangeDays = (start: string, end: string): number => {
    const first = Date.parse(`${start}T00:00:00Z`);
    const last = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return 0;
    return Math.floor((last - first) / 86_400_000) + 1;
  };

  const handleSaveConfig = (e: FormEvent) => {
    e.preventDefault();
    const normalized = draftRoutes.map(route => ({
      ...route,
      fromCity: route.fromCity.trim().toUpperCase(),
      toCity: route.toCity.trim().toUpperCase(),
      intervalMinutes: Number(route.intervalMinutes),
    }));
    // Malformed legacy/inventory rows that are not selected must not block
    // saving the valid itineraries selected by the administrator.
    const routesToSave = normalized.filter(route =>
      route.enabled ||
      (/^[A-Z]{3}$/.test(route.fromCity) &&
        /^[A-Z]{3}$/.test(route.toCity) &&
        route.fromCity !== route.toCity),
    );
    const seen = new Set<string>();
    for (const route of routesToSave) {
      const key = `${route.fromCity}|${route.toCity}`;
      if (!/^[A-Z]{3}$/.test(route.fromCity) || !/^[A-Z]{3}$/.test(route.toCity) || route.fromCity === route.toCity) {
        toast({ title: "Aeroport i pavlefshëm", description: "Kodet e aeroporteve duhet të kenë 3 shkronja dhe të jenë të ndryshme.", variant: "destructive" });
        return;
      }
      if (seen.has(key)) {
        toast({ title: "Itinerar i përsëritur", description: "Çdo kombinim nisje-mbërritje mund të ruhet vetëm një herë.", variant: "destructive" });
        return;
      }
      seen.add(key);
      const days = dateRangeDays(route.startDate, route.endDate);
      if (!days || days > 31) {
        toast({ title: "Datat gabim", description: "Çdo interval duhet të ketë data të vlefshme dhe maksimumi 31 ditë.", variant: "destructive" });
        return;
      }
      if (!Number.isInteger(route.intervalMinutes) || route.intervalMinutes < 15) {
        toast({ title: "Intervali gabim", description: "Intervali duhet të jetë numër i plotë, minimumi 15 minuta.", variant: "destructive" });
        return;
      }
    }
    configMut.mutate({ revision: draftRevision, routes: routesToSave });
  };

  // Candidate selection and bulk add
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<number>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAdultPrice, setBulkAdultPrice] = useState("");

  useEffect(() => {
    const availableIds = new Set(candidates.map(candidate => candidate.id));
    setSelectedCandidateIds(current => {
      const next = new Set([...current].filter(id => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [candidates]);

  const addMut = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await fetch(`${API_BASE}/flight-discovery/candidates/${id}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to add flight");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flightDiscoveryCandidates"] });
      toast({ title: "Fluturimi u krijua me sukses" });
    },
    onError: (err: any) => toast({ title: "Gabim gjatë shtimit", description: err.message, variant: "destructive" })
  });

  const addSingleCandidate = (candidate: Candidate) => {
    if (addMut.isPending) return;
    if (candidate.googlePrice == null || !Number.isFinite(candidate.googlePrice) || candidate.googlePrice < 0) {
      toast({
        title: "Nuk ka çmim Google",
        description: "Ky fluturim nuk mund të shtohet direkt pa një çmim Google.",
        variant: "destructive",
      });
      return;
    }
    addMut.mutate({
      id: candidate.id,
      payload: {
        adultPrice: Math.round(candidate.googlePrice),
        totalSeats: 20,
      }
    });
  };

  const allCandidatesSelected = candidates.length > 0 && candidates.every(candidate => selectedCandidateIds.has(candidate.id));

  const toggleAllCandidates = (checked: boolean) => {
    setSelectedCandidateIds(checked ? new Set(candidates.map(candidate => candidate.id)) : new Set());
  };

  const toggleCandidate = (id: number, checked: boolean) => {
    setSelectedCandidateIds(current => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const bulkAddMut = useMutation({
    mutationFn: async ({ ids, adultPrice }: { ids: number[]; adultPrice: number }) => {
      const results: Array<{ id: number; ok: boolean; error?: string }> = [];
      for (const id of ids) {
        const res = await fetch(`${API_BASE}/flight-discovery/candidates/${id}/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ adultPrice: Math.round(adultPrice), totalSeats: 20 }),
        });
        if (res.ok) {
          results.push({ id, ok: true });
        } else {
          const body = await res.json().catch(() => ({}));
          results.push({ id, ok: false, error: body.error || "Shtimi dështoi" });
        }
      }
      return results;
    },
    onSuccess: results => {
      const succeeded = results.filter(result => result.ok);
      const failed = results.filter(result => !result.ok);
      setSelectedCandidateIds(current => {
        const next = new Set(current);
        succeeded.forEach(result => next.delete(result.id));
        return next;
      });
      setBulkDialogOpen(false);
      setBulkAdultPrice("");
      queryClient.invalidateQueries({ queryKey: ["flightDiscoveryCandidates"] });
      toast({
        title: `${succeeded.length} fluturime u shtuan`,
        description: failed.length
          ? `${failed.length} fluturime nuk u shtuan. Ato mbeten të zgjedhura për ta provuar përsëri.`
          : "Të gjitha fluturimet e zgjedhura u krijuan me sukses.",
        variant: failed.length ? "destructive" : "default",
      });
    },
    onError: (err: any) => toast({
      title: "Shtimi masiv dështoi",
      description: err.message,
      variant: "destructive",
    }),
  });

  const confirmBulkAdd = () => {
    const adultPrice = Number(bulkAdultPrice);
    const ids = candidates.filter(candidate => selectedCandidateIds.has(candidate.id)).map(candidate => candidate.id);
    if (!bulkAdultPrice.trim() || !Number.isFinite(adultPrice) || adultPrice < 0) {
      toast({ title: "Vendos një çmim të vlefshëm.", variant: "destructive" });
      return;
    }
    if (!ids.length) {
      toast({ title: "Zgjidh të paktën një fluturim.", variant: "destructive" });
      return;
    }
    bulkAddMut.mutate({ ids, adultPrice: Math.round(adultPrice) });
  };

  const isRunning = progress?.running;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          <Telescope className="h-6 w-6 text-blue-600" />
          Fluturime të Palistuara (Discovery)
        </h1>
        <p className="text-gray-500 text-sm">
          Gjej fluturime direkte që shfaqen në Google Flights por që nuk i ke në sistem.
          Këto janë informacione të nxjerra automatikisht pa garanci inventari.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manual Search */}
        <Card>
          <form onSubmit={handleSearch}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-5 w-5 text-gray-500" />
                Kërkim Manual
              </CardTitle>
              <CardDescription>
                Kërko për një rrugë specifike (Maksimumi 31 ditë interval).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="discovery-airline">Kompania e fluturimit</Label>
                <select id="discovery-airline" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value="wizz" onChange={() => {}}>
                  <option value="wizz">Wizz Air</option>
                </select>
                <p className="text-xs text-muted-foreground">Për momentin kërkimi mbështet vetëm Wizz Air.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nisja (3 shkronja)</Label>
                  <Input placeholder="TIA" maxLength={3} value={sFrom} onChange={e => setSFrom(e.target.value.toUpperCase())} required disabled={isRunning} />
                </div>
                <div className="space-y-1.5">
                  <Label>Mbërritja (3 shkronja)</Label>
                  <Input placeholder="MXP" maxLength={3} value={sTo} onChange={e => setSTo(e.target.value.toUpperCase())} required disabled={isRunning} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nga data</Label>
                  <Input
                    type="date"
                    value={sStart}
                    onClick={e => openDatePicker(e.currentTarget)}
                    onChange={e => {
                      setSStart(e.target.value);
                      setSEnd(e.target.value);
                    }}
                    required
                    disabled={isRunning}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Deri më datë</Label>
                  <Input
                    type="date"
                    value={sEnd}
                    min={sStart}
                    onClick={e => openDatePicker(e.currentTarget)}
                    onChange={e => setSEnd(e.target.value)}
                    required
                    disabled={isRunning}
                  />
                </div>
              </div>

              {isRunning && progress && (
                <div className="bg-blue-50 border border-blue-100 rounded-md p-3 text-sm flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-medium text-blue-800">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Kërkimi në proces...
                  </div>
                  <div className="flex items-center gap-4 text-blue-700/80">
                    <span>Datat: {progress.checked} / {progress.total}</span>
                    <span>Gjetur: {progress.found}</span>
                    {progress.errors > 0 && <span className="text-red-500">Gabime: {progress.errors}</span>}
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isRunning || searchMut.isPending} className="w-full gap-2">
                {searchMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Nis Kërkimin
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Auto Config */}
        <Card>
          <form onSubmit={handleSaveConfig}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-gray-500" />
                  Itinerare automatike
                </div>
              </CardTitle>
              <CardDescription>
                Zgjidh itineraret e inventarit që do të kontrollohen periodikisht. Kërkimi kontrollon vetëm Wizz Air.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {configError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert" data-testid="status-discovery-config-error">
                  <p>{(configError as Error).message}</p>
                  <Button type="button" variant="outline" className="mt-3" onClick={() => reloadConfig()} data-testid="button-retry-discovery-config">
                    Provo përsëri
                  </Button>
                </div>
              ) : isLoadingConfig ? (
                <div className="flex justify-center py-8" data-testid="status-discovery-config-loading">
                  <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
                </div>
              ) : draftRoutes.length === 0 ? (
                <div className="rounded-md border border-dashed p-5 text-center text-sm text-gray-500" data-testid="status-discovery-config-empty">
                  <p>Nuk ka itinerare aktive në inventar.</p>
                  <p className="mt-1 text-xs text-gray-400">Shtoni një fluturim të ardhshëm ose ruani një itinerar të shfaqur këtu.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {draftRoutes.map((route, index) => (
                    <div
                      key={`${route.fromCity}-${route.toCity}`}
                      className={`rounded-lg border p-3 ${route.hasActiveInventory ? "bg-white" : "bg-gray-50"}`}
                      data-testid={`row-discovery-route-${route.fromCity}-${route.toCity}`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`discovery-route-enabled-${index}`}
                            checked={route.enabled}
                            onCheckedChange={(checked) => updateRoute(index, { enabled: checked === true })}
                            disabled={(!route.eligible && !route.enabled) || configMut.isPending}
                            data-testid={`checkbox-discovery-route-${route.fromCity}-${route.toCity}`}
                          />
                          <div>
                            <Label htmlFor={`discovery-route-enabled-${index}`} className="cursor-pointer font-semibold">
                              {route.fromCity} <span className="mx-1 text-gray-400">→</span> {route.toCity}
                            </Label>
                            <p className="text-xs text-gray-500">
                              {route.eligible
                                ? "Inventar aktiv (Open / Sold Out)"
                                : route.hasActiveInventory
                                  ? "Datat kanë përfunduar — ruhet, por nuk skanohet"
                                  : "Pa inventar aktiv — ruhet, por nuk skanohet"}
                            </p>
                          </div>
                        </div>
                        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 md:max-w-xl">
                          <div className="space-y-1">
                            <Label htmlFor={`discovery-route-start-${index}`} className="text-xs">Nga data</Label>
                            <Input
                              id={`discovery-route-start-${index}`}
                              type="date"
                              value={route.startDate}
                              onClick={e => openDatePicker(e.currentTarget)}
                              onChange={e => updateRoute(index, {
                                startDate: e.target.value,
                                endDate: e.target.value,
                              })}
                              disabled={configMut.isPending}
                              data-testid={`input-discovery-route-start-${route.fromCity}-${route.toCity}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`discovery-route-end-${index}`} className="text-xs">Deri më datë</Label>
                            <Input
                              id={`discovery-route-end-${index}`}
                              type="date"
                              min={route.startDate}
                              value={route.endDate}
                              onClick={e => openDatePicker(e.currentTarget)}
                              onChange={e => updateRoute(index, { endDate: e.target.value })}
                              disabled={configMut.isPending}
                              data-testid={`input-discovery-route-end-${route.fromCity}-${route.toCity}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`discovery-route-interval-${index}`} className="text-xs">Intervali (min)</Label>
                            <Input
                              id={`discovery-route-interval-${index}`}
                              type="number"
                              min="15"
                              step="1"
                              value={route.intervalMinutes}
                              onChange={e => updateRoute(index, { intervalMinutes: Number(e.target.value) })}
                              disabled={configMut.isPending}
                              data-testid={`input-discovery-route-interval-${route.fromCity}-${route.toCity}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="secondary" disabled={isLoadingConfig || !!configError || configMut.isPending} className="w-full gap-2" data-testid="button-save-discovery-config">
                {configMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ruaj itineraret"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            Fluturime të reja të gjetura
            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
              {candidatesError ? "—" : candidates.length}
            </span>
          </CardTitle>
          <CardDescription>
            Shqyrto fluturimet dhe shto ato që dëshiron të shesësh. Pas shtimit, çmimi i shitjes dhe biletat duhet të menaxhohen manualisht.
          </CardDescription>
        </CardHeader>
        
        {candidatesError ? (
          <div className="p-8 text-center space-y-3" role="alert">
            <p className="text-red-600">{candidatesError.message}</p>
            <Button variant="outline" onClick={() => reloadCandidates()}>Provo përsëri</Button>
          </div>
        ) : isLoadingCandidates ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center">
            <Telescope className="h-10 w-10 text-gray-200 mb-3" />
            <p>Nuk ka asnjë fluturim kandidat në listë.</p>
            <p className="text-sm mt-1 text-gray-400">Nis një kërkim ose prit kërkimin automatik.</p>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gray-50 px-4 py-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox
                  checked={allCandidatesSelected}
                  onCheckedChange={checked => toggleAllCandidates(checked === true)}
                  aria-label="Zgjidh të gjitha fluturimet"
                />
                Zgjidh të gjitha
              </label>
              <Button
                size="sm"
                className="gap-2 bg-green-600 hover:bg-green-700"
                disabled={selectedCandidateIds.size === 0 || bulkAddMut.isPending || addMut.isPending}
                onClick={() => setBulkDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Shto të zgjedhurat ({selectedCandidateIds.size})
              </Button>
            </div>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Zgjidh</span>
                  </TableHead>
                  <TableHead>Rruga</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Orari</TableHead>
                  <TableHead>Fluturimi</TableHead>
                  <TableHead className="text-right">Google (Info)</TableHead>
                  <TableHead className="text-right">Veprime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedCandidateIds.has(c.id)}
                        onCheckedChange={checked => toggleCandidate(c.id, checked === true)}
                        aria-label={`Zgjidh fluturimin ${fmtFlightNum(c.flightNumber)}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {c.fromCity} <span className="text-gray-400 mx-1">→</span> {c.toCity}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-mono text-sm">{c.departureDate}</div>
                      <div className="text-xs text-gray-500">{weekdaySq(c.departureDate)}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-sm">
                      {fmtAmPm(c.departureTime) || "—"}
                      {c.arrivalTime ? <span className="text-gray-400 mx-1">→</span> : ""}
                      {c.arrivalTime ? fmtAmPm(c.arrivalTime) : ""}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-mono text-blue-700 font-semibold">{fmtFlightNum(c.flightNumber)}</div>
                      <div className="text-xs text-gray-500">{c.airline}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.googlePrice != null ? (
                        <span className="font-semibold text-amber-700">€{fmtM(c.googlePrice)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => dismissMut.mutate(c.id)}
                        disabled={dismissMut.isPending || addMut.isPending}
                        title="Fshije"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 bg-green-600 hover:bg-green-700"
                        onClick={() => addSingleCandidate(c)}
                        disabled={dismissMut.isPending || addMut.isPending || bulkAddMut.isPending}
                      >
                        <Plus className="h-4 w-4" /> Shto
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Shto fluturimet e zgjedhura</DialogTitle>
            <DialogDescription>
              Po shton <strong>{selectedCandidateIds.size}</strong> fluturime me të njëjtin çmim shitjeje.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-1.5">
              <Label>Çmimi Shitjes (Adult) €</Label>
              <Input type="number" min="0" step="1" value={bulkAdultPrice} onChange={e => setBulkAdultPrice(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Çmimi (Foshnjë) €</Label>
              <Input type="number" value="35" readOnly aria-label="Çmimi fiks i foshnjës" />
              <p className="text-xs text-muted-foreground">Fiks sipas sistemit: 35 €.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Vende Totale</Label>
              <Input type="number" value="20" readOnly aria-label="Vendet fikse fillestare" />
            </div>
          </div>

          <div className="bg-amber-50 p-3 rounded-md border border-amber-100 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Kujdes: Pas shtimit fluturimi do të jetë i dukshëm për agjentët.
              Për fëmijët (Child) çmimi do të jetë automatikisht i njëjtë me të rriturit sipas rregullave të sistemit.
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)} disabled={bulkAddMut.isPending}>
              Anulo
            </Button>
            <Button onClick={confirmBulkAdd} className="gap-2 bg-green-600 hover:bg-green-700" disabled={bulkAddMut.isPending}>
              {bulkAddMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Shto të gjitha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
