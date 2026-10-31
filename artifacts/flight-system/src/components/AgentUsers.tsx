import { lazy, Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CreateUserModal = lazy(() => import("@/pages/users").then(m => ({ default: m.CreateUserModal })));
const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
type LinkedUser = { id: number; name: string; email: string; role: string; agentId: number | null; agentName?: string };
export function useAgentUsers(enabled: boolean) {
  return useQuery<LinkedUser[]>({
    queryKey: ["agent-linked-users"], enabled, staleTime: 30000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${API}/admin/users`, { credentials: "include", signal });
      if (!res.ok) throw new Error("Përdoruesit nuk u ngarkuan.");
      return res.json();
    },
  });
}

export function AgentUsers({ agent, onClose }: { agent: { id: number; name: string }; onClose: () => void }) {
  const query = useAgentUsers(true);
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirming, setConfirming] = useState<LinkedUser | null>(null);
  const linked = (query.data ?? []).filter(u => u.agentId === agent.id);
  const candidates = (query.data ?? []).filter(u => u.role !== "admin" && u.agentId !== agent.id &&
    (String(u.id) === selected || `${u.name} ${u.email} ${u.agentName ?? ""}`.toLowerCase().includes(search.toLowerCase())));
  async function refresh() {
    await client.invalidateQueries({ queryKey: ["agent-linked-users"] });
    await client.invalidateQueries({ queryKey: ["/api/agents"] });
  }
  async function link(confirmed = false) {
    const user = confirmed ? confirming : query.data?.find(u => String(u.id) === selected);
    if (!user || busy) return;
    if (!confirmed) { setConfirming(user); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const res = await fetch(`${API}/admin/users/${user.id}/agent-link`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, expectedAgentId: user.agentId ?? null, confirmMove: Boolean(user.agentId) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Lidhja dështoi.");
      setSelected(""); setSuccess("Përdoruesi u lidh me agjentin. Duhet të hyjë përsëri në llogari.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Lidhja dështoi."); }
    finally { setBusy(false); setConfirming(null); }
  }
  if (creating) return <Suspense fallback={<p role="status">Duke ngarkuar formularin…</p>}>
    <CreateUserModal isAdmin fixedAgent={agent} onClose={() => setCreating(false)} onCreated={() => { void refresh(); setSuccess("Përdoruesi u krijua dhe u lidh me agjentin."); }} />
  </Suspense>;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Përdoruesit — {agent.name}</DialogTitle>
        <DialogDescription>Të njëjtat llogari si te “Përdoruesit”. Lidhja jep akses te agjencia në portalin e jashtëm.</DialogDescription></DialogHeader>
      {query.isPending && <p role="status">Duke ngarkuar…</p>}
      {query.isError && <div role="alert">Përdoruesit nuk u ngarkuan. <Button variant="outline" onClick={() => void query.refetch()}>Riprovo</Button></div>}
      {!query.isPending && !query.isError && <div className="rounded-lg border divide-y">
        {linked.length === 0 ? <p className="p-4 text-muted-foreground">Pa përdorues të lidhur.</p> : linked.map(u =>
          <div key={u.id} className="p-3"><strong>{u.name}</strong><p className="text-sm text-muted-foreground break-all">{u.email}</p><p className="text-xs text-muted-foreground">{u.role === "agent" ? "Agjent" : u.role === "manager" ? "Manager" : u.role === "agent_staff" ? "Staf" : u.role}</p></div>)}
      </div>}
      <Button onClick={() => setCreating(true)} disabled={busy || !!confirming}>Krijo përdorues të ri</Button>
      <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <h3 className="font-semibold">Lidh përdorues ekzistues</h3>
        <Input aria-label="Kërko përdorues" placeholder="Kërko emrin ose emailin…" value={search} onChange={e => setSearch(e.target.value)} disabled={busy || !!confirming} />
        <select aria-label="Përdoruesi për t'u lidhur" className="w-full rounded-md border bg-background p-2 text-sm" value={selected} onChange={e => setSelected(e.target.value)} disabled={busy || !!confirming || query.isError || query.isPending}>
          <option value="">Zgjidh përdoruesin</option>
          {candidates.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}{u.agentId ? ` · ${u.agentName || `Agjenti #${u.agentId}`}` : " · Pa agjent"}</option>)}
        </select>
        {!confirming ? <Button onClick={() => void link()} disabled={!selected || busy || query.isError}>Lidh me këtë agjent</Button> : <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
          <p><strong>{confirming.name}</strong> do të ketë akses te {agent.name}.
            {confirming.agentId ? ` Lidhja me ${confirming.agentName || "agjencinë aktuale"} do të zëvendësohet.` : ""}
            {" "}Seancat ekzistuese do të mbyllen dhe përdoruesi duhet të hyjë përsëri. Roli, lejet dhe financat nuk ndryshojnë.</p>
          <div className="flex gap-2"><Button disabled={busy} onClick={() => void link(true)}>{busy ? "Duke lidhur…" : "Po, konfirmo lidhjen"}</Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(null)}>Anulo</Button></div>
        </div>}
      </section>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
    </DialogContent>
  </Dialog>;
}
