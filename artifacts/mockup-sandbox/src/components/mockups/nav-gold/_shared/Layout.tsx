import { useState, type ReactNode } from "react";
import {
  Plane, Home, Ticket, Users, Briefcase, CreditCard, BarChart3, Menu, X, Percent,
  LogOut, UserCog, ShieldCheck, Bell, Settings, Layers, Webhook, ScanSearch, MapPin,
  ChevronLeft, ChevronRight, CheckSquare, PlaneTakeoff, Globe, AlertTriangle,
  CalendarClock, Lock, Star, Mail, TrendingUp, Telescope, Radar, Activity, Sparkles,
} from "lucide-react";

const cn = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(" ");

// ThemeContext.tsx THEMES.graphite (the source provider's default). No localStorage.
export const theme = {
  sidebarBg: "#e9ebee", accentColor: "#64748b", accentBg: "rgba(100,116,139,0.14)",
  accentText: "#334155", indicatorColor: "#64748b", avatarFrom: "#94a3b8",
  avatarTo: "#64748b", mainBg: "#f1f2f4", lightSidebar: true,
};
const branding = { siteName: "FMS Demo", tagline: "Flight Management System" };
const identity = { name: "Demo Operator", email: "operator@example.invalid", initials: "DO" };

// layout.tsx navItems: labels, order and icons retained; all modules visible locally.
const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/notifications", label: "Njoftimet", icon: Bell },
  { href: "/atlas-seat-alerts", label: "Njoftime Atlas", icon: Radar },
  { href: "/flights", label: "Fluturimet", icon: Plane },
  { href: "/flights?external=blocked", label: "Fluturime të Bllokuara", icon: Lock },
  { href: "/flights?tab=booked", label: "Fluturime të Konfirmuara", icon: Star },
  { href: "/offline-flights", label: "Offline Flights", icon: Globe },
  { href: "/flight-discovery", label: "Fluturime të Palistuara", icon: Telescope },
  { href: "/wizz-price-monitor", label: "Monitorimi Wizz", icon: Activity },
  { href: "/kyte-search", label: "Kërkim Kyte", icon: ScanSearch },
  { href: "/bookings", label: "Rezervimet", icon: Ticket },
  { href: "/passengers", label: "Pasagjerët", icon: Users },
  { href: "/tasks", label: "Detyrat", icon: CheckSquare },
  { href: "/claim", label: "Claim", icon: AlertTriangle },
  { href: "/assistant", label: "Asistenti AI", icon: Sparkles },
  { href: "/agents", label: "Agjentët", icon: Briefcase },
  { href: "/payments", label: "Pagesat", icon: CreditCard },
  { href: "/reports", label: "Raportet", icon: BarChart3 },
  { href: "/group-tickets", label: "Bileta Grupi", icon: Layers },
  { href: "/users", label: "Përdoruesit", icon: UserCog },
  { href: "/permissions", label: "Lejet e Roleve", icon: ShieldCheck },
  { href: "/schedule-check", label: "Kontrollo Oraret", icon: ScanSearch },
  { href: "/schedule-changes", label: "Ndryshime Orari", icon: CalendarClock },
  { href: "/flight-types", label: "Llojet e Fluturimeve", icon: PlaneTakeoff },
  { href: "/integrations", label: "Integrimet", icon: Webhook },
  { href: "/destinations", label: "Destinacione", icon: MapPin },
  { href: "/price-rules", label: "Rregullat e Çmimeve", icon: TrendingUp },
  { href: "/discounts", label: "Discount", icon: Percent },
  { href: "/settings", label: "Cilësimet", icon: Settings },
  { href: "/import-alerts", label: "Njoftime Importi dhe Sistemi", icon: AlertTriangle },
  { href: "/admin-email", label: "Email", icon: Mail },
];

// Routing stub: preserve anchor semantics but never leave the isolated preview.
export function Link({ href, children, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} onClick={event => { event.preventDefault(); onClick?.(event); }}>{children}</a>;
}

// layout.tsx LiveTiranaClock JSX; deterministic illustrative time, no timer/effects.
function LiveTiranaClock({ compact = false }: { compact?: boolean }) {
  return <div className={cn("flex items-center rounded-lg border tabular-nums",
    compact ? "gap-1 border-white/15 bg-white/5 px-1.5 py-1" : "gap-2 border-gray-200 bg-gray-50/80 px-2.5 py-1.5")}
    data-testid="status-live-tirana-clock" title="Data dhe ora lokale në Europe/Tirane">
    {!compact && <span className="whitespace-nowrap text-[11px] font-medium text-gray-500" data-testid="text-live-date">19 maj 2026</span>}
    <time className={cn("whitespace-nowrap font-semibold tracking-[0.04em]", compact ? "text-[11px] text-white/90" : "text-xs text-gray-800")} dateTime="2026-05-19T10:35:00Z" data-testid="text-live-time">12:35:00</time>
    <span className="rounded bg-red-600 px-1.5 py-0.5 text-[8px] font-extrabold leading-none tracking-wide text-white shadow-sm" data-testid="badge-live" aria-label="Ora live">LIVE</span>
  </div>;
}

// layout.tsx LayoutFull render, source lines 440–843. The local stub boundary
// fixes /bookings, enables modules, empties notifications/banners and anonymizes identity.
// Zero-count conditional badges and absent-logo branches have been elided only.
export function PreviewLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const sl = theme.lightSidebar;
  const s = {
    title: sl ? "text-slate-800" : "text-white",
    tagline: sl ? "text-slate-400" : "text-white/40",
    menuLabel: sl ? "text-slate-400" : "text-white/30",
    navActive: sl ? "text-slate-800" : "text-white/90",
    navInactive: sl ? "text-slate-500 hover:text-slate-700 hover:bg-slate-900/5" : "text-white/50 hover:text-white/80 hover:bg-white/5",
    border: sl ? "border-slate-200" : "border-white/8",
    borderMob: sl ? "border-slate-200" : "border-white/10",
    username: sl ? "text-slate-700" : "text-white/80",
    email: sl ? "text-slate-400" : "text-white/30",
    logout: sl ? "text-slate-400 hover:text-red-500 hover:bg-red-50" : "text-white/30 hover:text-red-400 hover:bg-red-500/10",
    menuBtn: sl ? "hover:bg-slate-900/8" : "hover:bg-white/10",
  };
  const avatarStyle = { background: `linear-gradient(135deg, ${theme.avatarFrom}, ${theme.avatarTo})` };
  const navItemStyle = (active: boolean, href?: string) => href === "/bookings"
    ? { backgroundColor: active ? "#16a34a" : "#dcfce7", color: active ? "#ffffff" : "#166534" }
    : { backgroundColor: active ? theme.accentBg : undefined, color: active ? theme.accentText : undefined };
  return (
    <div className="min-h-[100dvh] w-full flex flex-col md:flex-row" style={{ backgroundColor: theme.mainBg }}>
      <div className={cn("md:hidden flex items-center justify-between px-4 py-3 border-b", s.borderMob)} style={{ backgroundColor: theme.sidebarBg }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.accentColor }}><Plane className="h-4 w-4 text-white" /></div>
          <span className={cn("font-bold text-base tracking-tight", s.title)}>{branding.siteName}</span>
        </div>
        <div className="flex items-center gap-2">
          <LiveTiranaClock compact />
          <button onClick={() => setMobileOpen(v => !v)} className={cn("p-1.5 rounded-lg transition-colors", s.menuBtn)}>{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      <aside className={cn("flex-col transition-all duration-200 z-50 flex-shrink-0 relative", "md:flex", mobileOpen ? "flex fixed inset-0 top-[53px] w-full" : "hidden", collapsed ? "md:w-16" : "md:w-64", !mobileOpen && "w-64", sl ? "border-r border-slate-200 shadow-[2px_0_12px_rgba(0,0,0,0.04)]" : "")} style={{ backgroundColor: theme.sidebarBg }}>
        <button onClick={() => setCollapsed(v => !v)} title={collapsed ? "Hap menunë" : "Mbyll menunë"} className={cn("hidden md:flex absolute -right-3 top-7 z-10 w-6 h-6 rounded-full items-center justify-center shadow border transition-colors", sl ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-50" : "bg-slate-800 border-white/10 text-white/80 hover:bg-slate-700")}>{collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}</button>
        <div className={cn("hidden md:flex items-center gap-3 border-b", collapsed ? "px-3 py-5 justify-center" : "px-6 py-5", s.border)}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg" style={{ backgroundColor: theme.accentColor, boxShadow: `0 4px 14px ${theme.accentColor}4d` }}><Plane className="h-5 w-5 text-white" /></div>
          {!collapsed && <div><div className={cn("font-bold text-lg tracking-tight leading-none", s.title)}>{branding.siteName}</div><div className={cn("text-[11px] font-medium mt-0.5", s.tagline)}>{branding.tagline}</div></div>}
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {!collapsed && <div className={cn("text-[10px] font-semibold uppercase tracking-widest px-3 mb-3", s.menuLabel)}>Menuja</div>}
          {navItems.map(item => {
            const isActive = item.href === "/bookings";
            return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} title={collapsed ? item.label : undefined} className={cn("group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium relative", collapsed && "md:justify-center md:px-2", isActive ? s.navActive : s.navInactive)} style={navItemStyle(isActive, item.href)}>
              {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ backgroundColor: theme.indicatorColor }} />}
              <span className="relative shrink-0"><item.icon className="h-4 w-4 transition-colors" style={{ color: item.href === "/bookings" ? (isActive ? "#ffffff" : "#166534") : (isActive ? theme.accentText : undefined) }} /></span>
              {!collapsed && item.label}
            </Link>;
          })}
          <Link href="/price-requests" onClick={() => setMobileOpen(false)} title={collapsed ? "Kërkesat e Çmimit" : undefined} className={cn("group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium relative", collapsed && "md:justify-center md:px-2", s.navInactive)} style={navItemStyle(false)}>
            <span className="relative shrink-0"><Bell className="h-4 w-4 transition-colors" /></span>{!collapsed && "Kërkesat e Çmimit"}
          </Link>
        </nav>
        <div className={cn("px-3 py-4 border-t", s.border)}>
          <div className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl", collapsed && "md:flex-col md:gap-2 md:px-0")}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm" style={avatarStyle} title={collapsed ? identity.name : undefined}>{identity.initials}</div>
            {!collapsed && <div className="flex-1 min-w-0"><div className={cn("text-sm font-medium truncate", s.username)}>{identity.name}</div><div className={cn("text-[11px] truncate", s.email)}>{identity.email}</div></div>}
            <button title="Dil" className={cn("p-1.5 rounded-lg transition-colors shrink-0", s.logout)}><LogOut className="h-3.5 w-3.5" /></button>
          </div>
          <Link href="/settings"><div className={cn("mt-2 text-center font-medium cursor-pointer hover:opacity-80 transition-opacity", collapsed ? "text-[9px]" : "text-[10px]", s.email)} title="Shiko historikun e versioneve">v1.535</div></Link>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Banner data is empty locally: source banners render nothing in this state. */}
        <header className="hidden md:flex items-center justify-between gap-4 px-4 lg:px-8 py-3.5 bg-white border-b border-gray-200 shrink-0">
          <div className="min-w-0 truncate text-sm text-gray-500"><span className="text-gray-400">{branding.siteName}</span><span className="mx-1.5 text-gray-300">/</span><span className="text-gray-700 font-medium capitalize">Rezervimet</span></div>
          <div className="flex shrink-0 items-center gap-2">
            <LiveTiranaClock />
            <Link href="/price-requests"><button className="relative p-2 rounded-lg transition-colors text-gray-400 hover:bg-gray-100" title="Njoftimet"><Bell className="h-4 w-4" /></button></Link>
            <div className="h-5 w-px bg-gray-200" />
            <div className="flex items-center gap-2.5 pl-1 px-2 py-1.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[11px]" style={avatarStyle}>{identity.initials}</div><span className="text-sm font-medium text-gray-700">{identity.name}</span></div>
            <button title="Dil nga sistemi" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium"><LogOut className="h-3.5 w-3.5" />Dil</button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: theme.mainBg }}><div className="w-full px-3 py-5 md:px-4 md:py-6">{children}</div></div>
      </main>
    </div>
  );
}
