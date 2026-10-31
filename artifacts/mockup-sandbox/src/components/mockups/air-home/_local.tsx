import { useState, type AnchorHTMLAttributes } from "react";
import { en } from "./_en";
import type { AirportOption } from "./_Widgets";

export type Language = "sq" | "en";
export function language(): Language {
  return new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "sq";
}
export const i18n = { get language() { return language(); } };
export function setLanguage(lang: Language) {
  const url = new URL(window.location.href);
  if (lang === "sq") url.searchParams.delete("lang");
  else url.searchParams.set("lang", "en");
  window.location.assign(url.toString());
}
export function useTranslation() {
  return { i18n, t: (key: string, values: Record<string, string | number> = {}) => {
    let text = language() === "en" ? en[key] || key : key;
    for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{{${name}}}`, String(value));
    return text;
  }};
}
// Guest-only extraction. Authentication, analytics and routing have no remote effects.
export function useAuth(): {user: null | {name: string; role: string};logout: () => Promise<void>} {
  return { user: null, logout: async () => {} };
}
export function useLocation(): [string, (path: string) => void] {
  const [path, setPath] = useState("/");
  return [path, (next) => { setPath(next); }];
}
export function Link({href, onClick, ...props}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} aria-disabled="true" onClick={e => {e.preventDefault();onClick?.(e);}} />;
}
export function trackFlightSearch(_search: unknown) { /* Local preview: analytics disabled. */ }
export const api = {
  base: "/__mockup/disabled-api",
  getAirports: async (): Promise<AirportOption[]> => [],
  getRoutes: async (): Promise<{from: string; to: string}[]> => [],
  getFlightDates: async (_from?: string, _to?: string): Promise<{dates: {date: string; minPrice: number}[]}> => ({dates: []}),
};
// Dynamic content is deliberately empty: no invented destinations, routes or fares.
export async function getDestinations(): Promise<[]> { return []; }
export function fmtM(n: number | string | null | undefined): string {
  if (n == null || n === "") return "0";
  const num = Number(n);
  return Number.isNaN(num) ? String(n) : String(Math.round(num));
}
