// Load code on navigation intent, never data or permissions. Route guards still
// run normally; failed preloads are retried by the normal lazy route loader.
const loaders: Record<string, () => Promise<unknown>> = {
  "/": () => import("../pages/dashboard"),
  "/flights": () => import("../pages/flights"),
  "/bookings": () => import("../pages/bookings"),
  "/agents": () => import("../pages/agents"),
  "/payments": () => import("../pages/payments"),
  "/passengers": () => import("../pages/passengers"),
};
const pending = new Map<string, Promise<unknown>>();
export function preloadNavigation(href: string) {
  const path = href.split("?")[0];
  const loader = loaders[path];
  if (!loader || pending.has(path)) return;
  const job = loader().catch(() => { pending.delete(path); });
  pending.set(path, job);
}