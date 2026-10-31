import { useState } from "react";
import { Link } from "wouter";
import {
  Bell, AlarmClock, Plane, CalendarClock, ChevronDown, ChevronRight, RefreshCw, ExternalLink, Check, TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  READ_KEYS, getReadSet, addRead, closingItemKey, alertItemKey, schedItemKey,
  soldOutItemKey, getSoldOutLegacyMaxId,
} from "@/lib/notifRead";
import { fmtAmPm } from "@/lib/utils";
import { useFmsNotifications } from "@/hooks/useFmsNotifications";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClosingFlight {
  id: number;
  airline: string;
  flightNumber: string | null;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  closeAt: string;
  minutesLeft: number;
}

interface AlertFlight {
  id: number;
  airline: string;
  flightNumber: string | null;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  arrivalTime?: string | null;
  status: string;
  totalSeats?: number;
  soldSeats?: number;
  availableSeats?: number;
  scheduleAlert: string | null;
  scheduleAlertDetail: string | null;
  scheduleCheckedAt?: string | null;
  seatAlert: string | null;
  seatAlertDetail?: string | null;
  seatMissCount?: number | null;
  seatGooglePrice?: number | null;
  seatCheckedAt?: string | null;
}

interface SoldOutItem {
  historyId: number;
  flightId: number;
  source: string | null;
  note: string | null;
  userName: string | null;
  at: string;
  airline: string;
  flightNumber: string | null;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  totalSeats: number;
  soldSeats: number;
}

interface ScheduleChange {
  id: number;
  flightId: number;
  flight: {
    id: number; airline: string; flightNumber: string | null;
    fromCity: string; toCity: string;
    departureDate: string; departureTime: string;
  };
  oldDepartureDate: string; oldDepartureTime: string;
  newDepartureDate: string; newDepartureTime: string;
  status: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${day}.${m}.${y}` : d;
};
const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "";
  try {
    const dt = new Date(iso);
    // Data mbetet si më parë; vetëm ora shfaqet 12-orëshe me AM/PM.
    const datePart = dt.toLocaleDateString("sq-AL", {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Tirane",
    });
    const timePart = dt.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/Tirane",
    });
    return `${datePart}, ${timePart}`;
  } catch { return iso; }
};

const seatAlertLabel = (detail: unknown, missCount: unknown): string => {
  const base = String(detail || "Pak vende në Google").replace(/\s*\(\d+\/\d+\)\s*$/, "");
  const count = Number.isFinite(Number(missCount)) ? Math.max(0, Number(missCount)) : 0;
  return `${base} (${count}/3)`;
};

// ─── Page ─────────────────────────────────────────────────────────────────────
// Faqja qendrore e njoftimeve: mbledh në një vend të gjitha alarmet e sistemit.
// Seksione të reja njoftimesh shtohen këtu në të ardhmen.
export default function NotificationsPage() {
  const { user } = useAdminAuth();
  const role = user?.role ?? "";
  const isAdmin = role === "admin";
  const isManager = role === "manager";

  const {
    loading,
    refreshedAt,
    closing,
    alertFlights,
    soldOut,
    scheduleChanges: schedChanges,
    systemNotifications,
    refresh,
  } = useFmsNotifications(user);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  // Gjendja "e lexuar" (localStorage, per-shfletues). Njoftimet e lexuara
  // NUK shfaqen më në listë dhe nuk numërohen.
  const [closingRead, setClosingRead] = useState<Set<string>>(() => getReadSet(READ_KEYS.closing));
  const [alertsRead, setAlertsRead] = useState<Set<string>>(() => getReadSet(READ_KEYS.alerts));
  const [schedRead, setSchedRead] = useState<Set<string>>(() => getReadSet(READ_KEYS.sched));
  const [soldOutRead, setSoldOutRead] = useState<Set<string>>(() => getReadSet(READ_KEYS.soldout));
  const soldOutLegacyMax = getSoldOutLegacyMaxId();

  const closingVisible = closing.filter(f => !closingRead.has(closingItemKey(f)));
  const alertsVisible = alertFlights.filter(f => !alertsRead.has(alertItemKey(f)));
  const schedVisible = schedChanges.filter(c => !schedRead.has(schedItemKey(c)));
  const soldOutVisible = soldOut.filter(
    s => !soldOutRead.has(soldOutItemKey(s)) && s.historyId > soldOutLegacyMax,
  );
  const wizzPriceDrops = systemNotifications.filter(n => n.type === "wizz_price_drop" && !n.readAt);

  const markSystemNotificationsRead = async (ids: number[]) => {
    if (ids.length === 0) return;
    await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/../api/tasks-notifications/read`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await refresh();
  };

  // Shëno një njoftim të vetëm si të lexuar (ose një listë të tërë).
  const markRead = (storageKey: string, ids: string[]) => {
    addRead(storageKey, ids);
    const fresh = getReadSet(storageKey);
    if (storageKey === READ_KEYS.closing) setClosingRead(fresh);
    else if (storageKey === READ_KEYS.alerts) setAlertsRead(fresh);
    else if (storageKey === READ_KEYS.sched) setSchedRead(fresh);
    else if (storageKey === READ_KEYS.soldout) setSoldOutRead(fresh);
  };
  const markClosingRead = () => markRead(READ_KEYS.closing, closingVisible.map(closingItemKey));
  const markAlertsRead = () => markRead(READ_KEYS.alerts, alertsVisible.map(alertItemKey));
  const markSchedRead = () => markRead(READ_KEYS.sched, schedVisible.map(schedItemKey));
  const markSoldOutRead = () => markRead(READ_KEYS.soldout, soldOutVisible.map(soldOutItemKey));

  // Butoni për një rresht të vetëm — "✓ Lexuar"
  const rowReadBtn = (onClick: () => void) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
      title="Shëno të lexuar — njoftimi hiqet nga lista"
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      <Check className="h-3.5 w-3.5 mr-1" /> Lexuar
    </Button>
  );

  const totalCount =
    closingVisible.length + alertsVisible.length + soldOutVisible.length + schedVisible.length + wizzPriceDrops.length;

  const sectionEmpty = (text: string) => (
    <div className="text-sm text-muted-foreground py-3">{text}</div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
          <Bell className="h-5 w-5 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Njoftimet</h1>
          <p className="text-sm text-muted-foreground">
            Të gjitha njoftimet e sistemit në një vend
            {refreshedAt ? ` · rifreskuar ${refreshedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}` : ""}
          </p>
        </div>
        <Badge variant={totalCount > 0 ? "destructive" : "secondary"} className="text-sm px-3 py-1">
          {totalCount} aktive
        </Badge>
        <Button variant="outline" size="sm" onClick={() => { void refresh(); }}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Rifresko
        </Button>
      </div>

      {loading && totalCount === 0 ? (
        <div className="text-sm text-muted-foreground py-6">Duke ngarkuar njoftimet…</div>
      ) : null}

      {isAdmin && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4 text-emerald-600" />
              Ulje çmimi Wizz
              {wizzPriceDrops.length > 0 && <Badge className="bg-emerald-600">{wizzPriceDrops.length}</Badge>}
              <span className="ml-auto flex items-center gap-2">
                {wizzPriceDrops.length > 0 && (
                  <Button variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => { void markSystemNotificationsRead(wizzPriceDrops.map(n => n.id)); }}>
                    Shëno të gjitha të lexuara
                  </Button>
                )}
                <Link href="/wizz-price-monitor" className="text-xs font-medium text-primary hover:underline">
                  Hap monitorimin →
                </Link>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {wizzPriceDrops.length === 0
              ? sectionEmpty("Asnjë ulje e re çmimi Wizz.")
              : (
                <div className="divide-y">
                  {wizzPriceDrops.map(notification => (
                    <div key={notification.id} className="flex flex-wrap items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm">{notification.title}</div>
                        {notification.body && <div className="text-sm text-muted-foreground mt-1">{notification.body}</div>}
                        <div className="text-xs text-muted-foreground mt-1">{fmtDateTime(notification.createdAt)}</div>
                      </div>
                      {rowReadBtn(() => { void markSystemNotificationsRead([notification.id]); })}
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {/* 1. Mbyllje shitjeje së shpejti */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlarmClock className="h-4 w-4 text-red-600" />
            Mbyllje shitjeje së shpejti
            {closingVisible.length > 0 && <Badge variant="destructive">{closingVisible.length}</Badge>}
            {closingVisible.length > 0 && (
              <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={markClosingRead}>
                Shëno të gjitha të lexuara
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {closingVisible.length === 0
            ? sectionEmpty("Asnjë fluturim nuk e mbyll shitjen brenda orës së ardhshme.")
            : (
              <div className="divide-y">
                {closingVisible.map(f => {
                  const key = `closing-${f.id}`;
                  const open = expanded.has(key);
                  return (
                    <div key={f.id}>
                      <div onClick={() => toggle(key)}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 cursor-pointer hover:bg-muted/50 rounded-lg px-2 -mx-2">
                        <span className="font-semibold whitespace-nowrap">{f.fromCity} → {f.toCity}</span>
                        {f.flightNumber && <span className="text-muted-foreground text-sm">{f.flightNumber}</span>}
                        <span className="text-sm text-muted-foreground">niset {fmtDate(f.departureDate)} {fmtAmPm(f.departureTime)}</span>
                        <span className="ml-auto text-xs font-bold bg-red-600 text-white rounded-full px-2 py-0.5 whitespace-nowrap">
                          edhe {f.minutesLeft} min ({fmtAmPm((f.closeAt || "").slice(11, 16))})
                        </span>
                        {rowReadBtn(() => markRead(READ_KEYS.closing, [closingItemKey(f)]))}
                        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </div>
                      {open && (
                        <div className="mb-2.5 mt-0.5 ml-1 rounded-lg border bg-muted/30 p-3 text-sm space-y-1.5">
                          <div><span className="text-muted-foreground">Kompania:</span> <span className="font-medium">{f.airline}</span></div>
                          <div><span className="text-muted-foreground">Nisja:</span> <span className="font-medium">{fmtDate(f.departureDate)} ora {fmtAmPm(f.departureTime)}</span></div>
                          <div><span className="text-muted-foreground">Shitja mbyllet:</span> <span className="font-medium text-red-600">ora {fmtAmPm((f.closeAt || "").slice(11, 16))} — edhe {f.minutesLeft} minuta</span></div>
                          <div className="text-muted-foreground text-xs">Pas mbylljes fluturimi kalon automatikisht në "I Mbyllur" dhe nuk shitet më online.</div>
                          <Link href={`/flights/${f.id}`} className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs font-medium pt-1">
                            <ExternalLink className="h-3.5 w-3.5" /> Hap fluturimin
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      {/* 2. Alarme fluturimesh (vende / orare nga Google) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plane className="h-4 w-4 text-orange-600" />
            Alarme fluturimesh (vende & orare)
            {alertsVisible.length > 0 && <Badge className="bg-orange-600">{alertsVisible.length}</Badge>}
            <span className="ml-auto flex items-center gap-2">
              {alertsVisible.length > 0 && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={markAlertsRead}>
                  Shëno të gjitha të lexuara
                </Button>
              )}
              <Link href="/flights?tab=alerts" className="text-xs font-medium text-primary hover:underline">
                Shiko te Fluturimet →
              </Link>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {alertsVisible.length === 0
            ? sectionEmpty("Asnjë fluturim me alarm vendesh apo orari.")
            : (
              <div className="divide-y">
                {alertsVisible.map(f => {
                  const key = `alert-${f.id}`;
                  const open = expanded.has(key);
                  return (
                    <div key={f.id}>
                      <div onClick={() => toggle(key)}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 cursor-pointer hover:bg-muted/50 rounded-lg px-2 -mx-2">
                        <span className="font-semibold whitespace-nowrap">{f.fromCity} → {f.toCity}</span>
                        {f.flightNumber && <span className="text-muted-foreground text-sm">{f.flightNumber}</span>}
                        <span className="text-sm text-muted-foreground">{fmtDate(f.departureDate)} {fmtAmPm(f.departureTime)}</span>
                        <span className="flex flex-wrap gap-1.5 ml-auto">
                          {f.scheduleAlert === "time_changed" && (
                            <Badge className="bg-amber-500 text-white">Orari ndryshoi</Badge>
                          )}
                          {f.scheduleAlert === "not_found" && (
                            <Badge variant="destructive">Mundësisht anuluar</Badge>
                          )}
                          {f.seatAlert && (
                            <Badge className="bg-orange-600 text-white">Vende në rrezik</Badge>
                          )}
                        </span>
                        {rowReadBtn(() => markRead(READ_KEYS.alerts, [alertItemKey(f)]))}
                        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </div>
                      {open && (
                        <div className="mb-2.5 mt-0.5 ml-1 rounded-lg border bg-muted/30 p-3 text-sm space-y-1.5">
                          <div><span className="text-muted-foreground">Kompania:</span> <span className="font-medium">{f.airline}</span>{f.flightNumber ? <span className="text-muted-foreground"> · {f.flightNumber}</span> : null}</div>
                          <div>
                            <span className="text-muted-foreground">Nisja:</span>{" "}
                            <span className="font-medium">{fmtDate(f.departureDate)} ora {fmtAmPm(f.departureTime)}</span>
                            {f.arrivalTime ? <span className="text-muted-foreground"> · mbërritja {fmtAmPm(f.arrivalTime)}</span> : null}
                          </div>
                          {typeof f.totalSeats === "number" && (
                            <div>
                              <span className="text-muted-foreground">Vendet:</span>{" "}
                              <span className="font-medium">{f.soldSeats ?? 0} të shitura / {f.totalSeats} totale</span>
                              {typeof f.availableSeats === "number" && <span className="text-muted-foreground"> · {f.availableSeats} të lira</span>}
                            </div>
                          )}
                          {f.seatAlert && (
                            <div className="rounded-md bg-orange-50 border border-orange-200 px-2.5 py-1.5 text-orange-800">
                              <div className="font-medium">Vende në rrezik (nga Google)</div>
                              <div className="text-xs mt-0.5">{seatAlertLabel(f.seatAlertDetail, f.seatMissCount)}</div>
                              {f.seatCheckedAt && <div className="text-xs text-orange-600 mt-0.5">Kontrolluar: {fmtDateTime(f.seatCheckedAt)}</div>}
                            </div>
                          )}
                          {f.scheduleAlert === "time_changed" && (
                            <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-amber-800">
                              <div className="font-medium">Orari ndryshoi (nga Google)</div>
                              {f.scheduleAlertDetail && <div className="text-xs mt-0.5">{f.scheduleAlertDetail}</div>}
                              {f.scheduleCheckedAt && <div className="text-xs text-amber-600 mt-0.5">Kontrolluar: {fmtDateTime(f.scheduleCheckedAt)}</div>}
                            </div>
                          )}
                          {f.scheduleAlert === "not_found" && (
                            <div className="rounded-md bg-red-50 border border-red-200 px-2.5 py-1.5 text-red-800">
                              <div className="font-medium">Mundësisht i anuluar — nuk u gjet në Google</div>
                              {f.scheduleAlertDetail && <div className="text-xs mt-0.5">{f.scheduleAlertDetail}</div>}
                              {f.scheduleCheckedAt && <div className="text-xs text-red-600 mt-0.5">Kontrolluar: {fmtDateTime(f.scheduleCheckedAt)}</div>}
                            </div>
                          )}
                          <Link href={`/flights/${f.id}`} className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs font-medium pt-1">
                            <ExternalLink className="h-3.5 w-3.5" /> Hap fluturimin
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      {/* Sold Out të reja (48h e fundit) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plane className="h-4 w-4 text-red-600" />
            Sapo dolën Sold Out (48 orët e fundit)
            {soldOutVisible.length > 0 && <Badge variant="destructive">{soldOutVisible.length}</Badge>}
            {soldOutVisible.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={markSoldOutRead}
              >
                Shëno të gjitha të lexuara
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {soldOutVisible.length === 0
            ? sectionEmpty("Asnjë fluturim nuk ka dalë Sold Out në 48 orët e fundit.")
            : (
              <div className="divide-y">
                {soldOutVisible.map(s => {
                  const key = `soldout-${s.historyId}`;
                  const open = expanded.has(key);
                  const isAuto = s.source === "auto";
                  return (
                    <div key={s.historyId}>
                      <div onClick={() => toggle(key)}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 cursor-pointer hover:bg-muted/50 rounded-lg px-2 -mx-2">
                        <span className="font-semibold whitespace-nowrap">{s.fromCity} → {s.toCity}</span>
                        {s.flightNumber && <span className="text-muted-foreground text-sm">{s.flightNumber}</span>}
                        <span className="text-sm text-muted-foreground">{fmtDate(s.departureDate)} {fmtAmPm(s.departureTime)}</span>
                        <span className="flex items-center gap-1.5 ml-auto">
                          <Badge variant="destructive">Sold Out</Badge>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(s.at)}</span>
                        </span>
                        {rowReadBtn(() => markRead(READ_KEYS.soldout, [soldOutItemKey(s)]))}
                        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </div>
                      {open && (
                        <div className="mb-2.5 mt-0.5 ml-1 rounded-lg border bg-muted/30 p-3 text-sm space-y-1.5">
                          <div><span className="text-muted-foreground">Kompania:</span> <span className="font-medium">{s.airline}</span>{s.flightNumber ? <span className="text-muted-foreground"> · {s.flightNumber}</span> : null}</div>
                          <div><span className="text-muted-foreground">Nisja:</span> <span className="font-medium">{fmtDate(s.departureDate)} ora {fmtAmPm(s.departureTime)}</span></div>
                          <div><span className="text-muted-foreground">Vendet:</span> <span className="font-medium">{s.soldSeats} të shitura / {s.totalSeats} totale</span></div>
                          <div className="rounded-md bg-red-50 border border-red-200 px-2.5 py-1.5 text-red-800">
                            <div className="font-medium">
                              {isAuto ? "Kaloi automatikisht në Sold Out" : `U kalua manualisht në Sold Out nga ${s.userName || "përdorues"}`}
                            </div>
                            {s.note && <div className="text-xs mt-0.5">{s.note}</div>}
                            <div className="text-xs text-red-600 mt-0.5">Ora: {fmtDateTime(s.at)}</div>
                          </div>
                          <Link href={`/flights/${s.flightId}`} className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs font-medium pt-1">
                            <ExternalLink className="h-3.5 w-3.5" /> Hap fluturimin
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      {/* 3. Ndryshime orari (vetëm admin/manager) */}
      {(isAdmin || isManager) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-amber-600" />
              Ndryshime orari — njoftime për pasagjerët
              {schedVisible.length > 0 && <Badge className="bg-amber-500">{schedVisible.length}</Badge>}
              <span className="ml-auto flex items-center gap-2">
                {schedVisible.length > 0 && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={markSchedRead}>
                    Shëno të gjitha të lexuara
                  </Button>
                )}
                <Link href="/schedule-changes" className="text-xs font-medium text-primary hover:underline">
                  Hap faqen →
                </Link>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {schedVisible.length === 0
              ? sectionEmpty("Asnjë ndryshim orari në pritje për njoftim.")
              : (
                <div className="divide-y">
                  {schedVisible.map(c => {
                    const key = `sched-${c.id}`;
                    const open = expanded.has(key);
                    return (
                      <div key={c.id}>
                        <div onClick={() => toggle(key)}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 cursor-pointer hover:bg-muted/50 rounded-lg px-2 -mx-2">
                          <span className="font-semibold whitespace-nowrap">{c.flight.fromCity} → {c.flight.toCity}</span>
                          {c.flight.flightNumber && <span className="text-muted-foreground text-sm">{c.flight.flightNumber}</span>}
                          <span className="text-sm">
                            <span className="line-through text-muted-foreground">{fmtDate(c.oldDepartureDate)} {fmtAmPm(c.oldDepartureTime)}</span>
                            {" → "}
                            <span className="font-medium">{fmtDate(c.newDepartureDate)} {fmtAmPm(c.newDepartureTime)}</span>
                          </span>
                          <Badge variant="outline" className="ml-auto text-amber-700 border-amber-300">Në pritje</Badge>
                          {rowReadBtn(() => markRead(READ_KEYS.sched, [schedItemKey(c)]))}
                          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        </div>
                        {open && (
                          <div className="mb-2.5 mt-0.5 ml-1 rounded-lg border bg-muted/30 p-3 text-sm space-y-1.5">
                            <div><span className="text-muted-foreground">Kompania:</span> <span className="font-medium">{c.flight.airline}</span>{c.flight.flightNumber ? <span className="text-muted-foreground"> · {c.flight.flightNumber}</span> : null}</div>
                            <div>
                              <span className="text-muted-foreground">Orari i vjetër:</span>{" "}
                              <span className="line-through">{fmtDate(c.oldDepartureDate)} ora {fmtAmPm(c.oldDepartureTime)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Orari i ri:</span>{" "}
                              <span className="font-medium">{fmtDate(c.newDepartureDate)} ora {fmtAmPm(c.newDepartureTime)}</span>
                            </div>
                            <div><span className="text-muted-foreground">Regjistruar:</span> <span className="font-medium">{fmtDateTime(c.createdAt)}</span></div>
                            <div className="text-muted-foreground text-xs">Pasagjerët e këtij fluturimi presin njoftim për ndryshimin e orarit — dërgohet nga faqja "Ndryshime Orari".</div>
                            <div className="flex flex-wrap gap-3 pt-1">
                              <Link href="/schedule-changes" className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs font-medium">
                                <ExternalLink className="h-3.5 w-3.5" /> Hap faqen e njoftimeve të pasagjerëve
                              </Link>
                              <Link href={`/flights/${c.flightId}`} className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs font-medium">
                                <ExternalLink className="h-3.5 w-3.5" /> Hap fluturimin
                              </Link>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
