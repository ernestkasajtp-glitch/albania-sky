import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileWarning, Pencil, Search } from "lucide-react";
import { format } from "date-fns";
import { useListClaims, getListClaimsQueryKey, type ListClaimsStatus, type ClaimRecord } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useModules } from "@/context/ModulesContext";
import { ClaimEditor } from "@/components/claims/ClaimEditor";
import { CLAIM_STATUS_META, ClaimBookingRow, ClaimStatusBadge, errorMessage } from "@/components/claims/ClaimShared";
import { cn } from "@/lib/utils";

const LIMIT = 20;

export default function ClaimPage() {
  const { isPathEnabled } = useModules();
  const enabled = isPathEnabled("/claim");
  const [search, setSearch] = useState("");
  const [dq, setDq] = useState("");
  const [status, setStatus] = useState<ListClaimsStatus | "">("");
  const [page, setPage] = useState(0);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);
  useEffect(() => { const t = setTimeout(() => setDq(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(0); }, [dq, status]);

  const params = { search: dq || undefined, status: status || undefined, offset: page * LIMIT, limit: LIMIT };
  const q = useListClaims(params, { query: { enabled, queryKey: getListClaimsQueryKey(params), placeholderData: (p) => p } });
  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const editing = items.find(c => c.id === selectedClaim?.id) ?? selectedClaim;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Claim</h1>
          <p className="text-sm text-muted-foreground">Ankesat e lidhura me rezervimet, përfshirë udhëtimet e anuluara.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="w-64 pl-8" placeholder="Kërko titull, ref, pasagjer..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="inline-flex rounded-lg border bg-slate-50 p-0.5">
            {([["", "Të gjitha"], ...Object.entries(CLAIM_STATUS_META).map(([k, m]) => [k, m.label])] as [string, string][]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setStatus(k as ListClaimsStatus | "")}
                className={cn("rounded-md px-3 py-1 text-xs font-semibold", status === k ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-800")}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {!enabled ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Moduli Claim është i çaktivizuar.</div>
      ) : q.isPending ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
      ) : q.isError ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">
          {errorMessage(q.error)}
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>Riprovo</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border bg-card p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-500"><FileWarning className="h-6 w-6" /></div>
          <p className="font-semibold">{dq || status ? "Asnjë claim nuk përputhet me filtrat." : "Ende nuk ka claims."}</p>
          <p className="text-sm text-muted-foreground">Claims krijohen nga brenda një rezervimi.</p>
        </div>
      ) : (
        <div className={cn("space-y-2 transition-opacity", q.isFetching && "opacity-70")}>
          {items.map(c => (
            <div key={c.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-500">CLM-{c.id}</span>
                    <ClaimStatusBadge status={c.status} />
                    <span className="text-[11px] text-slate-400">Përditësuar {format(new Date(c.updatedAt), "dd MMM yyyy, HH:mm")}</span>
                  </div>
                  <p className="mt-1 font-semibold">{c.title}</p>
                  {c.description && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-slate-600">{c.description}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelectedClaim(c)}><Pencil className="mr-1 h-3.5 w-3.5" /> Ndrysho</Button>
              </div>
              <div className="mt-3 grid gap-1.5 md:grid-cols-2">
                {c.bookings.map(b => <ClaimBookingRow key={b.id} b={b} />)}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
            <span>{total} claims</span>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="tabular-nums">{page + 1} / {pages}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}
      <ClaimEditor claim={editing} open={selectedClaim != null} onClose={() => setSelectedClaim(null)} />
    </div>
  );
}
