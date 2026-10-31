import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { GroupRule } from "@/components/AgencyGroups";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

type Rule = {
  id: number;
  fromAirport: string | null;
  toAirport: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  flightId: number | null;
};
type Flight = {
  id: number;
  flightNumber: string;
  fromCity: string;
  toCity: string;
  departureDate: string;
  status: string;
  showInBookingEngine: boolean;
};
type VisibilityContext = { groupId: number | null; groupName: string | null; groupRules: GroupRule[]; legacyExcluded: boolean };
type GroupPeriod = { groupId: number | null; dateFrom: string | null; dateTo: string | null };
type Props = { agentId: number; groupId?: number | null };

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Kërkesa dështoi (${response.status})`);
  }
  return response.json();
}

export function AgentFlightVisibility({ agentId, groupId }: Props) {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [context, setContext] = useState<VisibilityContext | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [kind, setKind] = useState<"route" | "flight">("route");
  const [fromAirport, setFromAirport] = useState("");
  const [toAirport, setToAirport] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [flightId, setFlightId] = useState("");
  const [flightSearch, setFlightSearch] = useState("");
  const [groupPeriod, setGroupPeriod] = useState<GroupPeriod | null>(null);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [periodLoading, setPeriodLoading] = useState(true);
  const [periodSaving, setPeriodSaving] = useState(false);
  const [periodError, setPeriodError] = useState("");
  const [periodSuccess, setPeriodSuccess] = useState("");

  const rulesUrl = `${API_BASE}/booking-engine/agents/${agentId}/visibility-rules`;
  const periodUrl = `${API_BASE}/booking-engine/agents/${agentId}/group-period`;

  useEffect(() => {
    let active = true;
    setGroupPeriod(null);
    setPeriodFrom("");
    setPeriodTo("");
    setPeriodLoading(true);
    setPeriodError("");
    setPeriodSuccess("");
    fetch(periodUrl, { credentials: "include" })
      .then(response => readJson<GroupPeriod>(response))
      .then(period => {
        if (active) {
          setGroupPeriod(period);
          setPeriodFrom(period.dateFrom ?? "");
          setPeriodTo(period.dateTo ?? "");
        }
      })
      .catch(err => { if (active) setPeriodError(err instanceof Error ? err.message : "Periudha nuk u ngarkua."); })
      .finally(() => { if (active) setPeriodLoading(false); });
    return () => { active = false; };
  }, [periodUrl, groupId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setLoadFailed(false);
    setRules([]);
    setContext(null);
    setFlights([]);
    Promise.all([
      fetch(rulesUrl, { credentials: "include" }).then(response => readJson<Rule[]>(response)),
      fetch(`${API_BASE}/booking-engine/flights`, { credentials: "include" }).then(response => readJson<Flight[]>(response)),
      fetch(`${API_BASE}/booking-engine/agents/${agentId}/visibility-context`, { credentials: "include" }).then(response => readJson<VisibilityContext>(response)),
    ]).then(([newRules, newFlights, visibility]) => {
      if (active) {
        setRules(newRules);
        setFlights(newFlights);
        setContext(visibility);
      }
    }).catch((err) => {
      if (active) { setError(err.message || "Rregullat nuk u ngarkuan."); setLoadFailed(true); }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [agentId, groupId, rulesUrl]);

  const airports = useMemo(() => [...new Set(flights.flatMap(f => [f.fromCity, f.toCity]))].sort(), [flights]);
  const availableFlights = useMemo(() => flights
    .filter(f => f.status === "open" && f.departureDate >= new Date().toISOString().slice(0, 10))
    .filter(f => `${f.flightNumber} ${f.fromCity} ${f.toCity} ${f.departureDate}`.toLowerCase().includes(flightSearch.toLowerCase()))
    .slice(0, 100), [flights, flightSearch]);
  const flightLabel = (flight: Flight) =>
    `${flight.flightNumber} · ${flight.fromCity} → ${flight.toCity} · ${flight.departureDate}${flight.showInBookingEngine ? "" : " · Fshehur"}`;
  const ruleLabel = (rule: Rule) => {
    const flight = rule.flightId ? flights.find(f => f.id === rule.flightId) : null;
    return rule.flightId
      ? `Fluturim konkret: ${flight ? flightLabel(flight) : `Fluturimi #${rule.flightId}`}`
      : `${rule.fromAirport || "Çdo aeroport"} → ${rule.toAirport || "Çdo aeroport"} · ${rule.dateFrom} – ${rule.dateTo}`;
  };

  const periodDirty = groupPeriod !== null && (
    periodFrom !== (groupPeriod.dateFrom ?? "") || periodTo !== (groupPeriod.dateTo ?? "")
  );
  const periodIsOverride = groupPeriod?.dateFrom != null && groupPeriod.dateTo != null;

  const saveGroupPeriod = async (reset = false) => {
    if (!groupPeriod || groupPeriod.groupId == null || periodSaving) return;
    if (!reset && (!periodFrom || !periodTo || periodFrom > periodTo)) {
      setPeriodError("Vendosni të dyja datat e nisjes: data e fillimit duhet të jetë para ose e njëjtë me datën e mbarimit.");
      setPeriodSuccess("");
      return;
    }
    setPeriodSaving(true);
    setPeriodError("");
    setPeriodSuccess("");
    try {
      const updated = await readJson<GroupPeriod>(await fetch(periodUrl, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom: reset ? null : periodFrom, dateTo: reset ? null : periodTo }),
      }));
      setGroupPeriod(updated);
      setPeriodFrom(updated.dateFrom ?? "");
      setPeriodTo(updated.dateTo ?? "");
      setPeriodSuccess(reset ? "Periudha personale u hoq; tani vlejnë datat e grupit." : "Periudha personale u ruajt.");
    } catch (err) {
      setPeriodError(err instanceof Error ? err.message : "Periudha nuk u ruajt.");
    } finally {
      setPeriodSaving(false);
    }
  };

  const addRule = async () => {
    const payload = kind === "flight"
      ? { kind, flightId: Number(flightId) }
      : { kind, fromAirport: fromAirport.trim().toUpperCase(), toAirport: toAirport.trim().toUpperCase(), dateFrom, dateTo };
    if (kind === "route" && (!(payload.fromAirport || payload.toAirport) ||
      (!!payload.fromAirport && !/^[A-Z]{3}$/.test(payload.fromAirport)) ||
      (!!payload.toAirport && !/^[A-Z]{3}$/.test(payload.toAirport)) ||
      !dateFrom || !dateTo || dateFrom > dateTo)) {
      setError("Vendosni të paktën një kod aeroporti (3 shkronja) dhe një periudhë të vlefshme.");
      return;
    }
    if (kind === "flight" && !flightId) { setError("Zgjidhni fluturimin."); return; }
    if (rules.length === 0 && !window.confirm(
      context?.groupId != null
        ? `Ky rregull i veçantë SHTOHET rregullave të grupit "${context.groupName}". ${context.groupRules.length === 0 ? "Grupi pa rregulla nuk lejon fluturime; vetëm rregullat e veçanta lejojnë fluturime." : "Ai mund të lejojë fluturime të tjera."} Vazhdoni?`
        : "Kjo agjenci nuk ka grup. Rregulli i ruajtur NUK lejon fluturime derisa administratori t'i caktojë një grup. Vazhdoni?"
    )) return;
    setSaving(true);
    setError("");
    try {
      const created = await readJson<Rule>(await fetch(rulesUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
      setRules(current => [...current, created]);
      toast({ title: "Rregulli u shtua" });
      setFlightId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rregulli nuk u ruajt.");
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (ruleId: number) => {
    if (!window.confirm(
      context?.groupId != null
        ? `Të hiqet ky rregull? ${rules.length === 1 && context.groupRules.length === 0 ? "Pa rregulla grupi ose agjencie, nuk lejohet asnjë fluturim." : "Mbeten rregullat e grupit dhe rregullat e tjera të agjencisë."}`
        : "Të hiqet ky rregull i ruajtur? Agjencia pa grup nuk sheh dhe nuk rezervon fluturime."
    )) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${rulesUrl}/${ruleId}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) await readJson(response);
      setRules(current => current.filter(rule => rule.id !== ruleId));
      toast({ title: "Rregulli u hoq" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rregulli nuk u hoq.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aksesi i agjentit te fluturimet në Booking Engine</CardTitle>
        <p className="text-sm text-muted-foreground">
          {context?.groupId != null
            ? context.groupRules.length
                ? `Kjo agjenci trashëgon rregullat e grupit "${context.groupName}". Rregullat e veta lejojnë fluturime shtesë (OSE). Rregullat e përgjithshme nuk zbatohen.`
                : `Grupi "${context.groupName}" nuk ka rregulla: agjencia nuk sheh asnjë fluturim përveç atyre të lejuara nga rregullat e saj të veçanta. Rregullat e përgjithshme nuk zbatohen.`
            : "Pa grup: kjo agjenci nuk sheh dhe nuk rezervon asnjë fluturim në Booking Engine. Edhe rregullat e veçanta të ruajtura mbeten joaktive derisa administratori t'i caktojë grupin."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Po ngarkohen rregullat...</p> : loadFailed ? (
          <div role="alert" className="text-sm text-red-600">Rregullat nuk u ngarkuan: {error}. Nuk mund të ndryshohen derisa të hapet sërish faqja.</div>
        ) : (
          <>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              {context?.groupId != null ? <>
                <p className="font-medium">Grupi: {context.groupName} · {context.groupRules.length} rregulla të trashëguara</p>
                {context.groupRules.length === 0 && <p className="text-amber-700">Pa rregulla grupi: vetëm rregullat e veçanta të agjencisë lejojnë fluturime.</p>}
                {context.groupRules.map(rule => <p key={rule.id} className="mt-1 text-muted-foreground">{rule.airport}: {rule.direction === "either" ? "nisje OSE mbërritje" : rule.direction === "from" ? "vetëm nisje" : "vetëm mbërritje"} · datat origjinale të grupit: {rule.dateFrom && rule.dateTo ? `${rule.dateFrom} – ${rule.dateTo}` : "Pa afat"}</p>)}
              </> : <p className="font-medium text-amber-700">Pa grup: asnjë fluturim i dukshëm. Caktoni një grup që të hyjnë në fuqi rregullat e tij dhe përjashtimet e veçanta.</p>}
            </div>
            <section aria-labelledby="agent-group-period-title" className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div>
                <h3 id="agent-group-period-title" className="text-sm font-semibold">Periudha personale e grupit</h3>
                <p className="text-xs text-muted-foreground">
                  Këto data të nisjes ZËVENDËSOJNË datat e rregullave të grupit vetëm për këtë agjent: mund ta zgjerojnë ose ta ngushtojnë periudhën. Aeroportet dhe drejtimet e grupit mbeten të njëjta; përjashtimet e veta të agjentit nuk ndryshojnë. Të dyja datat përfshihen.
                </p>
              </div>
              {periodLoading ? <p className="text-sm text-muted-foreground" data-testid="status-group-period-loading">Po ngarkohet periudha...</p> : !groupPeriod ? (
                <p role="alert" className="text-sm text-red-600" data-testid="status-group-period-error">Periudha nuk u ngarkua: {periodError}. Hapeni sërish faqen për të provuar përsëri.</p>
              ) : (
                <>
                  <p className="text-sm font-medium" data-testid="status-group-period-mode">
                    {groupPeriod.groupId == null
                      ? "Pa grup – periudha personale nuk mund të përdoret."
                      : periodIsOverride
                        ? `Periudhë personale aktive: ${groupPeriod.dateFrom} – ${groupPeriod.dateTo} (në vend të datave të grupit).`
                        : "Trashëgon datat e grupit (pa periudhë personale)."}
                  </p>
                  {groupPeriod.groupId == null ? (
                    <p className="text-xs text-amber-700">Caktoni një grup për këtë agjent që të mund të ndryshoni periudhën e tij. Datat nuk mund të përdoren për të çaktivizuar grupin.</p>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="group-period-from">Nga data e nisjes</Label>
                          <Input id="group-period-from" data-testid="input-group-period-from" type="date" value={periodFrom} disabled={periodSaving} onChange={e => { setPeriodFrom(e.target.value); setPeriodError(""); setPeriodSuccess(""); }} />
                        </div>
                        <div>
                          <Label htmlFor="group-period-to">Deri në datën e nisjes</Label>
                          <Input id="group-period-to" data-testid="input-group-period-to" type="date" value={periodTo} disabled={periodSaving} onChange={e => { setPeriodTo(e.target.value); setPeriodError(""); setPeriodSuccess(""); }} />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" data-testid="button-save-group-period" disabled={periodSaving || !periodDirty} onClick={() => saveGroupPeriod()}>Ruaj periudhën</Button>
                        <Button type="button" size="sm" variant="outline" data-testid="button-cancel-group-period" disabled={periodSaving || !periodDirty} onClick={() => { setPeriodFrom(groupPeriod.dateFrom ?? ""); setPeriodTo(groupPeriod.dateTo ?? ""); setPeriodError(""); setPeriodSuccess(""); }}>Anulo ndryshimet</Button>
                        <Button type="button" size="sm" variant="outline" data-testid="button-reset-group-period" disabled={periodSaving || !periodIsOverride} onClick={() => saveGroupPeriod(true)}>Kthe te datat e grupit</Button>
                      </div>
                      {periodSaving && <p className="text-sm text-muted-foreground" data-testid="status-group-period-saving">Po ruhet periudha...</p>}
                    </>
                  )}
                  {periodError && <p role="alert" className="text-sm text-red-600" data-testid="status-group-period-error">{periodError}</p>}
                  {periodSuccess && <p role="status" className="text-sm text-green-700" data-testid="status-group-period-success">{periodSuccess}</p>}
                </>
              )}
            </section>
            <div className="space-y-2">
              {rules.map(rule => {
                return (
                  <div key={rule.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <span>{ruleLabel(rule)}</span>
                    <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => removeRule(rule.id)}>Hiq</Button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant={kind === "route" ? "default" : "outline"} size="sm" onClick={() => setKind("route")}>Itinerar dhe periudhë</Button>
              <Button type="button" variant={kind === "flight" ? "default" : "outline"} size="sm" onClick={() => setKind("flight")}>Fluturim konkret</Button>
            </div>
            {kind === "route" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><Label htmlFor="access-from">Nga aeroporti</Label><Input id="access-from" list="access-airports" maxLength={3} placeholder="Çdo aeroport" value={fromAirport} onChange={e => setFromAirport(e.target.value.toUpperCase())} /></div>
                <div><Label htmlFor="access-to">Drejt aeroportit</Label><Input id="access-to" list="access-airports" maxLength={3} placeholder="Çdo aeroport" value={toAirport} onChange={e => setToAirport(e.target.value.toUpperCase())} /></div>
                <div><Label htmlFor="access-start">Nga data e nisjes</Label><Input id="access-start" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
                <div><Label htmlFor="access-end">Deri në datën e nisjes</Label><Input id="access-end" type="date" min={dateFrom} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
                <datalist id="access-airports">{airports.map(code => <option key={code} value={code} />)}</datalist>
                <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                  Lëreni njërin aeroport bosh për të përfshirë të gjitha nisjet ose mbërritjet e aeroportit tjetër. Periudha e datave mbetet e detyrueshme.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="access-flight-search">Kërko sipas numrit, aeroportit ose datës</Label>
                <Input id="access-flight-search" value={flightSearch} onChange={e => { setFlightSearch(e.target.value); setFlightId(""); }} />
                <select className="w-full rounded-md border bg-background p-2 text-sm" aria-label="Zgjidh fluturimin" value={flightId} onChange={e => setFlightId(e.target.value)}>
                  <option value="">Zgjidh fluturimin</option>
                  {availableFlights.map(f => <option key={f.id} value={f.id}>{flightLabel(f)}</option>)}
                </select>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <Button type="button" disabled={saving} onClick={addRule}>Shto rregullin</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}