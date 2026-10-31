import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";

declare const __BUILD_VERSION__: string;

const CURRENT_VERSION =
  typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "dev";

const VERSION_URL =
  (import.meta.env.BASE_URL || "/").replace(/\/$/, "") + "/version.json";

const POLL_INTERVAL_MS = 30_000;
const DISMISS_KEY = "km-update-dismissed-version";
// Mbyllja me X e fsheh banner-in vetëm PËRKOHËSISHT — pas 30 min rikthehet,
// që telefonat/tabletët të mos ngelin përgjithmonë me versionin e vjetër.
const DISMISS_AT_KEY = "km-update-dismissed-at";
const DISMISS_TTL_MS = 30 * 60_000;

async function hardRefresh() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
  } catch {}
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {}
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}

export function UpdateNotifier() {
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const refreshInFlight = useRef(false);

  const handleHardRefresh = async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    setRefreshError(false);
    try {
      await hardRefresh();
    } catch {
      refreshInFlight.current = false;
      setRefreshing(false);
      setRefreshError(true);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(VERSION_URL + "?t=" + Date.now(), {
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        if (j?.version && String(j.version) !== String(CURRENT_VERSION)) {
          setServerVersion(String(j.version));
        }
      } catch {}
    };
    check();
    const id = window.setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!serverVersion) return null;

  const dismissed = (() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) !== serverVersion) return false;
      const at = Number(localStorage.getItem(DISMISS_AT_KEY) || 0);
      return at > 0 && Date.now() - at < DISMISS_TTL_MS;
    } catch {
      return false;
    }
  })();
  if (dismissed) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[9999] pointer-events-none w-full max-w-2xl px-3"
      style={{ top: "max(12px, calc(env(safe-area-inset-top) + 8px))" }}
    >
      <div className="pointer-events-auto rounded-xl border-2 border-emerald-500 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 shadow-[0_8px_30px_rgba(16,185,129,0.35)] p-3 sm:p-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:flex animate-in slide-in-from-top-2 fade-in duration-300">
        <div className="col-start-1 row-start-1 shrink-0 h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="col-start-2 row-start-1 flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-900 leading-tight">
            Version i ri i sistemit
          </p>
          <p className="text-xs text-emerald-800/80 leading-tight mt-0.5">
            Klikoni <strong>Bëj Hard Refresh</strong> për të ngarkuar versionin
            më të fundit.
          </p>
          {refreshError && <p role="alert" className="mt-1 text-xs font-semibold text-red-700">Rifreskimi dështoi. Provoni përsëri.</p>}
        </div>
        <Button
          type="button"
          onClick={handleHardRefresh}
          disabled={refreshing}
          className="col-span-3 row-start-2 w-full min-h-12 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-md shrink-0 touch-manipulation sm:w-auto"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span aria-live="polite">{refreshing ? "Duke rifreskuar…" : "Bëj Hard Refresh"}</span>
        </Button>
        <button
          type="button"
          aria-label="Mbyll"
          disabled={refreshing}
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, serverVersion);
              localStorage.setItem(DISMISS_AT_KEY, String(Date.now()));
            } catch {}
            setServerVersion(null);
          }}
          className="col-start-3 row-start-1 shrink-0 h-11 w-11 rounded-md hover:bg-emerald-100 text-emerald-700 flex items-center justify-center transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
