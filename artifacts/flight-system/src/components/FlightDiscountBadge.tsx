import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FLIGHT_DISCOUNT_CHANNELS, FLIGHT_DISCOUNT_CHANNEL_LABELS, flightDiscountLabel, type FlightDiscount } from "@/lib/flightDiscount";

// Bit order is stable: Offline, API, Agents, Public. Every nonempty set has
// its own color, independent of the order in which channels were selected.
const CHANNEL_COLORS = [
  "#475569", "#9a3412", "#1d4ed8", "#7e22ce",
  "#be123c", "#0e7490", "#a16207", "#4338ca",
  "#be185d", "#5b21b6", "#0369a1", "#92400e",
  "#4d7c0f", "#b91c1c", "#334155", "#059669",
] as const;

export function FlightDiscountBadge({ discount }: { discount: FlightDiscount }) {
  const [open, setOpen] = useState(false);
  const mask = FLIGHT_DISCOUNT_CHANNELS.reduce((bits, channel, index) =>
    bits | (discount.channels.includes(channel) ? 1 << index : 0), 0);
  const label = `${discount.value}${discount.type === "percent" ? "%" : "€"}`;
  const channelsLabel = discount.channels.map(c => FLIGHT_DISCOUNT_CHANNEL_LABELS[c]).join(", ");
  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="flight-discount-badge"
          data-channel-mask={mask}
          aria-label={`Zbritje ${flightDiscountLabel(discount)}. Zbatohet për: ${channelsLabel}`}
          onClick={event => { event.stopPropagation(); setOpen(value => !value); }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold tabular-nums text-white shadow-sm outline-none ring-offset-2 transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-slate-500"
          style={{ backgroundColor: CHANNEL_COLORS[mask], fontSize: label.length > 5 ? 7 : label.length > 4 ? 8 : 10 }}
        >
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="w-64 border border-slate-200 bg-white p-3 text-slate-800 shadow-lg" onClick={event => event.stopPropagation()}>
        <p className="text-sm font-semibold">Zbritje {flightDiscountLabel(discount)}</p>
        <p className="mb-2 mt-1 text-[11px] text-slate-500">Kanalet ku zbatohet kjo ulje:</p>
        <ul className="space-y-1.5">
          {FLIGHT_DISCOUNT_CHANNELS.map(channel => {
            const included = discount.channels.includes(channel);
            return <li key={channel} className={`flex items-center justify-between gap-2 text-[11px] ${included ? "font-semibold" : "text-slate-400"}`}>
              <span>{FLIGHT_DISCOUNT_CHANNEL_LABELS[channel]}</span>
              <span>{included ? "Përfshihet" : "Nuk përfshihet"}</span>
            </li>;
          })}
        </ul>
        <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-500">Për çdo biletë, pas markup-it. Jo për ekstra/taksa. Vetëm për shitjet e reja.</p>
      </TooltipContent>
    </Tooltip>
  );
}
