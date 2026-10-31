import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fmtM } from "@/lib/utils";
import type { FlightPriceMap } from "./FlightSearchWidgets";

/** Calendar-only arithmetic: a flight date is a local calendar day, never an instant. */
export function shiftFlightDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function fullFlightDate(date: string, lang: string) {
  const d = new Date(`${date}T12:00:00Z`);
  if (lang.startsWith("en")) {
    const day = d.getUTCDate();
    const suffix = day >= 11 && day <= 13 ? "th" : ({1:"st",2:"nd",3:"rd"} as Record<number,string>)[day % 10] || "th";
    const weekday = new Intl.DateTimeFormat("en-GB", {weekday:"long",timeZone:"UTC"}).format(d);
    const month = new Intl.DateTimeFormat("en-GB", {month:"long",timeZone:"UTC"}).format(d);
    return `${weekday}, ${day}${suffix} ${month}, ${d.getUTCFullYear()}`;
  }
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "sq-AL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(d);
}
export function FlightDateStrip({ value, prices, route, disabled, onChange }: {
  value: string; prices: FlightPriceMap; route: string; disabled?: boolean; onChange: (date: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [offset, setOffset] = useState(0);
  const selected = useRef<HTMLButtonElement>(null);
  const parsed = new Date(`${value}T12:00:00Z`);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
  const base = valid ? value : new Date().toLocaleDateString("sv-SE");
  useEffect(() => { setOffset(0); }, [value, route]);
  useEffect(() => {
    const button = selected.current;
    if (button?.parentElement) button.parentElement.scrollLeft = Math.max(0, button.offsetLeft - button.parentElement.offsetLeft - (button.parentElement.clientWidth - button.clientWidth) / 2);
  }, [value, offset]);
  return <section className="air-date-strip" aria-label={t("Data")}>
    <h2>{t("Nga")}: {route}</h2>
    <div className="air-date-rail">
      <button type="button" className="air-date-arrow" aria-label={i18n.language === "en" ? "Previous dates" : "Datat e mëparshme"} onClick={() => setOffset(n => n - 5)}><ChevronLeft size={18}/></button>
      <div className="air-date-options">{Array.from({length: 5}, (_, i) => {
        const day = shiftFlightDate(base, offset + i - 2);
        const price = prices.get(day);
        return <button type="button" ref={day === value ? selected : undefined} key={day}
          className={`air-date-choice ${day === value ? "selected" : ""}`} aria-pressed={day === value}
          disabled={disabled} onClick={() => onChange(day)}>
          <span>{fullFlightDate(day, i18n.language)}</span>
          <strong>{typeof price === "number" && Number.isFinite(price) ? `€${fmtM(price)}` : "—"}</strong>
        </button>;
      })}</div>
      <button type="button" className="air-date-arrow" aria-label={i18n.language === "en" ? "Next dates" : "Datat e ardhshme"} onClick={() => setOffset(n => n + 5)}><ChevronRight size={18}/></button>
    </div>
  </section>;
}
