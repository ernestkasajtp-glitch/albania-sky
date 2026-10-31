import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { getGoogleLiveAutoEnabled } from "@/hooks/useLiveUpdates";
import { useToast } from "@/hooks/use-toast";
import { fmtM } from "@/lib/utils";
import { resolveGooglePriceDisplay, type GooglePriceValue } from "@/lib/googlePriceCache";
import { Loader2, Globe, RefreshCw, ArrowRight } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface LiveResp {
  ourPrice: number | null;
  savedGooglePrice: number | null;
  newGooglePrice: number | null;
  stale?: boolean;
  hasRule: boolean;
  wouldBeOurPrice: number | null;
  currency: string;
}

interface ApplyResp {
  savedGooglePrice: number;
  ourPrice: number | null;
  ruleApplied: boolean;
}

// Admin-only panel shown when opening a flight or a booking. It fetches the live
// Google price for THIS flight on mount (peek — never writes the cache) and shows
// three prices: our sale price, the saved (cached) Google price, and the new live
// Google price. The "Përditëso çmimin nga Google" button persists the new Google
// price and recomputes our sale price from the active rule (−%/fixed).
export function GooglePriceAdminUpdater({
  flightId,
  enabled = true,
  compact = false,
  onUpdated,
}: {
  flightId?: number | null;
  enabled?: boolean;
  compact?: boolean;
  onUpdated?: (result: ApplyResp) => void;
}) {
  const { user } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const active = isAdmin && !!flightId && enabled;
  // Kërkimi automatik në hapje kontrollohet nga Cilësimet (default: fikur)
  const autoFetch = getGoogleLiveAutoEnabled();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<LiveResp>({
    queryKey: ["google-price-live", flightId],
    enabled: active && autoFetch,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/flights/${flightId}/google-price/live`, { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}) as Record<string, unknown>);
        throw new Error((j as { error?: string })?.error || "Nuk u mor dot çmimi i ri.");
      }
      return res.json();
    },
  });
  // When opened from the flights list, retain the saved-price freshness flag
  // from its display preload instead of trusting the live preview's DB baseline.
  // This is an observer only: it never starts a bulk request or changes scheduling.
  const savedRowsQuery = useQuery<Array<GooglePriceValue & { flightId: number }>>({
    queryKey: ["google-prices-bulk"],
    enabled: false,
  });

  const applyMut = useMutation({
    mutationFn: async (googlePrice: number): Promise<ApplyResp> => {
      const res = await fetch(`${API_BASE}/flights/${flightId}/google-price/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ googlePrice }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}) as Record<string, unknown>);
        throw new Error((j as { error?: string })?.error || "Përditësimi dështoi.");
      }
      return res.json();
    },
    onSuccess: (r) => {
      toast({
        title: "Çmimi u përditësua",
        description: r.ruleApplied
          ? `Google: €${fmtM(r.savedGooglePrice)} → Çmimi ynë: €${fmtM(r.ourPrice ?? 0)}`
          : `Google u ruajt: €${fmtM(r.savedGooglePrice)} (s'ka rregull për këtë fluturim)`,
      });
      queryClient.invalidateQueries({ queryKey: ["google-price-live", flightId] });
      queryClient.invalidateQueries({ queryKey: ["google-flight-price"] });
      queryClient.invalidateQueries({ queryKey: ["google-prices-bulk"] });
      queryClient.invalidateQueries({ queryKey: ["flight-price-history", flightId] });
      onUpdated?.(r);
    },
    onError: (e: unknown) => {
      toast({ title: "Gabim", description: (e as Error)?.message || "Përditësimi dështoi.", variant: "destructive" });
    },
  });

  if (!active) return null;
  const savedRow = savedRowsQuery.data?.find(row => row.flightId === flightId);
  const savedDisplay = resolveGooglePriceDisplay(
    savedRow ?? (data ? { price: data.savedGooglePrice, stale: data.stale } : null),
    isError || savedRowsQuery.isError,
  );
  const liveDisplay = resolveGooglePriceDisplay(
    data ? { price: data.newGooglePrice, stale: data.stale } : null, isError,
  );

  return (
    <div className={`rounded-xl border border-indigo-200 bg-indigo-50/50 text-sm ${compact ? "mt-1.5 px-2 py-1.5 space-y-1" : "px-3 py-2.5 space-y-2"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 inline-flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" /> Çmimi i Google (Admin)
        </span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Rifresko çmimin live nga Google"
          className="text-indigo-500 hover:text-indigo-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isFetching && !data ? (
        <div className="text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Po kontrollohet Google…
        </div>
      ) : !autoFetch && !data && !isError ? (
        <button
          type="button"
          onClick={() => refetch()}
          className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors ${compact ? "py-1" : "py-1.5"}`}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Kontrollo çmimin live nga Google
        </button>
      ) : isLoading && autoFetch ? (
        <div className="text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Po kontrollohet Google…
        </div>
      ) : isError ? (
        <button type="button" onClick={() => refetch()} className="text-amber-600 hover:underline" title={(error as Error)?.message || "Riprovo"}>
          S’ka çmim
        </button>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-y-1">
            <span className="text-muted-foreground">Çmimi ynë:</span>
            <span className="font-semibold text-right tabular-nums">
              {data.ourPrice != null ? `€${fmtM(data.ourPrice)}` : "—"}
            </span>

            <span className="text-muted-foreground">Google i ruajtur:</span>
            <span className="font-semibold text-right tabular-nums">
              {savedDisplay.price != null ? `€${fmtM(savedDisplay.price)}` : savedDisplay.unavailableLabel}
            </span>

            <span className="text-muted-foreground">Google i ri (live):</span>
            <span className="font-bold text-right tabular-nums text-indigo-700">
              {liveDisplay.price != null ? `€${fmtM(liveDisplay.price)}` : liveDisplay.unavailableLabel}
            </span>

            {data.hasRule && data.wouldBeOurPrice != null && (
              <>
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  Çmimi ynë do bëhet <ArrowRight className="h-3 w-3" />
                </span>
                <span className="font-bold text-right tabular-nums text-emerald-700">
                  €{fmtM(data.wouldBeOurPrice)}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            disabled={data.newGooglePrice == null || applyMut.isPending}
            onClick={() => data.newGooglePrice != null && applyMut.mutate(data.newGooglePrice)}
            className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${compact ? "py-1" : "py-1.5"}`}
          >
            {applyMut.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Po përditësohet…</>
            ) : (
              <>Përditëso çmimin nga Google</>
            )}
          </button>

          {!data.hasRule && (
            <p className="text-[11px] text-muted-foreground">
              S'ka rregull Google për këtë fluturim — përditësimi ruan vetëm çmimin e Google (çmimi ynë nuk ndryshon).
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
