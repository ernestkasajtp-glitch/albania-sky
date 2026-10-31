import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { OfferBanner, colorKeys, useOfferNow, type Clock, type Offer } from "./OfferBanner";

interface Snapshot extends Clock { banners: Offer[]; identity: string }
function validOffer(value: unknown): value is Offer {
  if (!value || typeof value !== "object") return false;
  const o = value as Offer;
  return typeof o.id === "string" && ["percent", "fixed"].includes(o.type) && Number.isFinite(o.value) && o.value > 0 &&
    Number.isFinite(o.startsAtMs) && Number.isFinite(o.endsAtMs) && o.endsAtMs > o.startsAtMs &&
    typeof o.endsAt === "string" && Array.isArray(o.periods) && o.periods.length > 0 &&
    o.periods.every(p => typeof p?.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.from) && typeof p.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.to)) &&
    !!o.colors && colorKeys.every(key => typeof o.colors[key] === "string" && /^#[\da-f]{6}$/i.test(o.colors[key]));
}
/** Public data is never inferred from admin campaigns or cached across identities. */
export function PublicOfferBanner({ apiBase, identity, authLoading, anchor, mobileAnchor }: {
  apiBase: string; identity: string; authLoading: boolean; anchor: RefObject<HTMLDivElement | null>; mobileAnchor?: RefObject<HTMLDivElement | null>;
}) {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [index, setIndex] = useState(0);
  const [placement, setPlacement] = useState<{ left: number; top: number; width: number } | null>(null);
  const placementRef = useRef(placement);
  placementRef.current = placement;
  // Keep the largest measured height for each candidate width. A closed details
  // element reports zero; it must never replace the desktop measurement and
  // bounce the banner between the portal and the fallback.
  const heightCache = useRef(new Map<string, number>());
  const [, edgeRender] = useState(0);
  const now = useOfferNow(snapshot ?? undefined);
  const measureRef = useRef<HTMLDivElement>(null);
  const banners = !authLoading && snapshot?.identity === identity ? snapshot.banners.filter(b => b.startsAtMs <= now && now < b.endsAtMs) : [];
  const offer = banners.length ? banners[index % banners.length] : undefined;
  useEffect(() => {
    setSnapshot(null); setIndex(0);
    if (authLoading) return;
    let active = true;
    let controller: AbortController | null = null;
    const load = async () => {
      if (document.hidden || controller) return;
      controller = new AbortController();
      const deadline = window.setTimeout(() => controller?.abort(), 20_000);
      try {
        const response = await fetch(`${apiBase}/public/offer-banners`, { credentials: "include", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        const receivedAt = Date.now();
        if (!Number.isFinite(data.serverNow) || !Array.isArray(data.banners) || !data.banners.every(validOffer)) throw new Error("Invalid response");
        if (active) setSnapshot({ serverNow: data.serverNow, receivedAt, banners: data.banners, identity });
      } catch { if (active) setSnapshot(null); }
      finally { clearTimeout(deadline); controller = null; }
    };
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; controller?.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [apiBase, identity, authLoading]);
  useEffect(() => {
    if (!snapshot) return;
    const edges = snapshot.banners.flatMap(b => [b.startsAtMs, b.endsAtMs]).filter(time => time > now);
    if (!edges.length) return;
    const timer = window.setTimeout(() => edgeRender(n => n + 1), Math.min(2_147_483_647, Math.max(1, Math.min(...edges) - now)));
    return () => clearTimeout(timer);
  }, [snapshot, now]);
  useLayoutEffect(() => {
    if (!offer || !anchor.current) { setPlacement(null); return; }
    const host = anchor.current;
    let active = true;
    const measure = () => {
      if (!active || !host.isConnected) return;
      const search = host.querySelector("form");
      const heading = host.querySelector("h1");
      const description = host.querySelector(":scope > p");
      const badge = host.firstElementChild;
      if (!search || !heading || !description || !badge) return;
      const hostRect = host.getBoundingClientRect(), searchRect = search.getBoundingClientRect();
      const textRight = (node: Element) => { const range = document.createRange(); range.selectNodeContents(node); return Math.max(...Array.from(range.getClientRects()).map(r => r.right)); };
      const left = Math.max(textRight(heading), textRight(description)) + 24;
      const width = Math.min(530, searchRect.right - left);
      const heightKey = `${offer.id}:${Math.round(width * 100)}`;
      const measured = measureRef.current?.getBoundingClientRect();
      const previousHeight = heightCache.current.get(heightKey) ?? 140;
      const matchesDesktopWidth = placementRef.current && measured && Math.abs(measured.width - width) < 1;
      const height = Math.max(previousHeight, matchesDesktopWidth ? measured.height : 0);
      heightCache.current.set(heightKey, height);
      const top = searchRect.top - 20 - height;
      const room = window.innerWidth > 768 && width >= 360 && top >= badge.getBoundingClientRect().top;
      const next = room ? { left: searchRect.right - width - hostRect.left, top: top - hostRect.top, width } : null;
      const current = placementRef.current;
      if (current?.left !== next?.left || current?.top !== next?.top || current?.width !== next?.width) {
        placementRef.current = next;
        setPlacement(next);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    if (measureRef.current) observer.observe(measureRef.current);
    measure();
    window.addEventListener("resize", measure);
    void document.fonts.ready.then(measure);
    return () => { active = false; observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [anchor, offer?.id, placement?.width, mobile]);
  if (!offer) return null;
  const content = <div className={`offer-carousel${banners.length > 1 ? " offer-multiple" : ""}`} ref={measureRef}>
    <OfferBanner offer={offer} now={now} />
    {banners.length > 1 && <div className="offer-arrows" style={{ color: offer.colors.title }}><button type="button" data-testid="button-offer-prev" aria-label="Previous offer" onClick={() => setIndex(i => (i - 1 + banners.length) % banners.length)}>‹</button><button type="button" data-testid="button-offer-next" aria-label="Next offer" onClick={() => setIndex(i => (i + 1) % banners.length)}>›</button></div>}
  </div>;
  if (mobile && mobileAnchor?.current) return createPortal(<div className="offer-public-mobile" data-testid="mobile-offer-banner">{content}</div>, mobileAnchor.current);
  if (placement && anchor.current) return createPortal(<div className="offer-public-desktop" style={placement}>{content}</div>, anchor.current);
  return <div className="offer-public-fallback" lang="en"><details><summary data-testid="button-offer-expand" style={{ background: offer.colors.background, color: offer.colors.title, border: `1px solid ${offer.colors.border}` }}>LIMITED-TIME OFFER · {offer.value}{offer.type === "percent" ? "%" : " €"} OFF <small> · View offer</small></summary>{content}</details></div>;
}
