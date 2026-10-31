import { Link, useLocation } from "wouter";
import { preloadNavigation } from "@/lib/navigationPreload";
import { usePendingEnrollmentCount } from "@/components/PublicEnrollments";
import {
  Plane, Home, Ticket, Users, Briefcase, CreditCard, BarChart3, Menu, X, Percent,
  LogOut, UserCog, ShieldCheck, Bell, Settings, Layers, Webhook, ScanSearch, MapPin,
  ChevronLeft, ChevronRight, CheckSquare, PlaneTakeoff, Globe, AlertTriangle, CalendarClock, Lock, Star, Mail, TrendingUp, Telescope, Radar, Activity, Sparkles
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { READ_KEYS, NOTIF_READ_EVENT, getReadSet, alertItemKey, schedItemKey, closingItemKey } from "@/lib/notifRead";
import { playFlightAlertChime, playBookingChime, getEmailNotifyEnabled } from "@/hooks/useLiveUpdates";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useModules } from "@/context/ModulesContext";
import { useTheme } from "@/context/ThemeContext";
import { APP_VERSION } from "@/lib/version";
import { ClosingSoonBanner } from "@/components/ClosingSoonBanner";
import { SeatAlertBanner } from "@/components/SeatAlertBanner";
import { AdminOfferBanner } from "@/components/AdminOfferBanner";
import { useFmsNotifications } from "@/hooks/useFmsNotifications";
import { loadBranding, type BrandingSummary } from "@/lib/branding";
import "./navy-gold.css";

interface LayoutProps { children: React.ReactNode; }

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
const TIRANA_TIME_ZONE = "Europe/Tirane";
const tiranaDateFormatter = new Intl.DateTimeFormat("sq-AL", {
  timeZone: TIRANA_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const tiranaTimeFormatter = new Intl.DateTimeFormat("sq-AL", {
  timeZone: TIRANA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function LiveTiranaClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const updateNow = () => setNow(new Date());
    const interval = window.setInterval(updateNow, 1000);
    document.addEventListener("visibilitychange", updateNow);
    window.addEventListener("focus", updateNow);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateNow);
      window.removeEventListener("focus", updateNow);
    };
  }, []);

  return (
    <div
      className={cn(
        "flex items-center rounded-lg border tabular-nums",
        compact
          ? "gap-1 border-white/15 bg-white/5 px-1.5 py-1"
          : "gap-2 border-gray-200 bg-gray-50/80 px-2.5 py-1.5",
      )}
      data-testid="status-live-tirana-clock"
      title="Data dhe ora lokale në Europe/Tirane"
    >
      {!compact && (
        <span className="whitespace-nowrap text-[11px] font-medium text-gray-500" data-testid="text-live-date">
          {tiranaDateFormatter.format(now)}
        </span>
      )}
      <time
        className={cn(
          "whitespace-nowrap font-semibold tracking-[0.04em]",
          compact ? "text-[11px] text-white/90" : "text-xs text-gray-800",
        )}
        dateTime={now.toISOString()}
        data-testid="text-live-time"
      >
        {tiranaTimeFormatter.format(now)}
      </time>
      <span
        className="rounded bg-red-600 px-1.5 py-0.5 text-[8px] font-extrabold leading-none tracking-wide text-white shadow-sm"
        data-testid="badge-live"
        aria-label="Ora live"
      >
        LIVE
      </span>
    </div>
  );
}

const navItems = [
  { href: "/", label: "Dashboard",       icon: Home,       exact: true, roles: null },
  { href: "/notifications", label: "Njoftimet", icon: Bell, roles: null },
  { href: "/atlas-seat-alerts", label: "Njoftime Atlas", icon: Radar, roles: ["admin"] },
  { href: "/flights",       label: "Fluturimet",    icon: Plane,      roles: null },
  { href: "/flights?external=blocked", label: "Fluturime të Bllokuara", icon: Lock, roles: ["admin", "manager"] },
  { href: "/flights?tab=booked", label: "Fluturime të Konfirmuara", icon: Star, roles: ["admin", "manager"] },
  { href: "/offline-flights", label: "Offline Flights", icon: Globe, roles: ["admin"] },
  { href: "/flight-discovery", label: "Fluturime të Palistuara", icon: Telescope, roles: ["admin"] },
  { href: "/wizz-price-monitor", label: "Monitorimi Wizz", icon: Activity, roles: ["admin"] },
  { href: "/kyte-search", label: "Kërkim Kyte", icon: ScanSearch, roles: ["admin"] },
  { href: "/bookings",      label: "Rezervimet",    icon: Ticket,     roles: null },
  { href: "/passengers",    label: "Pasagjerët",    icon: Users,      roles: null },
  { href: "/tasks",         label: "Detyrat",       icon: CheckSquare, roles: null },
  { href: "/claim",         label: "Claim",         icon: AlertTriangle, roles: null },
  { href: "/assistant",     label: "Asistenti AI",  icon: Sparkles, roles: ["admin"], permission: "can_access_reports" },
  { href: "/agents",        label: "Agjentët",      icon: Briefcase,  roles: ["admin", "manager"], permission: "can_access_agents" },
  { href: "/payments",      label: "Pagesat",       icon: CreditCard, roles: ["admin", "manager"], permission: "can_access_payments" },
  { href: "/reports",       label: "Raportet",      icon: BarChart3,  roles: ["admin"], permission: "can_access_reports" },
  { href: "/group-tickets", label: "Bileta Grupi",  icon: Layers,     roles: ["admin", "manager"], permission: "can_access_group_tickets" },
  { href: "/users",         label: "Përdoruesit",   icon: UserCog,    roles: ["admin"], permission: "can_access_users" },
  { href: "/permissions",   label: "Lejet e Roleve",icon: ShieldCheck,roles: ["admin"] },
  { href: "/schedule-check",label: "Kontrollo Oraret", icon: ScanSearch, roles: ["admin"], permission: "can_access_schedule_check" },
  { href: "/schedule-changes", label: "Ndryshime Orari", icon: CalendarClock, roles: ["admin", "manager"] },
  { href: "/flight-types",  label: "Llojet e Fluturimeve", icon: PlaneTakeoff, roles: ["admin"] },
  { href: "/integrations",  label: "Integrimet",    icon: Webhook,    roles: ["admin"] },
  { href: "/destinations",  label: "Destinacione",  icon: MapPin,     roles: ["admin"], permission: "can_access_destinations" },
  { href: "/price-rules",   label: "Rregullat e Çmimeve", icon: TrendingUp, roles: ["admin"] },
  { href: "/discounts", label: "Discount", icon: Percent, roles: ["admin"] },
  { href: "/settings",      label: "Cilësimet",     icon: Settings,   roles: ["admin"] },
  { href: "/import-alerts", label: "Njoftime Importi dhe Sistemi", icon: AlertTriangle, roles: ["admin"] },
  { href: "/admin-email",   label: "Email",         icon: Mail,       roles: ["admin"] },
];

export function Layout({ children }: LayoutProps) {
  const { theme } = useTheme();
  // Embed mode — kur faqja ngarkohet brenda iframe-it me ?onlyGroup=ID
  // fshehim plotësisht sidebar-in + header-in që të dalë vetëm grupi.
  const embedMode = typeof window !== "undefined" && (
    new URLSearchParams(window.location.search).has("onlyGroup") ||
    new URLSearchParams(window.location.search).get("embed") === "1"
  );
  if (embedMode) {
    return (
      <div className="min-h-[100dvh] w-full bg-background" style={{ backgroundColor: theme.mainBg }}>
        <main className="p-4">{children}</main>
      </div>
    );
  }
  return <LayoutFull>{children}</LayoutFull>;
}

function LayoutFull({ children }: LayoutProps) {
  const [location] = useLocation();
  const { isPathEnabled } = useModules();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebarCollapsed") === "1"; } catch { return false; }
  });
  const toggleCollapsed = () => {
    setCollapsed(v => {
      const next = !v;
      try { localStorage.setItem("sidebarCollapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  const { user, logout, hasPermission } = useAdminAuth();
  const {
    closing,
    alertFlights,
    soldOut,
    scheduleChanges,
    systemNotifications,
    refreshedAt: notificationsRefreshedAt,
  } = useFmsNotifications(user);
  const { theme } = useTheme();
  const enrollments = usePendingEnrollmentCount(user?.role === "admin" && isPathEnabled("/agents"));
  const enrollmentCount = user?.role === "admin" ? enrollments.data?.count ?? 0 : 0;
  const { toast } = useToast();
  const initials = user?.name ? user.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() : "AD";
  const [pendingCount, setPendingCount] = useState(0);
  const [isManagerUnread, setIsManagerUnread] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [myTasksCount, setMyTasksCount] = useState(0);
  const [flightAlertCount, setFlightAlertCount] = useState(0);
  const [importAlertCount, setImportAlertCount] = useState(0);
  const [scheduleChangeCount, setScheduleChangeCount] = useState(0);
  const [schedUnreadCount, setSchedUnreadCount] = useState(0);
  const [closingUnreadCount, setClosingUnreadCount] = useState(0);
  const [soldOutCount, setSoldOutCount] = useState(0);
  const [branding, setBranding] = useState<BrandingSummary>({
    siteName: "",
    tagline: "",
    logoUrl: null,
    backgroundUrl: null,
    primaryColor: "#3b82f6",
  });

  const fetchBranding = () => {
    loadBranding()
      .then(setBranding)
      .catch(() => {});
  };

  useEffect(() => {
    try { localStorage.removeItem("fms.branding"); } catch {}
    fetchBranding();
    window.addEventListener("brandingUpdated", fetchBranding);
    return () => window.removeEventListener("brandingUpdated", fetchBranding);
  }, []);

  useEffect(() => {
    if (!user || !isPathEnabled("/price-requests")) return;
    const fetchCount = async () => {
      try {
        const resp = await fetch(`${API_BASE}/price-requests/pending-count`, { credentials: "include" });
        if (resp.ok) {
          const data = await resp.json();
          setPendingCount(data.count ?? 0);
          setIsManagerUnread(data.isManagerUnread ?? false);
        }
      } catch { /* silent */ }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [user, isPathEnabled("/price-requests")]);

  useEffect(() => {
    if (!user || !isPathEnabled("/bookings")) return;
    const fetchDrafts = async () => {
      try {
        const resp = await fetch(`${API_BASE}/bookings/draft-count`, { credentials: "include" });
        if (resp.ok) {
          const data = await resp.json();
          if (Number.isInteger(data.count) && data.count >= 0) setDraftCount(data.count);
        }
      } catch { /* silent */ }
    };
    fetchDrafts();
    const interval = setInterval(fetchDrafts, 60000);
    return () => clearInterval(interval);
  }, [user, isPathEnabled("/bookings")]);

  useEffect(() => {
    if (!user || !isPathEnabled("/tasks")) return;
    const fetchMyTasks = async () => {
      try {
        const resp = await fetch(`${API_BASE}/tasks/my-count`, { credentials: "include" });
        if (resp.ok) {
          const data = await resp.json();
          setMyTasksCount(Number(data.count) || 0);
        }
      } catch { /* silent */ }
    };
    fetchMyTasks();
    const interval = setInterval(fetchMyTasks, 60000);
    return () => clearInterval(interval);
  }, [user, isPathEnabled("/tasks")]);

  useEffect(() => {
    if (!user) return;
    const recount = () => {
      const read = getReadSet(READ_KEYS.closing);
      setClosingUnreadCount(closing.filter(f => !read.has(closingItemKey(f))).length);
    };
    recount();
    window.addEventListener(NOTIF_READ_EVENT, recount);
    window.addEventListener("storage", recount);
    return () => {
      window.removeEventListener(NOTIF_READ_EVENT, recount);
      window.removeEventListener("storage", recount);
    };
  }, [user, closing]);

  const alertSessionRef = useRef<string | null>(null);
  const prevAlertUnreadRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;
    const sessionKey = `${user.id}:${user.role}`;
    if (alertSessionRef.current !== sessionKey) {
      alertSessionRef.current = sessionKey;
      prevAlertUnreadRef.current = null;
    }
    const recount = () => {
      const read = getReadSet(READ_KEYS.alerts);
      const unread = alertFlights.filter(f => !read.has(alertItemKey(f))).length;
      setFlightAlertCount(unread);
      if (!notificationsRefreshedAt) return;
      if (prevAlertUnreadRef.current !== null && unread > prevAlertUnreadRef.current) {
        playFlightAlertChime();
        toast({
          title: "✈️ Njoftim fluturimi!",
          description: "Ka një njoftim të ri te fluturimet.",
        });
      }
      prevAlertUnreadRef.current = unread;
    };
    recount();
    window.addEventListener(NOTIF_READ_EVENT, recount);
    window.addEventListener("storage", recount);
    return () => {
      window.removeEventListener(NOTIF_READ_EVENT, recount);
      window.removeEventListener("storage", recount);
    };
  }, [user, alertFlights, notificationsRefreshedAt, toast]);

  useEffect(() => {
    if (!user) return;
    // Numëron vetëm ato TË PALEXUARA — set-i i ri (fms.read.soldout) +
    // mekanizmi i vjetër maxId (fms.soldout.readMaxId) për kompatibilitet.
    const readMaxId = (): number => {
      try { return Number(localStorage.getItem("fms.soldout.readMaxId") || 0) || 0; } catch { return 0; }
    };
    const recount = () => {
      const r = readMaxId();
      const read = getReadSet(READ_KEYS.soldout);
      setSoldOutCount(soldOut.filter(i => Number(i.historyId) > r && !read.has(String(i.historyId))).length);
    };
    recount();
    window.addEventListener("fms-soldout-read", recount);
    window.addEventListener(NOTIF_READ_EVENT, recount);
    window.addEventListener("storage", recount);
    return () => {
      window.removeEventListener("fms-soldout-read", recount);
      window.removeEventListener(NOTIF_READ_EVENT, recount);
      window.removeEventListener("storage", recount);
    };
  }, [user, soldOut]);

  // Çelësi global i modulit Email (nga Settings, i ruajtur në server)
  const [emailModuleOn, setEmailModuleOn] = useState(true);
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/admin-email/enabled`, { credentials: "include" });
        if (r.ok && alive) setEmailModuleOn((await r.json())?.enabled !== false);
      } catch { /* silent */ }
    };
    load();
    const onChanged = (e: any) => setEmailModuleOn(e?.detail !== false);
    window.addEventListener("admin-email-enabled-changed", onChanged);
    return () => { alive = false; window.removeEventListener("admin-email-enabled-changed", onChanged); };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "admin" || !emailModuleOn || !isPathEnabled("/admin-email")) return;
    // Zile + toast kur vjen një email "NEW BOOKING" (rezervim nga email).
    let prevMaxUid: number | null = null;
    let stopped = false;
    let controller: AbortController | null = null;
    const check = async () => {
      if (stopped || controller || document.hidden) return;
      controller = new AbortController();
      const deadline = window.setTimeout(() => controller?.abort(), 25_000);
      try {
        const resp = await fetch(`${API_BASE}/admin-email/booking-latest`, { credentials: "include", cache: "no-store", signal: controller.signal });
        if (resp.status === 403 || resp.status === 503) { stopped = true; return; }
        if (!resp.ok) return;
        const data = await resp.json();
        const maxUid = Number(data?.maxUid || 0);
        if (prevMaxUid !== null && maxUid > prevMaxUid && getEmailNotifyEnabled()) {
          playBookingChime();
          toast({
            title: "📧 Rezervim i ri nga email!",
            description: "Erdhi një email i ri 'NEW BOOKING' në inbox.",
          });
        }
        prevMaxUid = maxUid;
      } catch { /* informational poll; next interval retries */ }
      finally { window.clearTimeout(deadline); controller = null; }
    };
    const onVisibility = () => {
      if (document.hidden) controller?.abort();
      else void check();
    };
    check();
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(() => { if (!stopped) check(); }, 60000);
    return () => {
      stopped = true;
      clearInterval(interval);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, emailModuleOn, isPathEnabled("/admin-email")]);

  useEffect(() => {
    if (!user || user.role !== "admin" || !isPathEnabled("/import-alerts")) return;
    const fetchImportAlerts = async () => {
      try {
        const resp = await fetch(`${API_BASE}/cp-import-alerts/count`, { credentials: "include" });
        if (resp.ok) {
          const data = await resp.json();
          setImportAlertCount(data.count ?? 0);
        }
      } catch { /* silent */ }
    };
    fetchImportAlerts();
    const interval = setInterval(fetchImportAlerts, 60000);
    return () => clearInterval(interval);
  }, [user, isPathEnabled("/import-alerts")]);

  useEffect(() => {
    if (!user || !["admin", "manager"].includes(user.role)) return;
    // Badge-i i "Ndryshime Orari" mbetet totali; për "Njoftimet" numërojmë
    // vetëm ato të palexuara (fms.read.sched).
    const recount = () => {
      const read = getReadSet(READ_KEYS.sched);
      setSchedUnreadCount(scheduleChanges.filter(c => !read.has(schedItemKey(c))).length);
    };
    setScheduleChangeCount(scheduleChanges.length);
    recount();
    window.addEventListener(NOTIF_READ_EVENT, recount);
    window.addEventListener("storage", recount);
    return () => {
      window.removeEventListener(NOTIF_READ_EVENT, recount);
      window.removeEventListener("storage", recount);
    };
  }, [user, scheduleChanges]);

  // Ndjek query-string-un e URL-së (wouter useLocation kthen vetëm pathname),
  // që linqet me query (p.sh. /flights?tab=booked) të theksohen kur je te ajo faqe.
  const [navSearch, setNavSearch] = useState(window.location.search);
  useEffect(() => {
    const sync = () => setNavSearch(window.location.search);
    window.addEventListener("popstate", sync);
    window.addEventListener("pushState" as any, sync);
    window.addEventListener("replaceState" as any, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("pushState" as any, sync);
      window.removeEventListener("replaceState" as any, sync);
    };
  }, []);
  const matchQueryHref = (href: string) => {
    const [p, q] = href.split("?");
    if (location !== p) return false;
    const want = new URLSearchParams(q);
    const have = new URLSearchParams(navSearch);
    return Array.from(want.entries()).every(([k, v]) => have.get(k) === v);
  };
  const activeQueryHref = navItems.filter(n => n.href.includes("?")).find(n => matchQueryHref(n.href))?.href;

  const sl = theme.lightSidebar ?? false;

  const navItemStyle = (isActive: boolean, href?: string) => {
    if (href === "/bookings") {
      return {
        backgroundColor: isActive ? "#16a34a" : "#dcfce7",
        color: isActive ? "#ffffff" : "#166534",
      };
    }
    return {
      backgroundColor: isActive ? theme.accentBg : undefined,
      color: isActive ? theme.accentText : undefined,
    };
  };

  const avatarStyle = {
    background: `linear-gradient(135deg, ${theme.avatarFrom}, ${theme.avatarTo})`,
  };

  const s = {
    title:       sl ? "text-slate-800"  : "text-white",
    tagline:     sl ? "text-slate-400"  : "text-white/40",
    menuLabel:   sl ? "text-slate-400"  : "text-white/30",
    navActive:   sl ? "text-slate-800"  : "text-white/90",
    navInactive: sl ? "text-slate-500 hover:text-slate-700 hover:bg-slate-900/5" : "text-white/50 hover:text-white/80 hover:bg-white/5",
    border:      sl ? "border-slate-200" : "border-white/8",
    borderMob:   sl ? "border-slate-200" : "border-white/10",
    username:    sl ? "text-slate-700"  : "text-white/80",
    email:       sl ? "text-slate-400"  : "text-white/30",
    logout:      sl ? "text-slate-400 hover:text-red-500 hover:bg-red-50" : "text-white/30 hover:text-red-400 hover:bg-red-500/10",
    menuBtn:     sl ? "hover:bg-slate-900/8" : "hover:bg-white/10",
    bellBtn:     sl ? "text-slate-500 hover:text-slate-700" : "text-white/70 hover:text-white",
  };

  return (
    <div className={cn("min-h-[100dvh] w-full flex flex-col md:flex-row", theme.id === "navyGold" && "theme-navy-gold")} style={{ backgroundColor: theme.mainBg }}>
      {/* Mobile header */}
      <div className={cn("md:hidden flex items-center justify-between px-4 py-3 border-b", s.borderMob)}
        style={{ backgroundColor: theme.sidebarBg }}>
        <div className="flex items-center gap-2.5">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="w-7 h-7 object-contain rounded-lg" />
          ) : (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: theme.accentColor }}>
              <Plane className="h-4 w-4 text-white" />
            </div>
          )}
          <span className={cn("font-bold text-base tracking-tight", s.title)}>{branding.siteName}</span>
        </div>
        <div className="flex items-center gap-2">
          <LiveTiranaClock compact />
          {flightAlertCount > 0 && (
            <Link href="/flights">
              <button className={cn("relative p-1.5", s.bellBtn)} title="Njoftime fluturimesh">
                <Plane className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 bg-black text-red-500 text-[9px] font-bold rounded flex items-center justify-center">
                  {flightAlertCount > 9 ? "9+" : flightAlertCount}
                </span>
              </button>
            </Link>
          )}
          {scheduleChangeCount > 0 && (
            <Link href="/schedule-changes">
              <button className={cn("relative p-1.5", s.bellBtn)} title="Ndryshime orari (email)">
                <CalendarClock className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {scheduleChangeCount > 9 ? "9+" : scheduleChangeCount}
                </span>
              </button>
            </Link>
          )}
          {pendingCount > 0 && (
            <Link href={user?.role === "admin" ? "/price-requests" : "/my-requests"}>
              <button className={cn("relative p-1.5", s.bellBtn)}
                title={isManagerUnread ? "Keni përgjigje të palexuara" : "Kërkesa çmimi në pritje"}>
                <Bell className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              </button>
            </Link>
          )}
          <button onClick={() => setMobileOpen(v => !v)} className={cn("p-1.5 rounded-lg transition-colors", s.menuBtn)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          "flex-col transition-all duration-200 z-50 flex-shrink-0 relative",
          "md:flex",
          mobileOpen ? "flex fixed inset-0 top-[53px] w-full" : "hidden",
          collapsed ? "md:w-16" : "md:w-64",
          !mobileOpen && "w-64",
          sl ? "border-r border-slate-200 shadow-[2px_0_12px_rgba(0,0,0,0.04)]" : ""
        )}
        style={{ backgroundColor: theme.sidebarBg }}
      >
        {/* Collapse toggle button (desktop only) */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Hap menunë" : "Mbyll menunë"}
          className={cn(
            "hidden md:flex absolute -right-3 top-7 z-10 w-6 h-6 rounded-full items-center justify-center shadow border transition-colors",
            sl ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-50" : "bg-slate-800 border-white/10 text-white/80 hover:bg-slate-700"
          )}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        {/* Logo */}
        <div className={cn(
          "hidden md:flex items-center gap-3 border-b",
          collapsed ? "px-3 py-5 justify-center" : "px-6 py-5",
          s.border
        )}>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="w-9 h-9 object-contain rounded-xl" />
          ) : (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
              style={{ backgroundColor: theme.accentColor, boxShadow: `0 4px 14px ${theme.accentColor}4d` }}>
              <Plane className="h-5 w-5 text-white" />
            </div>
          )}
          {!collapsed && (
            <div>
              <div className={cn("font-bold text-lg tracking-tight leading-none", s.title)}>{branding.siteName}</div>
              <div className={cn("text-[11px] font-medium mt-0.5", s.tagline)}>{branding.tagline}</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {!collapsed && (
            <div className={cn("text-[10px] font-semibold uppercase tracking-widest px-3 mb-3", s.menuLabel)}>Menuja</div>
          )}
          {navItems.filter(item => {
            if (!isPathEnabled(item.href.split("?")[0])) return false;
            // Moduli i email-it i fikur nga Settings → fshih zërin "Email"
            if (item.href === "/admin-email" && !emailModuleOn) return false;
            const role = user?.role || "";
            // Admin sheh gjithçka. Për të tjerët: nëse zëri ka 'permission', ajo
            // është autoritative (leja vendos, jo roli); përndryshe kontrollo rolin.
            if (role === "admin") return true;
            const permission = (item as any).permission;
            if (permission) return hasPermission(permission);
            return !item.roles || item.roles.includes(role);
          }).map((item) => {
            const isActive = item.href.includes("?")
              ? item.href === activeQueryHref
              : item.exact
                ? location === item.href
                : (location === item.href || location.startsWith(item.href + "/")) &&
                  !(activeQueryHref && activeQueryHref.startsWith(item.href + "?"));
            return (
              <Link
                key={item.href}
                onMouseEnter={() => preloadNavigation(item.href)}
                onFocus={() => preloadNavigation(item.href)}
                onTouchStart={() => preloadNavigation(item.href)}
                href={item.href === "/agents" && enrollmentCount > 0 ? "/agents?pending=1" : item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                data-nav-active={isActive ? "true" : "false"}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium relative",
                  collapsed && "md:justify-center md:px-2",
                  isActive ? s.navActive : s.navInactive
                )}
                style={navItemStyle(isActive, item.href)}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                    style={{ backgroundColor: theme.indicatorColor }} />
                )}
                <span className="relative shrink-0">
                  <item.icon
                    className="h-4 w-4 transition-colors"
                    style={{ color: item.href === "/bookings" ? (isActive ? "#ffffff" : "#166534") : (isActive ? theme.accentText : undefined) }}
                  />
                  {collapsed && item.href === "/bookings" && draftCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {draftCount > 9 ? "9+" : draftCount}
                    </span>
                  )}
                  {collapsed && item.href === "/agents" && enrollmentCount > 0 && <span title="Regjistrime në pritje" data-testid="pending-count-collapsed" className="absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">{enrollmentCount}</span>}
                  {collapsed && item.href === "/tasks" && myTasksCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {myTasksCount > 9 ? "9+" : myTasksCount}
                    </span>
                  )}
                  {collapsed && item.href === "/flights" && flightAlertCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 px-0.5 bg-black text-red-500 text-[8px] font-bold rounded flex items-center justify-center">
                      {flightAlertCount > 9 ? "9+" : flightAlertCount}
                    </span>
                  )}
                  {collapsed && item.href === "/import-alerts" && importAlertCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 px-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {importAlertCount > 9 ? "9+" : importAlertCount}
                    </span>
                  )}
                  {collapsed && item.href === "/schedule-changes" && scheduleChangeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 px-0.5 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {scheduleChangeCount > 9 ? "9+" : scheduleChangeCount}
                    </span>
                  )}
                  {collapsed && item.href === "/notifications" && systemNotifications.filter(n => n.type === "wizz_price_drop" && !n.readAt).length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 px-0.5 bg-emerald-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {systemNotifications.filter(n => n.type === "wizz_price_drop" && !n.readAt).length > 9 ? "9+" : systemNotifications.filter(n => n.type === "wizz_price_drop" && !n.readAt).length}
                    </span>
                  )}
                </span>
                {!collapsed && item.label}
                {item.href === "/agents" && user?.role === "admin" && enrollments.error && <span role="alert" title="Numri i regjistrimeve në pritje nuk u ngarkua" className="text-red-600 font-bold">!</span>}
                {!collapsed && item.href === "/agents" && enrollmentCount > 0 && <span title="Regjistrime në pritje" data-testid="pending-count" className="ml-auto rounded-full bg-red-600 text-white text-xs font-bold px-2 py-0.5">{enrollmentCount}</span>}
                {!collapsed && item.href === "/bookings" && draftCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {draftCount > 99 ? "99+" : draftCount}
                  </span>
                )}
                {!collapsed && item.href === "/tasks" && myTasksCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {myTasksCount > 99 ? "99+" : myTasksCount}
                  </span>
                )}
                {!collapsed && item.href === "/flights" && flightAlertCount > 0 && (
                  <span className="ml-auto bg-black text-red-500 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none">
                    {flightAlertCount > 99 ? "99+" : flightAlertCount}
                  </span>
                )}
                {!collapsed && item.href === "/import-alerts" && importAlertCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {importAlertCount > 99 ? "99+" : importAlertCount}
                  </span>
                )}
                {!collapsed && item.href === "/schedule-changes" && scheduleChangeCount > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {scheduleChangeCount > 99 ? "99+" : scheduleChangeCount}
                  </span>
                )}
                {!collapsed && item.href === "/notifications" && systemNotifications.filter(n => n.type === "wizz_price_drop" && !n.readAt).length > 0 && (
                  <span className="ml-auto bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {systemNotifications.filter(n => n.type === "wizz_price_drop" && !n.readAt).length > 99 ? "99+" : systemNotifications.filter(n => n.type === "wizz_price_drop" && !n.readAt).length}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Bell / Price requests */}
          {(() => {
            const isAdmin = user?.role === "admin";
            const href = isAdmin ? "/price-requests" : "/my-requests";
            const label = isAdmin ? "Kërkesat e Çmimit" : "Njoftimet e mia";
            const isActive = location === href;
            if (!user) return null;
            return (
              <Link
                href={href}
                onMouseEnter={() => preloadNavigation(href)}
                onFocus={() => preloadNavigation(href)}
                onTouchStart={() => preloadNavigation(href)}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? label : undefined}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium relative",
                  collapsed && "md:justify-center md:px-2",
                  isActive ? s.navActive : s.navInactive
                )}
                style={navItemStyle(isActive)}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                    style={{ backgroundColor: theme.indicatorColor }} />
                )}
                <span className="relative shrink-0">
                  <Bell
                    className="h-4 w-4 transition-colors"
                    style={{ color: isActive ? theme.accentText : undefined }}
                  />
                  {pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </span>
                {!collapsed && label}
                {!collapsed && pendingCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })()}
        </nav>

        {/* User footer */}
        <div className={cn("px-3 py-4 border-t", s.border)}>
          <div className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl",
            collapsed && "md:flex-col md:gap-2 md:px-0"
          )}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm"
              style={avatarStyle} title={collapsed ? (user?.name || "Admin") : undefined}>
              {initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className={cn("text-sm font-medium truncate", s.username)}>{user?.name || "Admin"}</div>
                <div className={cn("text-[11px] truncate", s.email)}>{user?.email}</div>
              </div>
            )}
            <button onClick={() => logout()} title="Dil"
              className={cn("p-1.5 rounded-lg transition-colors shrink-0", s.logout)}>
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
          <Link href="/settings">
            <div className={cn(
              "mt-2 text-center font-medium cursor-pointer hover:opacity-80 transition-opacity",
              collapsed ? "text-[9px]" : "text-[10px]",
              s.email
            )} title="Shiko historikun e versioneve">
              v{APP_VERSION}
            </div>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {user?.role === "admin" && <AdminOfferBanner />}
        {/* Rresht i kuq: fluturimet që mbyllin shitjen brenda 1 ore */}
        {isPathEnabled("/notifications") && <ClosingSoonBanner />}
        {/* Rresht i kuq: fluturimet me pak vende në Google (1/3 e para) */}
        {isPathEnabled("/notifications") && <SeatAlertBanner />}
        {/* Top bar */}
        <header className="hidden md:flex items-center justify-between gap-4 px-4 lg:px-8 py-3.5 bg-white border-b border-gray-200 shrink-0">
          <div className="min-w-0 truncate text-sm text-gray-500">
            <span className="text-gray-400">{branding.siteName}</span>
            {location !== "/" && (
              <>
                <span className="mx-1.5 text-gray-300">/</span>
                <span className="text-gray-700 font-medium capitalize">
                  {navItems.find(n => location === n.href || location.startsWith(n.href + "/"))?.label ||
                    (location === "/price-requests"  ? "Kërkesat e Çmimit" :
                     location === "/my-requests"     ? "Njoftimet e mia" :
                     location === "/permissions"     ? "Lejet e Roleve" :
                     location === "/settings"        ? "Cilësimet" :
                     location === "/group-tickets"   ? "Bileta Grupi" : "")}
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LiveTiranaClock />
            {(pendingCount > 0 || user?.role === "admin") && (
              <Link href={user?.role === "admin" ? "/price-requests" : "/my-requests"}>
                <button
                  className={cn(
                    "relative p-2 rounded-lg transition-colors",
                    pendingCount > 0 ? "text-amber-600 hover:bg-amber-50" : "text-gray-400 hover:bg-gray-100"
                  )}
                  title={isManagerUnread ? "Keni përgjigje të palexuara" : pendingCount > 0 ? "Kërkesa çmimi në pritje" : "Njoftimet"}
                >
                  <Bell className="h-4 w-4" />
                  {pendingCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </button>
              </Link>
            )}
            <div className="h-5 w-px bg-gray-200" />
            <div className="flex items-center gap-2.5 pl-1 px-2 py-1.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[11px]"
                style={avatarStyle}>
                {initials}
              </div>
              <span className="text-sm font-medium text-gray-700">{user?.name || "Admin"}</span>
            </div>
            <button onClick={() => logout()} title="Dil nga sistemi"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium">
              <LogOut className="h-3.5 w-3.5" />
              Dil
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: theme.mainBg }}>
          <div className="w-full px-3 py-5 md:px-4 md:py-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
