import { useEffect, useState } from "react";
import "./offer.css";

export const colorKeys = ["background", "border", "title", "discount", "description", "periods", "countdownTitle", "countdownNumbers", "countdownLabels", "countdownBackground", "countdownBorder", "expiry"] as const;
export type ColorKey = typeof colorKeys[number];
export type Colors = Record<ColorKey, string>;
export const defaultColors: Colors = { background: "#BD3348", border: "#E88797", title: "#FFFFFF", discount: "#FFFFFF", description: "#FFFFFF", periods: "#FFFFFF", countdownTitle: "#FFFFFF", countdownNumbers: "#FFFFFF", countdownLabels: "#FFFFFF", countdownBackground: "#C95064", countdownBorder: "#DC8493", expiry: "#FFFFFF" };
export interface Offer {
  id: string; type: "percent" | "fixed"; value: number; periods: { from: string; to: string }[];
  startsAtMs: number; endsAtMs: number; endsAt: string; colors: Colors;
}
export interface Clock { serverNow: number; receivedAt: number }
export function useOfferNow(clock?: Clock) {
  const [, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  return Date.now() + (clock ? clock.serverNow - clock.receivedAt : 0);
}
const dateOnly = (value: string) => value.split("-").reverse().join(".");
export function OfferBanner({ offer, now }: { offer: Offer; now: number }) {
  const c = offer.colors;
  const remaining = Math.max(0, Math.ceil((offer.endsAtMs - now) / 1000));
  const units = [
    [Math.floor(remaining / 86400), "DAYS"],
    [Math.floor(remaining / 3600) % 24, "HRS"],
    [Math.floor(remaining / 60) % 60, "MIN"],
    [remaining % 60, "SEC"],
  ] as const;
  const periodText = offer.periods.map(p => `${dateOnly(p.from)}–${dateOnly(p.to)}`).join("; ");
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Tirane", day: "2-digit", month: "2-digit", year: "numeric" }).format(offer.endsAtMs);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Tirane", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(offer.endsAtMs);
  return <section className="offer-box" lang="en" aria-label="Limited-time offer" data-testid={`offer-banner-${offer.id}`} style={{ background: c.background, borderColor: c.border }}>
    <div>
      <div className="offer-title" style={{ color: c.title }}>LIMITED-TIME OFFER</div>
      <div className="offer-value" style={{ color: c.discount }} data-testid="offer-discount">{new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(offer.value)}{offer.type === "percent" ? "%" : " €"} OFF</div>
      <div className="offer-description" style={{ color: c.description }}>On selected flights</div>
      <div className="offer-periods" tabIndex={0} role="region" aria-label={`Departures ${periodText}`} title={`Departures ${periodText}`} style={{ color: c.periods }}>Departures {periodText}</div>
    </div>
    <div>
      <div className="offer-clock-title" style={{ color: c.countdownTitle }}>Offer ends in</div>
      <div className="offer-digits" aria-label={`${units.map(([n, l]) => `${n} ${l}`).join(", ")}`} role="timer">
        {units.map(([n, label]) => <div key={label}><div className="offer-number" style={{ color: c.countdownNumbers, background: c.countdownBackground, borderColor: c.countdownBorder }}>{String(n).padStart(2, "0")}</div><div className="offer-unit" style={{ color: c.countdownLabels }}>{label}</div></div>)}
      </div>
      <div className="offer-expiry" style={{ color: c.expiry }}>Ends {date} at {time}</div>
    </div>
  </section>;
}
