import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetFlightQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getFlightDiscount, hasInvalidFlightDiscountChannels, validateFlightDiscount, validateFlightDiscountChannels, flightDiscountLabel, flightDiscountChannelsLabel, FLIGHT_DISCOUNT_CHANNELS, FLIGHT_DISCOUNT_CHANNEL_LABELS, DEFAULT_FLIGHT_DISCOUNT_CHANNELS, type FlightDiscountChannel, type FlightDiscountInput } from "@/lib/flightDiscount";

import { flightDiscountUrl, readSavedFlightDiscount } from "@/lib/flightDiscountApi";

/** Admin-only flight discount editor. Uses only type="button" — safe inside an outer <form>. */
export function FlightDiscountEditor({ flightId, flight, onSaved }: { flightId: number; flight: unknown; onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasManual = !!flight && typeof flight === "object" && "manualFlightDiscount" in flight;
  const current = getFlightDiscount(hasManual
    ? { flightDiscount: (flight as { manualFlightDiscount: unknown }).manualFlightDiscount } : flight);
  const campaignApplies = hasManual && !current && !!getFlightDiscount(flight);
  const invalidChannels = hasInvalidFlightDiscountChannels(flight);
  const [type, setType] = useState<"percent" | "fixed">(current?.type ?? "percent");
  const [value, setValue] = useState(current ? String(current.value) : "");
  const [channels, setChannels] = useState<FlightDiscountChannel[]>(current?.channels ?? [...DEFAULT_FLIGHT_DISCOUNT_CHANNELS]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const curKey = current ? `${current.type}:${current.value}:${current.channels.join(",")}` : "none";

  useEffect(() => {
    setType(current?.type ?? "percent");
    setValue(current ? String(current.value) : "");
    setChannels(current?.channels ?? [...DEFAULT_FLIGHT_DISCOUNT_CHANNELS]);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightId, curKey]);

  const submit = async (discount: FlightDiscountInput | null) => {
    setPending(true); setError(null);
    try {
      const res = await fetch(flightDiscountUrl(import.meta.env.BASE_URL, flightId), {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discount ? discount : { discount: null }),
      });
      const saved = await readSavedFlightDiscount(res, discount);
      queryClient.setQueryData(getGetFlightQueryKey(flightId), (old: any) => old ? { ...old, manualFlightDiscount: saved } : old);
      queryClient.invalidateQueries({ queryKey: getGetFlightQueryKey(flightId) });
      queryClient.invalidateQueries({ queryKey: ["flights-paginated"] });
      queryClient.invalidateQueries({ queryKey: ["/api/flights"] });
      toast({ title: saved ? `Zbritja u ruajt (${flightDiscountLabel(saved)} · ${flightDiscountChannelsLabel(saved.channels)})` : "Zbritja u hoq" });
      onSaved?.();
    } catch (e: any) {
      setError(e?.message || "Ruajtja dështoi");
    } finally { setPending(false); }
  };

  const onSave = () => {
    const err = validateFlightDiscount(type, value);
    if (err) { setError(err); return; }
    const chErr = validateFlightDiscountChannels(channels);
    if (chErr) { setError(chErr); return; }
    submit({ type, value: Number(value), channels: FLIGHT_DISCOUNT_CHANNELS.filter(c => channels.includes(c)) });
  };

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2" data-testid="flight-discount-editor">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-800">Zbritje fluturimi</p>
        {current && <span className="text-[10px] font-bold rounded bg-emerald-600 text-white px-1.5 py-0.5">DISCOUNT {flightDiscountLabel(current)}</span>}
      </div>
      <p className="text-[10px] text-stone-500 leading-snug">Aplikohet për çdo biletë (edhe foshnjë) pas rregullave të agjencisë dhe markup-it. Jo për ekstra/taksa. Vetëm shitjet e reja.</p>
      {campaignApplies && <p className="text-xs font-medium text-emerald-800">Ky fluturim ka një ofertë aktive nga faqja Discount. Zbritja manuale më poshtë e zëvendëson, nuk i shtohet asaj.</p>}
      {invalidChannels && <p className="text-[11px] font-semibold text-rose-600" data-testid="flight-discount-invalid-channels">Zbritja e ruajtur ka kanale të pavlefshme dhe nuk aplikohet. Zgjidh kanalet dhe ruaj përsëri, ose hiqe.</p>}
      {current && <p className="text-[10px] font-semibold text-emerald-800" data-testid="flight-discount-current-channels">Aktive për: {flightDiscountChannelsLabel(current.channels)}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="flight-discount-channels">
        <span className="text-[10px] uppercase tracking-wider font-bold text-stone-500">Kanalet:</span>
        {FLIGHT_DISCOUNT_CHANNELS.map(c => (
          <label key={c} className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-700 cursor-pointer">
            <input type="checkbox" className="h-3.5 w-3.5 accent-emerald-700" disabled={pending} checked={channels.includes(c)}
              data-testid={`flight-discount-channel-${c}`}
              onChange={e => { setError(null); setChannels(prev => e.target.checked ? [...prev, c] : prev.filter(x => x !== c)); }} />
            {FLIGHT_DISCOUNT_CHANNEL_LABELS[c]}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-stone-200 overflow-hidden text-xs font-semibold">
          {(["percent", "fixed"] as const).map(t => (
            <button key={t} type="button" disabled={pending} onClick={() => { setType(t); setError(null); }}
              className={t === type ? "px-2.5 py-1.5 bg-emerald-700 text-white" : "px-2.5 py-1.5 bg-white text-stone-600 hover:bg-stone-50"}>
              {t === "percent" ? "%" : "€ fikse"}
            </button>
          ))}
        </div>
        <input type="number" min="0" step="any" max={type === "percent" ? 100 : undefined} value={value} disabled={pending}
          onChange={e => { setValue(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onSave(); } }}
          placeholder={type === "percent" ? "p.sh. 10" : "p.sh. 15"}
          className="w-24 h-8 px-2 text-right rounded-md border border-stone-200 bg-white text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-200" />
        <button type="button" onClick={onSave} disabled={pending || channels.length === 0}
          className="h-8 px-3 rounded-md bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">
          {pending ? "Duke ruajtur…" : "Ruaj zbritjen"}
        </button>
        {(current || invalidChannels) && (
          <button type="button" onClick={() => submit(null)} disabled={pending}
            className="h-8 px-3 rounded-md border border-rose-200 text-rose-700 bg-white text-xs font-bold disabled:opacity-50">
            Hiq
          </button>
        )}
      </div>
      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
    </div>
  );
}
