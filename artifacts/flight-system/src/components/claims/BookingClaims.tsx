import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileWarning, Link2, Loader2, Plus, Search } from "lucide-react";
import {
  useListClaims, useCreateClaim, useLinkClaimBooking, getListClaimsQueryKey,
  type ClaimRecord,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useModules } from "@/context/ModulesContext";
import { ClaimEditor } from "./ClaimEditor";
import { ClaimStatusBadge, errorMessage } from "./ClaimShared";

const PICK_LIMIT = 10;

export function BookingClaimButton({ bookingId, bookingRef }: { bookingId: number; bookingRef: string }) {
  const { isPathEnabled } = useModules();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "link">("create");
  if (!isPathEnabled("/claim")) return null;
  return <>
    <Button variant="outline" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-300"
      onClick={() => { setMode("create"); setOpen(true); }}>
      <FileWarning className="mr-1.5 h-3.5 w-3.5" /> Claim
    </Button>
    <CreateClaimDialog bookingId={bookingId} bookingRef={bookingRef} open={open && mode === "create"} onClose={() => setOpen(false)} onSwitch={() => setMode("link")} />
    <LinkClaimDialog bookingId={bookingId} open={open && mode === "link"} onClose={() => setOpen(false)} onSwitch={() => setMode("create")} />
  </>;
}

function useDebounced(v: string, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function ClaimModeSelector({ mode, onSwitch, disabled }: { mode: "create" | "link"; onSwitch: () => void; disabled: boolean }) {
  return <div className="flex flex-wrap gap-2 border-b pb-3" aria-label="Veprimi i Claim">
    <Button size="sm" variant={mode === "create" ? "default" : "outline"} aria-pressed={mode === "create"} disabled={disabled} onClick={mode === "link" ? onSwitch : undefined}>
      <Plus className="mr-1.5 h-4 w-4" /> Krijo Claim të ri
    </Button>
    <Button size="sm" variant={mode === "link" ? "default" : "outline"} aria-pressed={mode === "link"} disabled={disabled} onClick={mode === "create" ? onSwitch : undefined}>
      <Link2 className="mr-1.5 h-4 w-4" /> Lidh me Claim ekzistues
    </Button>
  </div>;
}

function CreateClaimDialog({ bookingId, bookingRef, open, onClose, onSwitch }: { bookingId: number; bookingRef: string; open: boolean; onClose: () => void; onSwitch?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateClaim();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const requestIdRef = useRef<string>("");
  const inFlight = useRef(false);

  useEffect(() => {
    if (open) { setTitle(""); setDescription(""); setErr(null); requestIdRef.current = crypto.randomUUID(); }
  }, [open]);

  const submit = () => {
    if (inFlight.current || create.isPending) return;
    const t = title.trim();
    if (!t) { setErr("Titulli është i detyrueshëm."); return; }
    inFlight.current = true; setErr(null);
    // Same requestId is reused on every retry of this submission (idempotent server-side).
    create.mutate({ data: { title: t, description, bookingId, requestId: requestIdRef.current } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListClaimsQueryKey() });
        toast({ title: "Claim u krijua" });
        requestIdRef.current = "";
        onClose();
      },
      onError: (e) => setErr(errorMessage(e)),
      onSettled: () => { inFlight.current = false; },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !create.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Claim i ri</DialogTitle></DialogHeader>
        {onSwitch && <ClaimModeSelector mode="create" onSwitch={onSwitch} disabled={create.isPending} />}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-800">
            <Link2 className="h-3.5 w-3.5" /> Lidhet automatikisht me
            <span className="rounded border border-indigo-200 bg-white px-1.5 py-0.5 font-mono font-bold">{bookingRef}</span>
          </div>
          <Input autoFocus placeholder="Titulli i claim-it..." maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className="font-semibold" />
          <Textarea rows={4} maxLength={10000} placeholder="Përshkrimi..." value={description} onChange={e => setDescription(e.target.value)} />
          {err && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}{" "}<span className="text-red-500">Provoni sërish, kërkesa nuk do të dyfishohet.</span></p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>Anulo</Button>
          <Button onClick={submit} disabled={create.isPending || !title.trim()}>
            {create.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} {err ? "Riprovo" : "Krijo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkClaimDialog({ bookingId, open, onClose, onSwitch }: { bookingId: number; open: boolean; onClose: () => void; onSwitch?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const link = useLinkClaimBooking();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const dq = useDebounced(search.trim());
  useEffect(() => { setPage(0); }, [dq]);
  useEffect(() => { if (open) { setSearch(""); setPage(0); setErr(null); } }, [open]);

  const params = { search: dq || undefined, offset: page * PICK_LIMIT, limit: PICK_LIMIT };
  const q = useListClaims(params, { query: { enabled: open, queryKey: getListClaimsQueryKey(params), placeholderData: (p) => p } });
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PICK_LIMIT));

  const doLink = (c: ClaimRecord) => {
    if (link.isPending) return;
    setErr(null); setLinkingId(c.id);
    link.mutate({ id: c.id, data: { bookingId } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListClaimsQueryKey() });
        toast({ title: `Claim CLM-${c.id} u lidh` });
        onClose();
      },
      onError: (e) => setErr(errorMessage(e)),
      onSettled: () => setLinkingId(null),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !link.isPending && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Lidh një claim ekzistues</DialogTitle></DialogHeader>
        {onSwitch && <ClaimModeSelector mode="link" onSwitch={onSwitch} disabled={link.isPending} />}
        <p className="text-xs text-muted-foreground -mt-2">Lidhja shtohet. Rezervimet e tjera të claim-it mbeten të lidhura.</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-8" placeholder="Kërko sipas titullit, ref, pasagjerit..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="max-h-[50dvh] min-h-40 space-y-1.5 overflow-y-auto">
          {q.isPending ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
          ) : q.isError ? (
            <div className="py-8 text-center text-sm text-red-600">{errorMessage(q.error)} <Button size="sm" variant="link" onClick={() => q.refetch()}>Riprovo</Button></div>
          ) : q.data.items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Asnjë claim nuk përputhet.</div>
          ) : q.data.items.map(c => {
            const already = c.bookings.some(b => b.id === bookingId);
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-500">CLM-{c.id}</span>
                    <ClaimStatusBadge status={c.status} />
                  </div>
                  <p className="truncate text-sm font-semibold">{c.title}</p>
                  <p className="truncate text-[11px] text-slate-500">{c.bookings.map(b => b.bookingRef).join(", ") || "Pa rezervime"}</p>
                </div>
                {already ? (
                  <span className="text-xs font-semibold text-emerald-700">E lidhur</span>
                ) : (
                  <Button size="sm" variant="outline" disabled={link.isPending} onClick={() => doLink(c)}>
                    {linkingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />} Lidh
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {err && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} gjithsej</span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="tabular-nums">{page + 1} / {pages}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BookingClaims({ bookingId, bookingRef }: { bookingId: number; bookingRef: string }) {
  const { isPathEnabled } = useModules();
  const enabled = isPathEnabled("/claim");
  const [createOpen, setCreateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);
  const [page, setPage] = useState(0);
  const limit = 20;
  const params = { bookingId, offset: page * limit, limit };
  const q = useListClaims(params, { query: { enabled, queryKey: getListClaimsQueryKey(params) } });
  if (!enabled) return null;
  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const editing = items.find(c => c.id === selectedClaim?.id) ?? selectedClaim;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileWarning className="h-4 w-4 text-rose-500" /> Claims
          {total > 0 && <span className="rounded-full bg-rose-100 px-2 text-xs font-bold text-rose-700">{total}</span>}
        </CardTitle>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}><Link2 className="mr-1 h-3.5 w-3.5" /> Lidh</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Claim</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {q.isPending ? (
          <><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></>
        ) : q.isError ? (
          <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMessage(q.error)} <Button size="sm" variant="outline" onClick={() => q.refetch()}>Riprovo</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Asnjë claim për këtë rezervim.
          </div>
        ) : items.map(c => (
          <button key={c.id} type="button" onClick={() => setSelectedClaim(c)}
            className="flex w-full items-center gap-3 rounded-lg border bg-white px-3 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-50">
            <span className="font-mono text-[10px] text-slate-500">CLM-{c.id}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.title}</span>
            {c.bookings.length > 1 && <span className="text-[10px] text-slate-500">+{c.bookings.length - 1} rezervime</span>}
            <ClaimStatusBadge status={c.status} />
          </button>
        ))}
        {total > limit && (
          <div className="flex items-center justify-end gap-1 pt-1 text-xs">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span>{page + 1} / {Math.ceil(total / limit)}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </CardContent>
      <CreateClaimDialog bookingId={bookingId} bookingRef={bookingRef} open={createOpen} onClose={() => setCreateOpen(false)} />
      <LinkClaimDialog bookingId={bookingId} open={linkOpen} onClose={() => setLinkOpen(false)} />
      <ClaimEditor claim={editing} open={selectedClaim != null} onClose={() => setSelectedClaim(null)} highlightBookingId={bookingId} />
    </Card>
  );
}
