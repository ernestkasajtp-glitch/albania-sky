import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicEnrollment } from "@workspace/api-client-react";
import { useAgencyGroups } from "./AgencyGroups";
import { Button } from "./ui/button";
const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}/admin/enrollments${path}`, {
    credentials: "include", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Kërkesa dështoi.");
  return data;
}
export function usePendingEnrollmentCount(enabled: boolean) {
  return useQuery({ queryKey: ["enrollments", "count"], queryFn: () => request<{ count: number }>("/count"), enabled, staleTime: 0 });
}
export function PublicEnrollments() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["enrollments", "list"], queryFn: () => request<PublicEnrollment[]>(""), staleTime: 0 });
  const groups = useAgencyGroups();
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const visibleRows = query.data?.filter(row => !row.approvedAt || row.activationStatus !== "sent" || row.notificationStatus !== "sent");
  const act = async (id: number, action: string, body: unknown) => {
    setBusy(id); setError(""); setMessage("");
    try {
      const result = await request<{ emailStatus: string; emailError: string | null }>(`/${id}/${action}`, body);
      setMessage(action === "approve" ? "Llogaria u miratua." : "Statusi i emailit u përditësua.");
      if (result.emailStatus !== "sent") setError(result.emailError || "Emaili nuk është konfirmuar si i dërguar. Kontrolloni statusin më poshtë.");
      await client.invalidateQueries({ queryKey: ["enrollments"] });
      await client.invalidateQueries({ queryKey: ["/api/agents"] });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };
  return <section className="mb-6 rounded-xl border bg-card p-5 space-y-4" data-testid="pending-enrollments">
    <h2 className="text-xl font-bold">Regjistrimet në pritje të konfirmimit</h2>
    <p className="text-sm text-muted-foreground">Klientët dhe agjentët e rinj aktivizohen vetëm pasi zgjidhni grupin dhe i miratoni. Llogaritë ekzistuese nuk preken.</p>
    {(query.isPending || groups.isPending) && <p>Duke ngarkuar...</p>}
    {(query.error || groups.error) && <p role="alert" className="text-red-600">{(query.error || groups.error)?.message}</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {message && <p role="status" className="text-green-700">{message}</p>}
    {visibleRows?.length === 0 && <p>Nuk ka regjistrime ose email-e në pritje për shqyrtim.</p>}
    {visibleRows?.map(row => <div key={row.userId} className="rounded-lg border p-4 space-y-2" data-testid={`enrollment-${row.userId}`}>
      <div className="flex flex-wrap gap-2 items-center"><strong>{row.name}</strong><span>{row.role === "agent" ? "Agjent" : "Klient"}</span><span className={row.approvedAt ? "text-green-700" : "text-red-600"}>{row.approvedAt ? "Miratuar" : "Në pritje"}</span></div>
      <p className="text-sm">{row.email} {row.company ? `— ${row.company}` : ""}</p>
      <p className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</p>
      {row.approvedAt && <p className="text-sm">Grupi: {groups.data?.find(group => group.id === row.groupId)?.name ?? `#${row.groupId}`}</p>}
      {!row.approvedAt && <div className="flex flex-wrap gap-2">
        <select data-testid={`select-enrollment-group-${row.userId}`} aria-label={`Grupi për ${row.name}`} className="h-10 rounded border bg-background px-2" disabled={busy !== null || !!groups.error} value={selected[row.userId] || ""} onChange={e => setSelected(s => ({ ...s, [row.userId]: e.target.value }))}>
          <option value="">Zgjidh grupin</option>{groups.data?.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <Button data-testid={`button-approve-user-${row.userId}`} disabled={busy !== null || !selected[row.userId]} onClick={() => void act(row.userId, "approve", { groupId: Number(selected[row.userId]) })}>{busy === row.userId ? "Duke miratuar..." : "Cakto grupin dhe aprovo"}</Button>
      </div>}
      {(["notification", ...(row.approvedAt ? ["activation"] : [])] as ("notification" | "activation")[]).map(kind => {
        const status = kind === "activation" ? row.activationStatus : row.notificationStatus;
        const detail = kind === "activation" ? row.activationError : row.notificationError;
        return <div key={kind} className="text-sm">
          <span>{kind === "activation" ? "Emaili i aktivizimit" : "Emaili i njoftimit"}: {status === "sent" ? "Dërguar" : status === "failed" ? "Dështoi" : status === "pending" ? "Në pritje" : "Dorëzim ende i pakonfirmuar"}</span>
          {detail && <p className="text-amber-700">{detail}</p>}
          {["failed", "pending"].includes(status) && <Button data-testid={`button-retry-${kind}-${row.userId}`} className="ml-2" variant="outline" size="sm" disabled={busy !== null} onClick={() => void act(row.userId, "retry-email", { kind })}>Riprovo emailin</Button>}
          {["unknown", "sending"].includes(status) && <p className="text-amber-700">Kontrolloni dërgimin në serverin e emailit; nuk ridërgohet automatikisht për të shmangur dyfishimin.</p>}
        </div>;
      })}
    </div>)}
  </section>;
}