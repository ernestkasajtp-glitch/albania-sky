import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
const exclusionsUrl = `${API_BASE}/booking-engine/default-visibility-exclusions`;

type Agency = { id: number; name: string; excluded: boolean };

export function AgencyVisibilityExclusions() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(exclusionsUrl, { credentials: "include" }),
      fetch(`${API_BASE}/agents`, { credentials: "include" }),
    ])
      .then(async ([exclusionsResponse, agentsResponse]) => {
        if (!exclusionsResponse.ok || !agentsResponse.ok) throw new Error("Agjencitë nuk u ngarkuan.");
        const exclusions = await exclusionsResponse.json() as Agency[];
        const agents = await agentsResponse.json() as Array<{ id: number; groupId: number | null }>;
        const ungrouped = new Set(agents.filter(agent => agent.groupId == null).map(agent => agent.id));
        return exclusions.filter(agency => ungrouped.has(agency.id));
      })
      .then(data => { if (active) setAgencies(data); })
      .catch(err => { if (active) setLoadError(err instanceof Error ? err.message : "Agjencitë nuk u ngarkuan."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const excluded = useMemo(() => agencies.filter(agency => agency.excluded), [agencies]);
  const results = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? agencies.filter(agency => !agency.excluded && agency.name.toLocaleLowerCase().includes(query)).slice(0, 20)
      : [];
  }, [agencies, search]);

  const changeExclusion = async (agency: Agency, shouldExclude: boolean) => {
    if (!window.confirm(shouldExclude
      ? `Të përjashtohet ${agency.name} nga rregullat default? Nëse nuk ka rregulla të veta, agjencia kthehet te dukshmëria e mëparshme dhe mund të shohë më shumë fluturime.`
      : `Të hiqet përjashtimi për ${agency.name}? Rregullat default do të zbatohen menjëherë te kjo agjenci.`
    )) return;
    setPendingId(agency.id);
    setError("");
    try {
      const response = await fetch(`${exclusionsUrl}/${agency.id}`, {
        method: shouldExclude ? "PUT" : "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Ndryshimi nuk u ruajt.");
      }
      setAgencies(current => current.map(entry => entry.id === agency.id ? { ...entry, excluded: shouldExclude } : entry));
      if (shouldExclude) setSearch("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ndryshimi nuk u ruajt.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Përjashtimet – VETËM agjencitë pa grup</CardTitle>
        <p className="text-sm text-muted-foreground">
          Kërkoni agjencitë pa grup që nuk duhet të marrin rregullat e përgjithshme. Rregullat e veçanta të agjencisë mbeten aktive.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Po ngarkohen agjencitë...</p> : loadError ? (
          <p role="alert" className="text-sm text-red-600">{loadError}</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium">Agjencitë e përjashtuara ({excluded.length})</p>
              {excluded.length === 0 ? <p className="text-sm text-muted-foreground">Asnjë agjenci nuk është përjashtuar.</p> : (
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {excluded.map(agency => (
                    <div key={agency.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm">
                      <span>{agency.name}</span>
                      <Button type="button" variant="outline" size="sm" disabled={pendingId !== null}
                        onClick={() => changeExclusion(agency, false)}>Hiq përjashtimin</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="agency-exclusion-search" className="text-sm font-medium">Kërko agjencinë për ta përjashtuar</label>
              <Input id="agency-exclusion-search" value={search} onChange={event => setSearch(event.target.value)}
                placeholder="Shkruani emrin e agjencisë..." />
              {search.trim() && (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {results.length === 0 ? <p className="text-sm text-muted-foreground">Nuk u gjet asnjë agjenci.</p> : results.map(agency => (
                    <div key={agency.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm">
                      <span>{agency.name}</span>
                      <Button type="button" variant="outline" size="sm" disabled={pendingId !== null}
                        onClick={() => changeExclusion(agency, true)}>Përjashto</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}