import { activityPage } from "./activityDescription";
const queryKeys = ["from", "to", "date", "adults", "children", "infants"];
export function activityPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000 || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://activity.invalid");
    const params = new URLSearchParams();
    for (const key of queryKeys) {
      const v = url.searchParams.get(key);
      if (v && /^[A-Za-z0-9-]{1,32}$/.test(v)) params.set(key, v);
    }
    return (url.pathname + (params.size ? `?${params}` : "")).slice(0, 300);
  } catch { return "/"; }
}
const text = (value: unknown) => typeof value === "string" ? value.replace(/[\r\n\t<>]/g, " ").trim().slice(0, 120) : "";
export function agentActivityEvent(body: any) {
  const path = activityPath(body?.path);
  if (body?.type === "search" || body?.type === "search_result") {
    const s = body.search;
    if (!s || typeof s.from !== "string" || typeof s.to !== "string" || typeof s.date !== "string" ||
        (s.from !== "" && !/^[A-Z]{3}$/i.test(s.from)) || (s.to !== "" && !/^[A-Z]{3}$/i.test(s.to)) ||
        (s.date !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
        !Number.isFinite(Date.parse(`${s.date}T00:00:00Z`)) ||
        new Date(`${s.date}T00:00:00Z`).toISOString().slice(0, 10) !== s.date))) return null;
    const counts = [s.adults, s.children, s.infants];
    if (!counts.every(n => Number.isInteger(n) && n >= 0 && n <= 99) || s.adults < 1) return null;
    const result = body.type === "search_result" ? (body.failed === true ? "Kërkimi dështoi" :
      Number.isInteger(body.count) && body.count >= 0 && body.count <= 100000 ? `U gjetën ${body.count} fluturime` : null) : "";
    if (result === null) return null;
    return { type: "search", method: null, path, statusCode: null,
      description: `${result || "Kërkoi fluturime"}: ${s.from.toUpperCase() || "Të gjitha nisjet"} → ${s.to.toUpperCase() || "Të gjitha mbërritjet"} · ${s.date || "Të gjitha datat"} · ${s.adults + s.children + s.infants} persona (${s.adults} të rritur, ${s.children} fëmijë, ${s.infants} foshnja)` };
  }
  if (body?.type === "click") {
    const label = text(body.label);
    if (!label) return null;
    const target = body.target ? activityPath(body.target) : "";
    return { type: "click", method: null, path, statusCode: null,
      description: `Klikoi: ${label}${target ? ` → ${activityPage(target)}` : ""} · Në: ${activityPage(path)}` };
  }
  if (body?.type && body.type !== "pageview") return null;
  return { type: "pageview", method: null, path, statusCode: null,
    description: `Hapi faqen: ${activityPage(path)}` };
}