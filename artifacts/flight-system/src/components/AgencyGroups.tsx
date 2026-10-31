import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsCard as Card } from "@/components/settings/SettingsCard";
import { Input } from "@/components/ui/input";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
export type GroupRule = { id: number; groupId: number; airport: string; direction: "either" | "from" | "to"; dateFrom: string | null; dateTo: string | null };
export type AgencyGroup = { id: number; name: string; agentCount: number; rules: GroupRule[] };

export async function groupRequest<T>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch(`${API}/booking-engine/agency-groups${path}`, {
    method, credentials: "include",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || `Kërkesa dështoi (${response.status}).`);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export const groupQueryKey = ["agency-groups"];
export function useAgencyGroups(enabled = true) {
  return useQuery({ queryKey: groupQueryKey, queryFn: () => groupRequest<AgencyGroup[]>(""), enabled, staleTime: 30_000 });
}

export function GroupSelector({ value, onChange, required = false, disabled = false }: {
  value: number | null; onChange: (id: number | null) => void; required?: boolean; disabled?: boolean;
}) {
  const { data, isLoading, error } = useAgencyGroups();
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium" htmlFor="agency-group">Grupi i agjencisë{required ? " *" : ""}</label>
      <select id="agency-group" className="w-full rounded-md border bg-background p-2 text-sm" value={value ?? ""}
        required={required} disabled={disabled || isLoading || !!error} onChange={event => onChange(event.target.value ? Number(event.target.value) : null)}>
        <option value="">{isLoading ? "Po ngarkohen grupet..." : "Zgjidh grupin"}</option>
        {data?.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
      {error && <p role="alert" className="text-sm text-red-600">{(error as Error).message}</p>}
      {value !== null && data?.find(group => group.id === value)?.rules.length === 0 &&
        <p className="text-xs text-amber-700">Grupi pa rregulla nuk lejon asnjë fluturim, përveç atyre të lejuara nga rregullat e veçanta të agjencisë.</p>}
    </div>
  );
}

export function AgencyGroupsSettings() {
  const client = useQueryClient();
  const { data: groups, isLoading, error: loadError } = useAgencyGroups();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [rename, setRename] = useState("");
  const [airport, setAirport] = useState("");
  const [direction, setDirection] = useState<GroupRule["direction"]>("either");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const group = groups?.find(item => item.id === selectedId) ?? null;
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try {
      await action();
      await Promise.all([
        client.invalidateQueries({ queryKey: groupQueryKey }),
        client.invalidateQueries({ queryKey: ["/api/agents"] }),
      ]);
    }
    catch (err) { setError(err instanceof Error ? err.message : "Ndryshimi nuk u ruajt."); }
    finally { setBusy(false); }
  };
  const label = (rule: GroupRule) => `${rule.airport}: ${rule.direction === "either"
    ? "nisje OSE mbërritje" : rule.direction === "from" ? "vetëm nisje" : "vetëm mbërritje"} · ${
    rule.dateFrom && rule.dateTo ? `${rule.dateFrom} – ${rule.dateTo}` : "Pa afat"}`;
  const clearEditor = () => {
    setEditingId(null); setAirport(""); setDirection("either"); setDateFrom(""); setDateTo("");
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Grupet e agjencive</CardTitle>
        <p className="text-sm text-muted-foreground">Grupi është i detyrueshëm për të parë dhe rezervuar fluturime. Fluturimet përputhen me cilindo rregull grupi (OSE); rregullat e veçanta të agjencisë shtohen gjithashtu. Grupi pa rregulla nuk lejon fluturime, përveç atyre të lejuara nga agjencia. Datat kufizojnë nisjen, duke përfshirë të dy skajet. Rregullat e vjetra pa data vlejnë pa afat derisa t'i ndryshoni.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p>Po ngarkohen grupet...</p>}
        {loadError && <p role="alert" className="text-red-600">{(loadError as Error).message}</p>}
        <div className="flex gap-2">
          <Input aria-label="Emri i grupit të ri" placeholder="Emri i grupit të ri" value={newName} onChange={e => setNewName(e.target.value)} />
          <Button disabled={busy || !newName.trim()} onClick={() => perform(async () => {
            const created = await groupRequest<AgencyGroup>("", "POST", { name: newName.trim() });
            setSelectedId(created.id); setNewName("");
          })}>Krijo grupin</Button>
        </div>
        <div className="flex flex-wrap gap-2">{groups?.map(item =>
          <Button key={item.id} variant={item.id === group?.id ? "default" : "outline"} onClick={() => { setSelectedId(item.id); setRename(item.name); clearEditor(); }}>
            {item.name} ({item.agentCount} agjenci)
          </Button>)}</div>
        {groups?.length === 0 && <p className="text-sm text-muted-foreground">Nuk ka grupe ende.</p>}
        {group && <div className="space-y-4 rounded-md border p-4">
          <h3 className="font-semibold">{group.name} · {group.agentCount} agjenci</h3>
          <div className="flex gap-2">
            <Input aria-label="Emri i ri i grupit" value={rename} onChange={e => setRename(e.target.value)} />
            <Button variant="outline" disabled={busy || !rename.trim() || rename.trim() === group.name} onClick={() => perform(() => groupRequest(`/${group.id}`, "PATCH", { name: rename.trim() }))}>Riemërto</Button>
            <Button variant="destructive" disabled={busy || group.agentCount > 0} onClick={() => {
              if (window.confirm(`Të fshihet grupi "${group.name}"?`)) perform(async () => { await groupRequest(`/${group.id}`, "DELETE"); setSelectedId(null); });
            }}>Fshi</Button>
          </div>
          {group.agentCount > 0 && <p className="text-xs text-muted-foreground">Grupi nuk fshihet derisa ka agjenci të caktuara.</p>}
          {group.rules.length === 0 && <p className="text-sm text-amber-700">Pa rregulla grupi: asnjë fluturim nuk lejohet, përveç atyre nga rregullat e veçanta të agjencisë.</p>}
          {group.rules.map(rule => <div key={rule.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <span>{label(rule)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => {
              setEditingId(rule.id); setAirport(rule.airport); setDirection(rule.direction);
              setDateFrom(rule.dateFrom ?? ""); setDateTo(rule.dateTo ?? "");
            }}>Ndrysho</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => {
              if (window.confirm(group.rules.length === 1
                ? "Ky është rregulli i fundit. Pas heqjes, grupi nuk lejon asnjë fluturim, përveç rregullave të veçanta të agjencive. Vazhdoni?"
                : `Të hiqet rregulli ${label(rule)}?`))
                perform(() => groupRequest(`/${group.id}/rules/${rule.id}`, "DELETE"));
            }}>Hiq</Button></div>
          </div>)}
          <div className="flex flex-wrap items-end gap-2">
            <Input aria-label="Kodi i aeroportit" className="w-32" maxLength={3} placeholder="TIA" value={airport} onChange={e => setAirport(e.target.value.toUpperCase())} />
            <select aria-label="Drejtimi" className="rounded-md border bg-background p-2 text-sm" value={direction} onChange={e => setDirection(e.target.value as GroupRule["direction"])}>
              <option value="either">Nisje OSE mbërritje</option><option value="from">Vetëm nisje</option><option value="to">Vetëm mbërritje</option>
            </select>
            <div><label htmlFor="group-rule-from" className="block text-xs">Nga data e nisjes</label>
              <Input id="group-rule-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
            <div><label htmlFor="group-rule-to" className="block text-xs">Deri në datën e nisjes</label>
              <Input id="group-rule-to" type="date" min={dateFrom} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
            <Button disabled={busy || !/^[A-Z]{3}$/.test(airport) || !dateFrom || !dateTo || dateFrom > dateTo} onClick={() => perform(async () => {
              if (editingId !== null) await groupRequest(`/${group.id}/rules/${editingId}`, "PATCH", { airport, direction, dateFrom, dateTo });
              else await groupRequest(`/${group.id}/rules`, "POST", { airport, direction, dateFrom, dateTo });
              clearEditor();
            })}>{editingId !== null ? "Ruaj rregullin" : "Shto rregullin"}</Button>
            {editingId !== null && <Button variant="outline" disabled={busy} onClick={clearEditor}>Anulo</Button>}
          </div>
        </div>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}