import { useBannerConfigs } from "@/hooks/use-banner-configs";
import { Link } from "wouter";
import { useOfferNow } from "../banner/OfferBanner";

const deadline = new Intl.DateTimeFormat("sq-AL", {
  timeZone: "Europe/Tirane", day: "numeric", month: "long",
  year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function remainingTime(end: number, now: number) {
  const minutes = Math.max(1, Math.ceil((end - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60) % 24;
  return [days ? `${days} ditë` : "", hours ? `${hours} orë` : "", `${minutes % 60} min`].filter(Boolean).join(" ");
}

export function AdminOfferBanner() {
  const query = useBannerConfigs();
  const now = useOfferNow(query.data);
  const campaigns = query.isError ? [] : (query.data?.campaigns ?? [])
    .filter(c => c.enabled && c.startsAtMs <= now && c.endsAtMs > now)
    .sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  if (!campaigns.length) return null;
  return <div className="shrink-0 border-b border-emerald-800 bg-emerald-700 text-white text-[11px]" data-testid="admin-discount-strip" aria-label="Ofertat aktive Discount">
    <div className="flex items-center gap-6 overflow-x-auto px-4 lg:px-8 py-1.5">
      {campaigns.map(c => <Link key={c.id} href="/discounts" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap hover:underline" data-testid={`admin-discount-${c.id}`}>
        <strong>Ulje −{c.value}{c.type === "percent" ? "%" : " €"}</strong>
        <span>· {c.name}</span>
        <span>· Përfundon më {deadline.format(c.endsAtMs)}</span>
        <span className="font-medium">· Mbeten {remainingTime(c.endsAtMs, now)}</span>
      </Link>)}
    </div>
  </div>;
}
