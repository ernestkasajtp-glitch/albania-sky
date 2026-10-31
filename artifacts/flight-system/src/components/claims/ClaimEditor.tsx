import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, Save } from "lucide-react";
import {
  useUpdateClaim, getListClaimsQueryKey, useGetClaim, getGetClaimQueryKey,
  type ClaimRecord, type ClaimRecordStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CLAIM_STATUS_META, ClaimBookingRow, errorMessage, errorStatus } from "./ClaimShared";

/** `claim` should always be the freshest server copy (parent re-reads from list cache). */
export function ClaimEditor({ claim, open, onClose, highlightBookingId }: {
  claim: ClaimRecord | null; open: boolean; onClose: () => void; highlightBookingId?: number;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateClaim();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ClaimRecordStatus>("open");
  const [baseVersion, setBaseVersion] = useState(1);
  const [conflict, setConflict] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const initFor = useRef<number | null>(null);
  // A concurrent status/title edit can move the record outside the list's
  // filters. Load by ID to recover without discarding the user's draft.
  const latestQuery = useGetClaim(claim?.id ?? 0, { query: { queryKey: getGetClaimQueryKey(claim?.id ?? 0), enabled: open && conflict && !!claim, retry: false } });

  useEffect(() => {
    if (!open) { initFor.current = null; return; }
    if (claim && initFor.current !== claim.id) {
      initFor.current = claim.id;
      setTitle(claim.title); setDescription(claim.description); setStatus(claim.status);
      setBaseVersion(claim.version); setConflict(false); setErr(null);
    }
  }, [open, claim]);

  if (!claim) return null;
  const latest = latestQuery.data && latestQuery.data.version > claim.version ? latestQuery.data : claim;
  const serverNewer = latest.version > baseVersion;
  const dirty = title !== claim.title || description !== claim.description || status !== claim.status;

  const save = () => {
    if (update.isPending) return;
    const t = title.trim();
    if (!t) { setErr("Titulli është i detyrueshëm."); return; }
    setErr(null);
    update.mutate({ id: claim.id, data: { title: t, description, status, version: baseVersion } }, {
      onSuccess: (rec) => {
        qc.invalidateQueries({ queryKey: getListClaimsQueryKey() });
        setBaseVersion(rec.version); setConflict(false);
        toast({ title: "Claim u ruajt" });
        onClose();
      },
      onError: (e) => {
        if (errorStatus(e) === 409) {
          setConflict(true);
          qc.invalidateQueries({ queryKey: getListClaimsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetClaimQueryKey(claim.id) });
        } else setErr(errorMessage(e));
      },
    });
  };

  const loadServer = () => {
    setTitle(latest.title); setDescription(latest.description); setStatus(latest.status);
    setBaseVersion(latest.version); setConflict(false);
  };
  const keepDraft = () => { setBaseVersion(latest.version); setConflict(false); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !update.isPending && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-xs rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">CLM-{claim.id}</span>
            Ndrysho Claim
          </DialogTitle>
        </DialogHeader>
        {conflict && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Ky claim u ndryshua nga dikush tjetër.</p>
                <p className="text-xs mt-0.5">Drafti juaj nuk u ruajt dhe nuk është prekur. Zgjidhni si të vazhdoni.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={loadServer} disabled={!serverNewer}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Ngarko versionin e ri (hiq draftin)
                  </Button>
                  <Button size="sm" onClick={keepDraft} disabled={!serverNewer}>
                    Mbaj draftin mbi versionin e ri
                  </Button>
                  {!serverNewer && (latestQuery.isError
                    ? <Button size="sm" variant="outline" onClick={() => latestQuery.refetch()}>Riprovo marrjen e versionit të ri</Button>
                    : <span className="inline-flex items-center gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> Po merret versioni i ri…</span>)}
                </div>
                {serverNewer && (
                  <div className="mt-2 rounded border border-amber-200 bg-white/70 p-2 text-xs">
                    <p><b>Në server:</b> {latest.title} · {CLAIM_STATUS_META[latest.status].label}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Titulli</label>
            <Input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} className="font-semibold" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Përshkrimi</label>
            <Textarea rows={5} maxLength={10000} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Statusi</label>
            <div className="inline-flex rounded-lg border bg-slate-50 p-0.5">
              {(Object.keys(CLAIM_STATUS_META) as ClaimRecordStatus[]).map(s => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={cn("rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                    status === s ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-800")}>
                  <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", CLAIM_STATUS_META[s].dot)} />
                  {CLAIM_STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Rezervimet e lidhura ({claim.bookings.length})</label>
            <div className="space-y-1.5">
              {claim.bookings.map(b => <ClaimBookingRow key={b.id} b={b} highlight={b.id === highlightBookingId} />)}
            </div>
          </div>
          {err && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>Mbyll</Button>
          <Button onClick={save} disabled={update.isPending || conflict || !dirty}>
            {update.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Ruaj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
