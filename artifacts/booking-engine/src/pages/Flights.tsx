import { trackFlightSearch, trackActivity } from "@/lib/activity";
import { FlightDateStrip } from "@/components/FlightDateStrip";
import { useState, useEffect, useRef, useCallback } from "react";
import { fmtM, fmtAmPm, roundWholeEuro } from "@/lib/utils";
import { useLocation, Link } from "wouter";
import { api } from "@/lib/api";
import {
  Plane, Clock, Users, ArrowRight, Loader2, LayoutList, LayoutGrid,
  ChevronDown, Minus, Plus, Search, Filter, Calendar, MapPin, Eye, Flame
} from "lucide-react";
import { airportCity, lookupAirport } from "@/lib/airports";
import { AirportCombobox, FlightCalendar, AirportOption, FlightPriceMap, ALB_MONTHS } from "@/components/FlightSearchWidgets";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { dayShort } from "@/lib/i18n-dates";

// ── Social Proof ──────────────────────────────────────────────────────────────
function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

interface SocialProof { type: "booked" | "viewing"; count: number; minutesAgo?: number; }

function genProof(): SocialProof {
  return Math.random() > 0.5
    ? { type: "booked", count: rnd(1, 10), minutesAgo: rnd(2, 55) }
    : { type: "viewing", count: rnd(1, 10) };
}

function useSocialProof(flightIds: number[]) {
  const [proofs, setProofs] = useState<Record<number, SocialProof>>({});
  const [enabled, setEnabled] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Admin can hide these (demo) badges from flight-system Settings.
  // On any error, fall back to enabled (the previous behaviour).
  useEffect(() => {
    let active = true;
    api.getSocialProof()
      .then((r) => { if (active) setEnabled(r?.enabled !== false); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const regenerate = useCallback((ids: number[]) => {
    const next: Record<number, SocialProof> = {};
    for (const id of ids) next[id] = genProof();
    setProofs(next);
    // schedule next refresh in 5-10 min
    const ms = rnd(300_000, 600_000);
    timerRef.current = setTimeout(() => regenerate(ids), ms);
  }, []);

  useEffect(() => {
    if (!enabled) { setProofs({}); return; }
    if (flightIds.length === 0) return;
    regenerate(flightIds);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [flightIds.join(","), enabled]);

  return proofs;
}

function SocialBadge({ proof }: { proof: SocialProof | undefined }) {
  const { t } = useTranslation();
  if (!proof) return null;
  if (proof.type === "booked") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-full px-2.5 py-0.5 animate-pulse">
        <Flame className="h-3 w-3" />
        {proof.count} {proof.count === 1 ? t("person") : t("persona")} {t("rezervuan {{count}} min më parë", { count: proof.minutesAgo })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 bg-sky-50 border border-sky-100 rounded-full px-2.5 py-0.5">
      <Eye className="h-3 w-3" />
      {proof.count} {proof.count === 1 ? t("person po shikon") : t("persona po shikojnë")} {t("tani")}
    </span>
  );
}

// Airline brand colors: keyed by IATA code or partial name (lowercase)
const AIRLINE_BRANDS: { match: string[]; from: string; to: string; label: string }[] = [
  { match: ["w4", "wizz"], from: "#C6007E", to: "#E8007B", label: "Wizz Air" },
  { match: ["fr", "ryanair"], from: "#073590", to: "#0350C8", label: "Ryanair" },
  { match: ["u2", "easyjet"], from: "#FF6600", to: "#FF8800", label: "easyJet" },
  { match: ["lh", "lufthansa"], from: "#05164D", to: "#1D3A8A", label: "Lufthansa" },
  { match: ["tk", "turkish"], from: "#C70A0C", to: "#E51213", label: "Turkish Airlines" },
  { match: ["ba", "british"], from: "#075AAA", to: "#084E93", label: "British Airways" },
  { match: ["af", "air france"], from: "#002157", to: "#0039A6", label: "Air France" },
  { match: ["vy", "vueling"], from: "#FFD700", to: "#FFC000", label: "Vueling" },
  { match: ["a3", "aegean"], from: "#005DA4", to: "#0072C6", label: "Aegean" },
];

function getAirlineBrand(airline: string, flightNumber: string) {
  const key = (airline + " " + flightNumber).toLowerCase();
  const brand = AIRLINE_BRANDS.find(b => b.match.some(m => key.includes(m)));
  return brand
    ? { gradient: `linear-gradient(135deg, ${brand.from}, ${brand.to})`, from: brand.from, to: brand.to }
    : { gradient: "linear-gradient(135deg, #0b1f3a, #1a3a6b)", from: "#0b1f3a", to: "#1a3a6b" };
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = dayShort(d.getDay());
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return { day, dm: `${dd}.${mm}` };
}

function groupByRoute(flights: any[]) {
  const groups: Record<string, any[]> = {};
  for (const f of flights) {
    const key = `${f.fromCity}→${f.toCity}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  }
  return groups;
}

function PassengerSelector({ adults, children, infants, onChange }: {
  adults: number; children: number; infants: number;
  onChange: (a: number, c: number, i: number) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const parts: string[] = [];
  if (adults > 0) parts.push(t("{{count}} të Rritur", { count: adults }));
  if (children > 0) parts.push(t("{{count}} Fëmijë", { count: children }));
  if (infants > 0) parts.push(t("{{count}} Foshnjë", { count: infants }));
  const label = parts.length > 0 ? parts.join(", ") : t("Pasagjerët");

  const rows: [string, string, number, (v: number) => void][] = [
    ["I Rritur", "12+ vjeç", adults, v => onChange(v, children, infants)],
    ["Fëmijë", "2–11 vjeç", children, v => onChange(adults, v, infants)],
    ["Foshnjë", "0–2 vjeç", infants, v => onChange(adults, children, v)],
  ];

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white hover:border-blue-400 transition-colors min-h-[42px]">
        <Users className="h-4 w-4 text-gray-400 shrink-0" />
        <span className="flex-1 text-left text-gray-700 truncate text-xs">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-50 mt-2 w-60 bg-white border border-gray-100 rounded-2xl shadow-2xl p-4 space-y-4">
            {rows.map(([lbl, sub, count, set]) => (
              <div key={lbl} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800">{t(lbl)}</div>
                  <div className="text-xs text-gray-400">{t(sub)}</div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button type="button"
                    data-activity-label={`Ul pasagjerët: ${lbl} · ${count} → ${Math.max(lbl === "I Rritur" ? 1 : 0, count - 1)}`}
                    onClick={() => count > (lbl === "I Rritur" ? 1 : 0) && set(count - 1)}
                    className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-5 text-center text-sm font-bold text-gray-900">{count}</span>
                  <button type="button" aria-label={`Shto ${t(lbl)}`} onClick={() => set(count + 1)}
                    data-activity-label={`Shto pasagjerët: ${lbl} · ${count} → ${count + 1}`}
                    className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setOpen(false)}
              className="w-full bg-[#0b1f3a] text-white text-sm font-semibold py-2 rounded-xl transition-colors">
              {t("Konfirmo")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Flights({ airline = false }: { airline?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const discountPct   = user?.discountPercent ?? 0;
  const discountFixed = user?.discountFixed   ?? 0;
  const discountType  = user?.discountType    ?? "percent";

  const hasDiscount = discountType === "fixed" ? discountFixed > 0 : discountPct > 0;

  const applyDiscount = (price: number) => {
    if (discountType === "fixed" && discountFixed > 0)
      return Math.max(0, roundWholeEuro(price - discountFixed));
    if (discountType === "percent" && discountPct > 0)
      return roundWholeEuro(price * (1 - discountPct / 100));
    return roundWholeEuro(price);
  };

  const discountLabel = discountType === "fixed"
    ? `−€${fmtM(discountFixed)} ${t("Zbritje Agjenti")}`
    : `−${discountPct}% ${t("Zbritje Agjenti")}`;

  // Server-computed agent price (rule pricing or legacy discount) with safe fallback.
  const agentPriceOf = (f: any) =>
    typeof f.agentAdultPrice === "number" ? f.agentAdultPrice : applyDiscount(Number(f.adultPrice));
  // Flight-level discount: old price = agency final BEFORE discount (never raw base).
  const fdOf = (f: any) => {
    const d = f?.flightDiscount;
    return d && (d.type === "percent" || d.type === "fixed") && Number(d.value) > 0 && typeof f.preDiscountAdultPrice === "number" ? d : null;
  };
  const oldPriceOf = (f: any) => (fdOf(f) ? Number(f.preDiscountAdultPrice) : Number(f.adultPrice));
  const flightHasDiscount = (f: any) => agentPriceOf(f) < oldPriceOf(f);
  const flightDiscountLabel = (f: any) => {
    const d = fdOf(f);
    if (d) return `${d.type === "percent" ? `−${d.value}%` : `−€${fmtM(d.value)}`} ${t("Zbritje fluturimi")}`;
    return f.agentPricingMode === "rule" ? t("Çmim Agjenti") : discountLabel;
  };

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [from, setFrom] = useState(params.get("from") || "");
  const [to, setTo] = useState(params.get("to") || "");
  const [date, setDate] = useState(params.get("date") || "");
  const [flights, setFlights] = useState<any[]>([]);
  const [allFlights, setAllFlights] = useState<any[]>([]);
  const [airports, setAirports] = useState<AirportOption[]>([]);
  const [routes, setRoutes] = useState<{ from: string; to: string }[]>([]);
  const [flightPrices, setFlightPrices] = useState<FlightPriceMap>(new Map());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [adults, setAdults] = useState(parseInt(params.get("adults") || "1") || 1);
  const [paxChildren, setPaxChildren] = useState(parseInt(params.get("children") || "0") || 0);
  const [infants, setInfants] = useState(parseInt(params.get("infants") || "0") || 0);

  const paxQuery = () => `adults=${adults}&children=${paxChildren}&infants=${infants}`;

  useEffect(() => {
    api.getAirports().then(setAirports).catch(() => {});
    api.getRoutes().then(setRoutes).catch(() => {});
  }, []);

  // Only filter when we have a validated airport code (not raw typed text)
  const validFrom = airports.find(a => a.code === from) ? from : null;
  const validTo   = airports.find(a => a.code === to)   ? to   : null;

  const canSearch = !!validFrom && !!validTo && !!date;

  const fromAirports = validTo
    ? airports.filter(a => routes.some(r => r.from === a.code && r.to === validTo))
    : airports.filter(a => routes.some(r => r.from === a.code));

  const toAirports = validFrom
    ? airports.filter(a => routes.some(r => r.from === validFrom && r.to === a.code))
    : airports.filter(a => routes.some(r => r.to === a.code));

  useEffect(() => {
    let active = true;
    setFlightPrices(new Map());
    const validFrom = airports.length === 0 || airports.some(a => a.code === from) ? from : undefined;
    const validTo = airports.length === 0 || airports.some(a => a.code === to) ? to : undefined;
    api.getFlightDates(validFrom || undefined, validTo || undefined)
      .then(res => {
        if (!active) return;
        const m: FlightPriceMap = new Map();
        // minPrice is already the agent's effective price (rule or legacy discount).
        for (const { date, minPrice } of res.dates) m.set(date, minPrice);
        setFlightPrices(m);
      })
      .catch(() => { if (active) setFlightPrices(new Map()); });
    return () => { active = false; };
  }, [from, to, airports, discountPct]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("from") && p.get("to")) {
      setTimeout(() => {
        const qDate: Record<string, string> = {};
        const qAll: Record<string, string> = {};
        if (p.get("from")) { qDate.from = p.get("from")!; qAll.from = p.get("from")!; }
        if (p.get("to")) { qDate.to = p.get("to")!; qAll.to = p.get("to")!; }
        if (p.get("date")) qDate.date = p.get("date")!;
        setLoading(true); setSearched(true);
        Promise.all([api.searchFlights(qDate), api.searchFlights(qAll)])
          .then(([dated, all]) => {
            setFlights(dated); setAllFlights(all);
            trackActivity({ type: "search_result", search: { from: validFrom || "", to: validTo || "", date, adults, children: paxChildren, infants }, count: Array.isArray(dated) ? dated.length : 0 });
          })
          .catch(() => { setFlights([]); setAllFlights([]); })
          .finally(() => setLoading(false));
      }, 100);
    }
  }, []);

  const resolveCode = (val: string) => {
    if (!val) return "";
    const trimmed = val.trim();
    const exact = airports.find(a => a.code.toLowerCase() === trimmed.toLowerCase());
    if (exact) return exact.code;
    const dashIdx = trimmed.indexOf(" – ");
    if (dashIdx > 0) {
      const codePart = trimmed.slice(0, dashIdx).trim();
      const found = airports.find(a => a.code.toLowerCase() === codePart.toLowerCase());
      if (found) return found.code;
    }
    const partial = airports.find(a =>
      a.city.toLowerCase().includes(trimmed.toLowerCase()) ||
      a.name.toLowerCase().includes(trimmed.toLowerCase())
    );
    if (partial) return partial.code;
    return trimmed;
  };

  const search = async (selectedDate = date) => {
    setLoading(true); setSearched(true);
    const activitySearch = { from: resolveCode(from), to: resolveCode(to), date: selectedDate, adults, children: paxChildren, infants };
    try {
      const fromCode = resolveCode(from);
      const toCode = resolveCode(to);
      const qDate: Record<string, string> = {};
      const qAll: Record<string, string> = {};
      if (fromCode) { qDate.from = fromCode; qAll.from = fromCode; }
      if (toCode) { qDate.to = toCode; qAll.to = toCode; }
      if (selectedDate) qDate.date = selectedDate;
      trackFlightSearch({ from: fromCode, to: toCode, date: selectedDate, adults, children: paxChildren, infants });
      const [dated, all] = await Promise.all([api.searchFlights(qDate), api.searchFlights(qAll)]);
      trackActivity({ type: "search_result", search: activitySearch, count: Array.isArray(dated) ? dated.length : 0 });
      setFlights(Array.isArray(dated) ? dated : []);
      setAllFlights(Array.isArray(all) ? all : []);
    } catch { trackActivity({ type: "search_result", search: activitySearch, failed: true }); setFlights([]); setAllFlights([]); } finally { setLoading(false); }
  };

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); if (canSearch) search(); };
  const visibleFlights = viewMode === "list" ? allFlights : flights;
  const isEmpty = visibleFlights.length === 0 && searched && !loading;

  // Seats required by the current search. Infants do not take a seat (system
  // convention), so only adults + children count. A flight is treated as sold
  // out when it cannot seat all requested seat-taking passengers.
  const requestedSeats = Math.max(1, adults + paxChildren);

  // Social proof — one badge per flight, refreshed every 5-10 min
  const socialProofs = useSocialProof(visibleFlights.map((f: any) => f.id));

  return (
    <div className={`min-h-screen bg-slate-50 ${airline ? "air-portal air-flights" : ""}`}>
      {/* Search bar */}
      <div className={`bg-[#0b1f3a] shadow-xl ${airline ? "air-search" : ""}`}>
        <div className="max-w-6xl mx-auto px-6 py-6">
          <form onSubmit={handleSearch}>
            <div className="grid md:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-blue-300/70 mb-1.5 uppercase tracking-wider">{t("Nga")}</label>
                <AirportCombobox
                  value={from}
                  onChange={v => {
                    setFrom(v);
                    const vIsCode = airports.find(a => a.code === v);
                    if (vIsCode && validTo && !routes.some(r => r.from === v && r.to === validTo)) setTo("");
                  }}
                  placeholder={t("Aeroporti")}
                  airports={fromAirports}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-300/70 mb-1.5 uppercase tracking-wider">{t("Për")}</label>
                <AirportCombobox
                  value={to}
                  onChange={v => {
                    setTo(v);
                    const vIsCode = airports.find(a => a.code === v);
                    if (vIsCode && validFrom && !routes.some(r => r.from === validFrom && r.to === v)) setFrom("");
                  }}
                  placeholder={t("Aeroporti")}
                  airports={toAirports}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-300/70 mb-1.5 uppercase tracking-wider">{t("Data")}</label>
                <FlightCalendar value={date} onChange={setDate} flightPrices={flightPrices} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-300/70 mb-1.5 uppercase tracking-wider">{t("Pasagjerët")}</label>
                <PassengerSelector adults={adults} children={paxChildren} infants={infants}
                  onChange={(a, c, i) => { setAdults(a); setPaxChildren(c); setInfants(i); }} />
              </div>
              <div className="flex flex-col gap-1">
                <button type="submit" disabled={!canSearch}
                  className={`w-full font-bold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${canSearch ? "bg-amber-500 hover:bg-amber-400 text-white hover:shadow-amber-500/30 cursor-pointer" : "bg-amber-500/40 text-white/60 cursor-not-allowed"}`}>
                  <Search className="h-4 w-4" /> {t("Kërko")}
                </button>
                {!canSearch && (
                  <p className="text-blue-300/70 text-[10px] text-center leading-tight">
                    {!validFrom ? t("Nisja?") : !validTo ? t("Destinacioni?") : t("Data?")}
                  </p>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {airline && validFrom && validTo && <FlightDateStrip value={date} prices={flightPrices}
          route={`${airportCity(validFrom) || validFrom} → ${airportCity(validTo) || validTo}`}
          disabled={loading} onChange={next => { setDate(next); setViewMode("cards"); void search(next); }}/>}
        {/* Results header */}
        {!isEmpty && !loading && visibleFlights.length > 0 && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t("{{count}} fluturime u gjetën", { count: visibleFlights.length })}</h2>
              {hasDiscount && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-0.5 rounded-full">{discountLabel}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
              <button onClick={() => setViewMode("cards")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === "cards" ? "bg-[#0b1f3a] text-white shadow" : "text-gray-500 hover:text-gray-700"}`}>
                <LayoutGrid className="h-3.5 w-3.5" /> {t("Karta")}
              </button>
              <button onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === "list" ? "bg-[#0b1f3a] text-white shadow" : "text-gray-500 hover:text-gray-700"}`}>
                <LayoutList className="h-3.5 w-3.5" /> {t("Listë")}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center py-24 gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
              <Plane className="absolute inset-0 m-auto h-6 w-6 text-blue-600" />
            </div>
            <p className="text-gray-500 font-medium">{t("Duke kërkuar fluturime...")}</p>
          </div>
        ) : !searched ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <Plane className="h-9 w-9 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">{t("Gjej fluturimin tënd")}</h3>
            <p className="text-gray-400 max-w-sm mx-auto">{t('Plotëso formularin e kërkimit dhe kliko "Kërko" për të parë fluturimet e disponueshme.')}</p>
          </div>
        ) : isEmpty ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Plane className="h-9 w-9 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">{t("Nuk u gjetën fluturime")}</h3>
            <p className="text-gray-400 max-w-sm mx-auto">
              {!from || !to ? t("Zgjidh aeroportin e nisjes dhe destinacionit.") : t("Nuk ka fluturime për këtë kombinim. Provo data ose destinacione të tjera.")}
            </p>
          </div>
        ) : viewMode === "cards" ? (
          <div className="space-y-4">
            {visibleFlights.map((flight: any) => {
              const soldOut = flight.availableSeats < requestedSeats;
              const brand = getAirlineBrand(flight.airline ?? "", flight.flightNumber ?? "");
              return (
                <div key={flight.id}
                  className={`${airline ? "air-flight-card" : ""} bg-white rounded-2xl border shadow-sm transition-all hover:shadow-md ${soldOut ? "opacity-60 border-gray-200" : "border-gray-100 hover:-translate-y-0.5"}`}>
                  <div className="p-5 md:p-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      {/* Airline */}
                      <div className="flex items-center gap-3 min-w-[120px]">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0"
                          style={{ background: brand.gradient }}>
                          <Plane className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-sm">{flight.airline}</div>
                          <div className="text-xs text-gray-400 font-mono">{flight.flightNumber}</div>
                        </div>
                      </div>

                      {/* Route & Time */}
                      <div className="flex items-center gap-6 flex-1 justify-center">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-900">{fmtAmPm(flight.departureTime)}</div>
                          <div className="text-sm font-bold text-[#0b1f3a] mt-0.5">{flight.fromCity}</div>
                          {lookupAirport(flight.fromCity) && (
                            <div className="text-xs text-gray-400">{airportCity(flight.fromCity)}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-px bg-gray-300" />
                            <Plane className="h-3.5 w-3.5 text-blue-500 rotate-0" />
                            <div className="w-12 h-px bg-gray-300" />
                          </div>
                          <div className="text-[10px] text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />{flight.departureDate}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-900">{fmtAmPm(flight.arrivalTime)}</div>
                          <div className="text-sm font-bold text-[#0b1f3a] mt-0.5">{flight.toCity}</div>
                          {lookupAirport(flight.toCity) && (
                            <div className="text-xs text-gray-400">{airportCity(flight.toCity)}</div>
                          )}
                        </div>
                      </div>

                      {/* Price & CTA */}
                      <div className="flex items-center gap-4 ml-auto">
                        <div className="text-right">
                          {soldOut ? (
                            <div className="text-red-500 font-bold">{t("E Shitur")}</div>
                          ) : (
                            <>
                              {flightHasDiscount(flight) && (
                                <div className="text-xs text-gray-400 line-through">€{fmtM(oldPriceOf(flight))}</div>
                              )}
                              <div className="text-3xl font-bold text-[#0b1f3a]">€{fmtM(agentPriceOf(flight))}</div>
                              <div className="text-xs text-gray-400">{t("për person")}</div>
                              {flightHasDiscount(flight) && (
                                <div className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5 mt-1">{flightDiscountLabel(flight)}</div>
                              )}
                            </>
                          )}
                        </div>
                        {!soldOut && (
                          <Link href={`/flights/${flight.id}?${paxQuery()}`}
                            data-activity-label={`Zgjodhi fluturimin #${flight.id} · ${flight.fromCity} → ${flight.toCity} · ${flight.departureDate} · €${fmtM(agentPriceOf(flight))}`}
                            className="bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-amber-500/30 whitespace-nowrap">
                            {t("Rezervo")}
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Extras + Social Proof */}
                    {(!soldOut && flight.availableSeats > 0 && flight.availableSeats <= 10) || socialProofs[flight.id] || flight.checkedBaggageKg ? (
                      <div className="mt-3 pt-3 border-t border-gray-50 flex flex-wrap items-center gap-2">
                        {!soldOut && flight.availableSeats > 0 && flight.availableSeats <= 10 && (
                          <span className="text-xs text-orange-600 font-semibold bg-orange-50 rounded-full px-2.5 py-0.5">
                            ⚡ {t("Vetëm {{count}} vende të mbetura", { count: flight.availableSeats })}
                          </span>
                        )}
                        <SocialBadge proof={socialProofs[flight.id]} />
                            {flight.checkedBaggageKg && (
                          <span className="text-xs text-gray-400">
                                {flight.checkedBaggageCount ? `${flight.checkedBaggageCount}× ` : ""}{flight.checkedBaggageKg}kg {t("bagazh")} +€{fmtM(flight.checkedBaggagePrice)}
                                {flight.seatSelectionPrice && <> · {t("Vend")} +€{fmtM(flight.seatSelectionPrice)}</>}
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupByRoute(visibleFlights)).map(([route, routeFlights]) => {
              const [fc, tc] = route.split("→");
              const fromInfo = lookupAirport(fc);
              const toInfo = lookupAirport(tc);
              const fromLabel = fromInfo ? `${fc} – ${fromInfo.city}` : fc;
              const toLabel = toInfo ? `${tc} – ${toInfo.city}` : tc;
              return (
                <div key={route} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 flex items-center justify-between"
                    style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" }}>
                    <div className="flex items-center gap-3">
                      <MapPin className="h-4 w-4 text-amber-400 shrink-0" />
                      <div className="font-bold text-white">{fromLabel} → {toLabel}</div>
                    </div>
                    <div className="text-blue-300/60 text-xs">{t("{{count}} fluturime", { count: (routeFlights as any[]).length })}</div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-slate-50 text-xs text-gray-400 uppercase tracking-wider">
                        <th className="px-5 py-3 text-left font-semibold">{t("Data")}</th>
                        <th className="px-5 py-3 text-left font-semibold">{t("Orari")}</th>
                        <th className="px-5 py-3 text-left font-semibold">{t("Nr. Fluturimit")}</th>
                        <th className="px-5 py-3 text-right font-semibold">{t("Çmimi")}</th>
                        <th className="px-4 py-3 w-28"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(routeFlights as any[]).map((f: any) => {
                        const soldOut = f.availableSeats < requestedSeats;
                        const { day, dm } = fmtDate(f.departureDate);
                        return (
                          <tr key={f.id} className={`border-b border-gray-50 transition-colors ${soldOut ? "bg-red-50/30" : "hover:bg-blue-50/30"}`}>
                            <td className="px-5 py-3.5">
                              <span className={`font-semibold ${soldOut ? "text-red-400 line-through" : "text-gray-800"}`}>{day} {dm}</span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`font-medium ${soldOut ? "text-red-400 line-through" : "text-gray-700"}`}>
                                {fmtAmPm(f.departureTime)} → {fmtAmPm(f.arrivalTime)}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{f.flightNumber}</span>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {soldOut ? (
                                <span className="text-red-400 font-semibold">{t("E Shitur")}</span>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  {flightHasDiscount(f) && (
                                    <span className="text-xs text-gray-400 line-through">€{fmtM(oldPriceOf(f))}</span>
                                  )}
                                  <span className="font-bold text-[#0b1f3a] text-base">€{fmtM(agentPriceOf(f))}</span>
                                  {fdOf(f) && (
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">{flightDiscountLabel(f)}</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3.5 text-center">
                              {!soldOut && (
                                <Link href={`/flights/${f.id}?${paxQuery()}`}
                                  data-activity-label={`Zgjodhi fluturimin #${f.id} · ${f.fromCity} → ${f.toCity} · ${f.departureDate} · €${fmtM(agentPriceOf(f))}`}
                                  className="bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                                  {t("Rezervo")}
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
