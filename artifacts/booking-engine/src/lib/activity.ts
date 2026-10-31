type Search = { from: string; to: string; date: string; adults: number; children: number; infants: number };
const keys = ["from", "to", "date", "adults", "children", "infants"];
let active = false;
export function setActivityTracking(enabled: boolean) { active = enabled; }
export function safeActivityPath(raw = window.location.href) {
  try {
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin) return "";
    const params = new URLSearchParams();
    keys.forEach(k => { const v = url.searchParams.get(k); if (v && /^[A-Za-z0-9-]{1,32}$/.test(v)) params.set(k, v); });
    return (url.pathname + (params.size ? `?${params}` : "")).slice(0, 300);
  } catch { return ""; }
}
export function trackActivity(event: { type: "click" | "search" | "pageview" | "search_result"; label?: string; target?: string; search?: Search; count?: number; failed?: boolean }) {
  if (!active) return;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/../api";
  // keepalive preserves navigation/logout clicks; never wait or interfere with UI.
  void fetch(`${base}/public/track-visit`, {
    method: "POST", credentials: "include", keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...event, path: safeActivityPath() }),
  }).catch(() => {});
}
export function trackFlightSearch(search: Search) {
  trackActivity({ type: "search", search });
}