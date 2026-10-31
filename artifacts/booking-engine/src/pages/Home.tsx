import { trackFlightSearch } from "@/lib/activity";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Plane, Search, Shield, Clock, Star, Users, ChevronDown, Minus, Plus, ArrowRight, Globe, ChevronLeft, ChevronRight, MapPin, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { AirportCombobox, FlightCalendar, AirportOption, FlightPriceMap } from "@/components/FlightSearchWidgets";
import { useTranslation } from "react-i18next";
import { fmtM } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { PublicOfferBanner } from "../../../flight-system/src/banner/PublicOfferBanner";
import { PartnerInvitation, PartnerWorkspace } from "@/components/PartnerWelcome";

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
        className="w-full flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white hover:border-blue-400 transition-colors min-h-[48px]">
        <Users className="h-4 w-4 text-gray-400 shrink-0" />
        <span className="flex-1 text-left text-gray-700 truncate">{label}</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-50 mt-2 w-64 bg-white border border-gray-100 rounded-2xl shadow-2xl p-5 space-y-5">
            {rows.map(([lbl, sub, count, set]) => (
              <div key={lbl} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{t(lbl)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{t(sub)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button"
                    aria-label={`Ul ${t(lbl)}`} onClick={() => count > (lbl === "I Rritur" ? 1 : 0) && set(count - 1)}
                    className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-base font-bold text-gray-900">{count}</span>
                  <button type="button" aria-label={`Shto ${t(lbl)}`} onClick={() => set(count + 1)}
                    className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setOpen(false)}
              className="w-full bg-[#0b1f3a] hover:bg-[#1a3a6b] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
              {t("Konfirmo")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface DestCard {
  id: number;
  itinerary: string;
  displayName: string;
  photoUrl: string | null;
  photoCardUrl?: string | null;
  resolvedDate: string | null;
  resolvedPrice: number | null;
}

function fmtDate(d: string | null) {
  if (!d) return null;
  const [y, m, dd] = d.split("-");
  return `${dd}.${m}.${y}`;
}

export default function Home({ airline = false }: { airline?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const [requestedLogin, setRequestedLogin] = useState(false);
  const showLoginNotice = () => setRequestedLogin(true);
  const offerAnchor = useRef<HTMLDivElement>(null);
  const mobileOfferAnchor = useRef<HTMLDivElement>(null);
  const offerIdentity = JSON.stringify([user?.id ?? null, user?.role ?? null, user?.agentId ?? null, user?.isApproved ?? false]);
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [adults, setAdults] = useState(1);
  const [paxChildren, setPaxChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [airports, setAirports] = useState<AirportOption[]>([]);
  const [routes, setRoutes] = useState<{ from: string; to: string }[]>([]);
  const [flightPrices, setFlightPrices] = useState<FlightPriceMap>(new Map());
  const [destinations, setDestinations] = useState<DestCard[]>([]);
  const [destIdx, setDestIdx] = useState(0);
  const sliderRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading || !user) {
      setAirports([]); setRoutes([]); setDestinations([]);
      return;
    }
    let active = true;
    api.getAirports().then(v => { if (active) setAirports(v); }).catch(() => {});
    api.getRoutes().then(v => { if (active) setRoutes(v); }).catch(() => {});
    fetch(api.base + "/destinations")
      .then(r => r.ok ? r.json() : [])
      .then((d: DestCard[]) => { if (active) setDestinations(d); })
      .catch(() => {});
    return () => { active = false; };
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (destinations.length < 2) return;
    sliderRef.current = setInterval(() => setDestIdx(i => (i + 1) % destinations.length), 5000);
    return () => { if (sliderRef.current) clearInterval(sliderRef.current); };
  }, [destinations.length]);

  const prevDest = () => {
    if (sliderRef.current) clearInterval(sliderRef.current);
    setDestIdx(i => (i - 1 + destinations.length) % destinations.length);
  };
  const nextDest = () => {
    if (sliderRef.current) clearInterval(sliderRef.current);
    setDestIdx(i => (i + 1) % destinations.length);
  };

  const goToDest = (d: DestCard) => {
    const [origin, destination] = d.itinerary.split("-");
    const params = new URLSearchParams();
    if (origin) params.set("from", origin);
    if (destination) params.set("to", destination);
    if (d.resolvedDate) params.set("date", d.resolvedDate);
    params.set("adults", "1");
    params.set("children", "0");
    params.set("infants", "0");
    if (d.resolvedDate) trackFlightSearch({ from: origin, to: destination, date: d.resolvedDate, adults: 1, children: 0, infants: 0 });
    setLocation("/flights?" + params.toString());
  };

  // Only filter when we have a validated airport code (not raw typed text)
  const validFrom = airports.find(a => a.code === from) ? from : null;
  const validTo   = airports.find(a => a.code === to)   ? to   : null;

  const fromAirports = validTo
    ? airports.filter(a => routes.some(r => r.from === a.code && r.to === validTo))
    : airports.filter(a => routes.some(r => r.from === a.code));

  const toAirports = validFrom
    ? airports.filter(a => routes.some(r => r.from === validFrom && r.to === a.code))
    : airports.filter(a => routes.some(r => r.to === a.code));

  useEffect(() => {
    if (authLoading || !user) { setFlightPrices(new Map()); return; }
    let active = true;
    const validFrom = airports.length === 0 || airports.some(a => a.code === from) ? from : undefined;
    const validTo = airports.length === 0 || airports.some(a => a.code === to) ? to : undefined;
    api.getFlightDates(validFrom || undefined, validTo || undefined)
      .then(res => {
        const m: FlightPriceMap = new Map();
        for (const { date, minPrice } of res.dates) m.set(date, minPrice);
        if (active) setFlightPrices(m);
      })
      .catch(() => { if (active) setFlightPrices(new Map()); });
    return () => { active = false; };
  }, [from, to, airports, authLoading, user?.id]);

  const canSearch = !!validFrom && !!validTo && !!date;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { showLoginNotice(); return; }
    if (!canSearch) return;
    const params = new URLSearchParams();
    params.set("from", validFrom!);
    params.set("to", validTo!);
    params.set("date", date);
    params.set("adults", String(adults));
    params.set("children", String(paxChildren));
    params.set("infants", String(infants));
    trackFlightSearch({ from: params.get("from") || "", to: params.get("to") || "", date: params.get("date") || "", adults, children: paxChildren, infants });
    setLocation("/flights?" + params.toString());
  };

  return (
    <div className={`${airline ? "ah-home ah-proposed ah-content ah-sky" : ""} min-h-screen bg-slate-50`}>
      {/* ── Hero ── */}
      <div className="ah-hero relative min-h-[620px] flex items-center"
        style={{ background: "linear-gradient(135deg, #0b1f3a 0%, #0f3460 40%, #1a5276 70%, #1a6ba5 100%)" }}>

        {/* Decorative circles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }} />
          <div className="absolute -bottom-40 -left-20 w-[500px] h-[500px] rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }} />
          {/* Dot grid */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        </div>

        {/* Plane silhouette */}
        <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-5 hidden lg:block">
          <Plane className="h-80 w-80 text-white rotate-12" />
        </div>

        <div ref={offerAnchor} className="ah-hero-inner relative max-w-5xl mx-auto px-6 pt-32 pb-16 w-full">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-400/30 rounded-full px-4 py-1.5 mb-6">
            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
            <span className="text-amber-300 text-xs font-semibold tracking-wide uppercase">{t("Fluturime Premium")}</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-4 tracking-tight">
            {t("Udhëto me")}<br />
            <span className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(90deg, #f59e0b, #fbbf24)" }}>
              {t("Elegancë")}
            </span>
          </h1>
          <p className="text-blue-200/80 text-lg mb-10 max-w-md leading-relaxed">
            {t("Gjej destinacionin e ëndrrave. Çmimet më të mira, shërbim i klasit të parë.")}
          </p>

          {/* Search card */}
          <div ref={mobileOfferAnchor} className="offer-mobile-slot" />
          <form onSubmit={handleSearch}
            className="ah-search bg-white rounded-2xl shadow-2xl p-6 border border-white/10">
            <div className="grid md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">{t("Nga")}</label>
                {!user ? <button type="button" className="partner-airport" onClick={showLoginNotice} aria-label={t("Nga")}><span>{t("Aeroporti / Qyteti")}</span><ChevronDown size={15} /></button> : <AirportCombobox
                  value={from}
                  onChange={v => {
                    setFrom(v);
                    const vIsCode = airports.find(a => a.code === v);
                    if (vIsCode && validTo && !routes.some(r => r.from === v && r.to === validTo)) setTo("");
                  }}
                  placeholder={t("Aeroporti / Qyteti")}
                  airports={fromAirports}
                />}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">{t("Për")}</label>
                {!user ? <button type="button" className="partner-airport" onClick={showLoginNotice} aria-label={t("Për")}><span>{t("Aeroporti / Qyteti")}</span><ChevronDown size={15} /></button> : <AirportCombobox
                  value={to}
                  onChange={v => {
                    setTo(v);
                    const vIsCode = airports.find(a => a.code === v);
                    if (vIsCode && validFrom && !routes.some(r => r.from === validFrom && r.to === v)) setFrom("");
                  }}
                  placeholder={t("Aeroporti / Qyteti")}
                  airports={toAirports}
                />}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">{t("Data")}</label>
                <FlightCalendar value={date} onChange={setDate} flightPrices={flightPrices} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">{t("Pasagjerët")}</label>
                <PassengerSelector adults={adults} children={paxChildren} infants={infants}
                  onChange={(a, c, i) => { setAdults(a); setPaxChildren(c); setInfants(i); }} />
              </div>
            </div>
            {!user && !authLoading && (airline || requestedLogin) && <PartnerInvitation />}
            <div>
              <button type="submit" disabled={authLoading || (!!user && !canSearch)}
                className={`w-full font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm tracking-wide shadow-lg ${!user || canSearch ? "hover:shadow-amber-500/30 hover:-translate-y-0.5 cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
                style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)", color: "white" }}>
                <Search className="h-4 w-4" />
                {t("Kërko Fluturime")}
              </button>
              {!canSearch && (
                <p className="text-amber-300/80 text-xs mt-2 text-center">
                  {!validFrom && !validTo ? t("Zgjidh aeroportin e nisjes dhe destinacionit") :
                   !validFrom ? t("Zgjidh aeroportin e nisjes") :
                   !validTo ? t("Zgjidh aeroportin e destinacionit") :
                   t("Zgjidh një datë fluturimi")}
                </p>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* ── Destinations Grid ── */}
      <PublicOfferBanner apiBase={api.base} identity={offerIdentity} authLoading={authLoading} anchor={offerAnchor} mobileAnchor={mobileOfferAnchor} />
      {destinations.length > 0 && (
        <div className="bg-white py-12 border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-6">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">{t("Destinacionet Popullore")}</h2>
              <p className="text-sm text-gray-500 mt-1">{t("Kliko një destinacion për të kërkuar fluturime")}</p>
            </div>

            {/* 4×2 grid — show all destinations */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {destinations.slice(0, 8).map(d => {
                const originalPhotoSrc = d.photoUrl
                  ? (d.photoUrl.startsWith("/uploads")
                    ? (api.base.replace("/api", "") + d.photoUrl)
                    : d.photoUrl)
                  : null;
                const photoSrc = d.photoCardUrl
                  ? (d.photoCardUrl.startsWith("/uploads")
                    ? (api.base.replace("/api", "") + d.photoCardUrl)
                    : d.photoCardUrl)
                  : originalPhotoSrc;
                return (
                  <button key={d.id} onClick={() => goToDest(d)}
                    className="group text-left rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all hover:-translate-y-1 bg-gray-100 relative">
                    {photoSrc ? (
                      <img
                        src={photoSrc}
                        alt={d.displayName}
                        loading="lazy"
                        decoding="async"
                        onError={(event) => {
                          if (originalPhotoSrc && event.currentTarget.dataset.fallback !== "true") {
                            event.currentTarget.dataset.fallback = "true";
                            event.currentTarget.src = originalPhotoSrc;
                          }
                        }}
                        className="w-full h-52 object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-52 flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, #0b1f3a, #1a5276)" }}>
                        <Plane className="h-16 w-16 text-white/20" />
                      </div>
                    )}
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold mb-1">
                        <MapPin className="h-3 w-3" />
                        <span className="font-mono tracking-wide">{d.itinerary}</span>
                      </div>
                      <h3 className="text-white font-bold text-lg leading-tight">{d.displayName}</h3>
                      <div className="flex items-center justify-between mt-2">
                        {d.resolvedDate && (
                          <div className="flex items-center gap-1 text-white/70 text-xs">
                            <Calendar className="h-3 w-3" />
                            <span>{fmtDate(d.resolvedDate)}</span>
                          </div>
                        )}
                        {d.resolvedPrice && (
                          <div className="ml-auto bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                            {t("nga")} €{fmtM(d.resolvedPrice)}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Stats strip ── */}
      {airline ? <PartnerWorkspace signedIn={!!user} /> : <>
      <div className="ah-stats bg-[#0b1f3a] text-white py-4">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap justify-center md:justify-between gap-6 text-center">
          {[
            { value: "50+", label: t("Destinacione") },
            { value: "10K+", label: t("Udhëtarë të Kënaqur") },
            { value: "99%", label: t("Vlerësim Pozitiv") },
            { value: "24/7", label: t("Mbështetje") },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="text-xl font-bold text-amber-400">{s.value}</div>
              <div className="text-blue-300/70 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Why us ── */}
      <div className="ah-benefits max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-4">
            <Globe className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-blue-600 text-xs font-semibold tracking-wide uppercase">{t("Pse Ne?")}</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900">{t("Përvojë Udhëtimi e Klasit të Parë")}</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">{t("Çdo fluturim i rezervuar me ne vjen me një garanci cilësie dhe shërbim 5-yje.")}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <Plane className="h-6 w-6" />,
              color: "from-blue-500 to-blue-700",
              bg: "bg-blue-50",
              border: "border-blue-100",
              title: t("Konfirmim i Shpejtë"),
              desc: t("Rezervimi yt konfirmohet shpejt. Pa pritje të gjata — të njoftojmë sapo bileta të jetë gati.")
            },
            {
              icon: <Shield className="h-6 w-6" />,
              color: "from-amber-400 to-amber-600",
              bg: "bg-amber-50",
              border: "border-amber-100",
              title: t("Pagesa të Sigurta"),
              desc: t("Sistemi ynë i pagesave është i enkriptuar me teknologji të nivelit bankar. Të dhënat e tua janë 100% të sigurta.")
            },
            {
              icon: <Clock className="h-6 w-6" />,
              color: "from-emerald-400 to-emerald-600",
              bg: "bg-emerald-50",
              border: "border-emerald-100",
              title: t("Mbështetje 24/7"),
              desc: t("Ekipi ynë është gjithmonë i disponueshëm. Nëse ke nevojë për ndihmë, ne jemi këtu për ty.")
            },
          ].map(f => (
            <div key={f.title} className={`${f.bg} border ${f.border} rounded-2xl p-7 hover:shadow-lg transition-all hover:-translate-y-1`}>
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} text-white flex items-center justify-center mb-5 shadow-md`}>
                {f.icon}
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Popular routes CTA ── */}
      <div className="ah-cta max-w-5xl mx-auto px-6 pb-20">
        <div className="rounded-3xl overflow-hidden relative"
          style={{ background: "linear-gradient(135deg, #0b1f3a 0%, #0f3460 60%, #1a5276 100%)" }}>
          <div className="absolute inset-0 opacity-5"
            style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
          <div className="relative px-10 py-14 text-center">
            <div className="text-amber-400 text-sm font-semibold tracking-widest uppercase mb-4">{t("Gati për të udhëtuar?")}</div>
            <h3 className="text-3xl font-bold text-white mb-4 leading-tight">{t("Gjej fluturimin tënd të radhës")}<br />{" "}{t("tani")}</h3>
            <p className="text-blue-200/70 mb-8 max-w-md mx-auto">{t("Qindra fluturime nga dhe drejt Shqipërisë çdo javë. Çmimet më të mira të garantuara.")}</p>
            <button onClick={() => setLocation("/flights")}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-bold px-8 py-3.5 rounded-full transition-all shadow-lg hover:shadow-amber-500/30 hover:-translate-y-0.5">
              {t("Shiko të gjitha fluturimet")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      </>}
      {/* ── Footer ── */}
      <footer className="bg-[#0b1f3a] text-white/60 text-sm py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center">
              <Plane className="h-4 w-4 text-white" />
            </div>
            <span className="text-white font-semibold">Albania Sky</span>
          </div>
          <div>© 2026 Albania Sky. {t("Të gjitha të drejtat e rezervuara.")}</div>
        </div>
      </footer>
    </div>
  );
}
