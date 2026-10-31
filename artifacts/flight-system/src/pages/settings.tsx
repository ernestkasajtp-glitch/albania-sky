import { useState, useEffect, useRef } from "react";
import { GoogleRuleFlightPicker, GoogleRuleFlightPickerFooter } from "@/components/google-rule-flight-picker";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Settings, Upload, Palette, Type, Image, RefreshCw, Check, Loader2, X, Paintbrush, Globe, TrendingUp, Clock, Eye, EyeOff, Plane, Plus, Trash2, Tag, Pencil, History, MessageCircle, Search, ChevronDown, ChevronRight, ChevronLeft, Calculator, Wifi, Copy, Download, ShieldAlert } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsCard as Card } from "@/components/settings/SettingsCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useChatEnabled, setChatEnabled } from "@/lib/chat-enabled";
import { BOOKING_CHIMES, getBookingChimeId, setBookingChimeId, playBookingChime, getFlightChimeId, setFlightChimeId, playFlightAlertChime, getEmailNotifyEnabled, setEmailNotifyEnabled, getGoogleLiveAutoEnabled, setGoogleLiveAutoEnabled } from "@/hooks/useLiveUpdates";
import { Bell, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme, THEMES } from "@/context/ThemeContext";
import { cn, fmtFlightNum, fmtAmPm, fmtDateTimeAmPm, fmtM } from "@/lib/utils";
import { confirmDangerDialog } from "@/lib/confirm";
import { APP_VERSION } from "@/lib/version";
import { CHANGELOG } from "@/lib/changelog";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useModules } from "@/context/ModulesContext";
import { clearPerformanceMetrics, getPerformanceMetrics } from "@/lib/performanceMetrics";
import { AgencyGroupsSettings } from "@/components/AgencyGroups";
import { GuestFlightAccess } from "@/components/GuestFlightAccess";
import { PageLayoutsSection } from "@/components/settings/PageLayoutsSection";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

function ModulesSettings() {
  const { modules, loading, error, setEnabled, saving } = useModules();
  const { toast } = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);

  const toggle = async (id: string, enabled: boolean) => {
    setSavingId(id);
    try {
      await setEnabled(id, enabled);
      toast({ title: enabled ? "Moduli u aktivizua" : "Moduli u çaktivizua", description: "Të dhënat nuk janë fshirë." });
    } catch (cause) {
      toast({ title: "Ndryshimi nuk u ruajt", description: cause instanceof Error ? cause.message : "Provoni përsëri.", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card data-testid="card-modules-settings">
      <CardHeader className="p-4">
        <CardTitle className="text-base">Faqet / Modulet</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <p className="mb-3 text-xs text-muted-foreground">Aktivizoni ose çaktivizoni faqe të plota për të gjithë përdoruesit. Çaktivizimi fsheh faqen, por nuk fshin asnjë të dhënë.</p>
        {loading && <p role="status" data-testid="status-modules-loading">Duke ngarkuar modulet…</p>}
        {error && <p role="alert" data-testid="status-modules-settings-error" className="text-sm text-red-600">Modulet nuk u ngarkuan: {error}. Asnjë ndryshim nuk mund të bëhet.</p>}
        <div className="overflow-x-auto rounded-lg border">
        {!loading && !error && modules.map(module => (
          <div key={module.id} data-testid={`row-module-${module.id}`} className="grid min-w-[680px] grid-cols-[190px_minmax(0,1fr)_100px_44px] items-center gap-3 border-b px-3 py-2 last:border-b-0">
              <div className="truncate text-sm font-medium" title={module.label} data-testid={`text-module-${module.id}`}>{module.label}</div>
              <p className="truncate text-xs text-muted-foreground" title={module.description}>{module.description}</p>
              <p className="whitespace-nowrap text-xs font-medium text-muted-foreground" title={module.locked ? module.reason ?? "Ky modul nuk mund të ndryshohet." : module.enabled ? "Aktiv" : "I çaktivizuar · Të dhënat ruhen"} data-testid={`status-module-${module.id}`}>
                {savingId === module.id ? "Duke ruajtur…" : module.locked ? "I bllokuar" : module.enabled ? "Aktiv" : "I çaktivizuar"}
              </p>
            <Switch
              data-testid={`switch-module-${module.id}`}
              aria-label={`${module.enabled ? "Çaktivizo" : "Aktivizo"} ${module.label}`}
              checked={module.enabled}
              disabled={module.locked || saving || !!error}
              onCheckedChange={enabled => void toggle(module.id, enabled)}
            />
          </div>
        ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface Branding {
  id: number;
  siteName: string;
  tagline: string;
  logoBase64: string | null;
  backgroundBase64: string | null;
  primaryColor: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ImageUploadZone({
  label, value, accept, onUpload, onClear, maxKb = 500,
}: {
  label: string;
  value: string | null;
  accept: string;
  onUpload: (b64: string) => void;
  onClear: () => void;
  maxKb?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    if (file.size > maxKb * 1024) {
      toast({ title: `Imazhi duhet të jetë nën ${maxKb}KB`, variant: "destructive" });
      return;
    }
    const b64 = await fileToBase64(file);
    onUpload(b64);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 group">
          <img src={value} alt={label} className="w-full max-h-48 object-contain bg-gray-50 p-4" />
          <button
            onClick={onClear}
            className="absolute top-2 right-2 bg-white/90 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded-full p-1.5 shadow transition-colors opacity-0 group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
          }`}
        >
          <Upload className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          <div className="text-sm text-gray-500">Kliko ose tërhiq imazhin këtu</div>
          <div className="text-xs text-gray-400 mt-1">PNG, JPG, SVG · max {maxKb}KB</div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

// Mini sidebar preview inside theme card
function ThemePreview({ theme, isActive }: { theme: typeof THEMES[string]; isActive: boolean }) {
  const surface = theme.systemDark ? "#112239" : "#ffffff";
  const mutedSurface = theme.systemDark ? "#1a304b" : "#e5e7eb";
  return (
    <div className={cn(
      "relative w-full h-24 rounded-xl overflow-hidden border-2 transition-all",
      isActive ? "border-gray-900 shadow-lg scale-[1.02]" : "border-gray-200 hover:border-gray-400"
    )}>
      {/* Sidebar strip */}
      <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col pt-2 pb-2 px-1.5 gap-1"
        style={{ backgroundColor: theme.sidebarBg }}>
        {/* Logo dot */}
        <div className="w-5 h-5 rounded-md mb-1 mx-auto"
          style={{ backgroundColor: theme.accentColor }} />
        {/* Nav items */}
        {[true, false, false, false].map((active, i) => (
          <div key={i} className="h-2 rounded-sm w-full"
            style={{ backgroundColor: active ? theme.accentBg : "rgba(255,255,255,0.08)" }}>
            {active && <div className="absolute left-0 h-2 w-0.5 rounded-r-sm" style={{ backgroundColor: theme.indicatorColor }} />}
          </div>
        ))}
      </div>
      {/* Content area */}
      <div className="absolute left-10 right-0 top-0 bottom-0 flex flex-col p-2 gap-1.5"
        style={{ backgroundColor: theme.mainBg }}>
        {/* Top bar */}
        <div className="h-3 rounded-sm w-full" style={{ backgroundColor: surface }} />
        {/* Cards */}
        <div className="flex gap-1 flex-1">
          {[theme.accentColor, mutedSurface, mutedSurface].map((bg, i) => (
            <div key={i} className="flex-1 rounded-sm h-full opacity-80"
              style={{ backgroundColor: i === 0 ? bg + "22" : bg }} />
          ))}
        </div>
      </div>
      {/* Active checkmark */}
      {isActive && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center shadow">
          <Check className="h-3 w-3 text-white" />
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const [siteName, setSiteName]         = useState("");
  const [tagline, setTagline]           = useState("");
  const [logoB64, setLogoB64]           = useState<string | null>(null);
  const [bgB64, setBgB64]               = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#3b82f6");

  const { themeId, setTheme, theme } = useTheme();
  const chatEnabled = useChatEnabled();
  const { user, hasPermission } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const exportPerformanceReport = () => {
    const report = { records: getPerformanceMetrics() };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fms-performance-report.json";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const clearPerformanceReport = () => {
    clearPerformanceMetrics();
    toast({ title: "Matjet e performancës u fshinë" });
  };

  // Price formula state
  const [formulaMinimum,  setFormulaMinimum]  = useState("0");
  const [formulaAbove,    setFormulaAbove]    = useState("0");
  const [formulaPercent,  setFormulaPercent]  = useState("0");
  const [formulaFallback, setFormulaFallback] = useState("0");
  const [formulaSaving,   setFormulaSaving]   = useState(false);
  const [formulaSaved,    setFormulaSaved]    = useState(false);

  // Citizen (CitizenPlane) markup state
  const [citizenMarkupType,  setCitizenMarkupType]  = useState<"percent" | "fixed">("percent");
  const [citizenMarkupValue, setCitizenMarkupValue] = useState("0");
  const [citizenSaving,      setCitizenSaving]      = useState(false);
  const [citizenSaved,       setCitizenSaved]       = useState(false);

  // Sell-cutoff state
  const [cutoffHours,    setCutoffHours]    = useState("3");
  const [cutoffSaving,   setCutoffSaving]   = useState(false);
  const [cutoffSaved,    setCutoffSaved]    = useState(false);
  const [confCutoffHours,  setConfCutoffHours]  = useState("4");
  const [confCutoffSaving, setConfCutoffSaving] = useState(false);
  const [confCutoffSaved,  setConfCutoffSaved]  = useState(false);

  // Agent price rounding (whole euro vs exact 2 decimals)
  const [agentRoundWhole, setAgentRoundWhole] = useState(true);
  const [agentRoundSaving, setAgentRoundSaving] = useState(false);

  // Guest website markup (vetëm vizitorët e paregjistruar / pa login)
  const [guestMarkupType,  setGuestMarkupType]  = useState<"percent" | "fixed">("percent");
  const [guestMarkupValue, setGuestMarkupValue] = useState("0");
  const [guestMarkupSaving, setGuestMarkupSaving] = useState(false);
  const [guestMarkupSaved,  setGuestMarkupSaved]  = useState(false);

  // Google price refresh interval (TTL) state
  const [gpTtlHours,  setGpTtlHours]  = useState("6");
  const [gpDailyTime, setGpDailyTime] = useState("");
  const [gpNextRun, setGpNextRun] = useState<string | null>(null);
  const [gpTimeSaving, setGpTimeSaving] = useState(false);
  const [gpTtlSaving, setGpTtlSaving] = useState(false);
  const [gpTtlSaved,  setGpTtlSaved]  = useState(false);
  const [gpRefreshing, setGpRefreshing] = useState(false);

  // Seat-availability check state (separate Google check for N persons)
  const [scEnabled, setScEnabled] = useState(false);
  const [scDays, setScDays] = useState("10");
  const [scMinSeats, setScMinSeats] = useState("5");
  const [scInterval, setScInterval] = useState("720"); // minutes (720 = 12h)
  const [scFlaggedInterval, setScFlaggedInterval] = useState("5");
  const [scAutoSoldOut, setScAutoSoldOut] = useState(false);
  const [scLastRun, setScLastRun] = useState<string | null>(null);
  const [scSaving, setScSaving] = useState(false);
  const [scSaved, setScSaved] = useState(false);
  const [scRunning, setScRunning] = useState(false);
  // When on, the same seat check also refreshes Google prices for the window.
  const [scRefreshPrices, setScRefreshPrices] = useState(false);
  // When on, an in-app task is created for every flight auto-marked Sold Out.
  const [scSoldOutTask, setScSoldOutTask] = useState(false);

  // "Pa Çmim" dedicated re-check interval state (separate from the global TTL)
  const [npEnabled, setNpEnabled] = useState(true);
  const [npInterval, setNpInterval] = useState("5");
  const [npLastRun, setNpLastRun] = useState<string | null>(null);
  const [npSaving, setNpSaving] = useState(false);
  const [npSaved, setNpSaved] = useState(false);
  const [npRunning, setNpRunning] = useState(false);

  // "Çmim i Vjetër" uses a separate cadence but shares the same Settings card.
  const [spcEnabled, setSpcEnabled] = useState(true);
  const [spcInterval, setSpcInterval] = useState("60");
  const [spcLastRun, setSpcLastRun] = useState<string | null>(null);
  const [spcSaving, setSpcSaving] = useState(false);
  const [spcSaved, setSpcSaved] = useState(false);
  const [spcRunning, setSpcRunning] = useState(false);

  // "Çmim i Ri" dedicated candidate-fetch interval state (display-only auto-fetch)
  const [npriEnabled, setNpriEnabled] = useState(true);
  const [npriInterval, setNpriInterval] = useState("30");
  const [npriLastRun, setNpriLastRun] = useState<string | null>(null);
  const [npriSaving, setNpriSaving] = useState(false);
  const [npriSaved, setNpriSaved] = useState(false);
  const [npriRunning, setNpriRunning] = useState(false);

  // "Raport Ndryshimi Çmimesh" email mode state
  const [prMode, setPrMode] = useState<"always" | "daily_manual" | "threshold" | "off">("always");
  const [prThreshold, setPrThreshold] = useState("10");
  const [prSaving, setPrSaving] = useState(false);
  const [prSaved, setPrSaved] = useState(false);

  // Social-proof badges on the public booking-engine flight cards.
  const [spEnabled, setSpEnabled] = useState(true);
  const [spSaving, setSpSaving] = useState(false);
  const [spSaved, setSpSaved] = useState(false);

  // Upcoming-days setting state ("Të Aferta" tab interval)
  const [upcomingDays, setUpcomingDays] = useState("7");
  const [upcomingDaysSaving, setUpcomingDaysSaving] = useState(false);
  const [upcomingDaysSaved, setUpcomingDaysSaved] = useState(false);

  // Default checked-baggage rule (auto-fill i formës "Fluturim i Ri")
  const [bagCount, setBagCount] = useState("1");
  const [bagKg, setBagKg] = useState("20");
  const [bagPrice, setBagPrice] = useState("60");
  const [bagSaving, setBagSaving] = useState(false);
  const [bagSaved, setBagSaved] = useState(false);

  // Booking engine visibility state
  type BeFlight = { id: number; flightNumber: string; airline: string; fromCity: string; toCity: string; departureDate: string; status: string; showInBookingEngine: boolean };
  const [beFlights, setBeFlights] = useState<BeFlight[]>([]);
  const [beLoading, setBeLoading] = useState(false);
  const [beSearch,  setBeSearch]  = useState("");
  const [beToggling, setBeToggling] = useState<Set<number>>(new Set());
  const [beSelectAllLoading, setBeSelectAllLoading] = useState(false);

  const fetchFormula = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/price-formula`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setFormulaMinimum(data.minimum   || "0");
        setFormulaAbove(data.above       || "0");
        setFormulaPercent(data.percent   || "0");
        setFormulaFallback(data.fallback || "0");
      }
    } catch { /* ignore */ }
  };

  const fetchCitizenPricing = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/citizen-pricing`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setCitizenMarkupType(data.type === "fixed" ? "fixed" : "percent");
        setCitizenMarkupValue(data.value || "0");
      }
    } catch { /* ignore */ }
  };

  const fetchCutoff = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/sell-cutoff`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setCutoffHours(String(data.hours ?? "3"));
      }
    } catch { /* ignore */ }
  };

  const fetchConfCutoff = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/confirmed-sell-cutoff`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setConfCutoffHours(String(data.hours ?? "4"));
      }
    } catch { /* ignore */ }
  };

  const handleSaveConfCutoff = async () => {
    setConfCutoffSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/confirmed-sell-cutoff`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hours: parseFloat(confCutoffHours) || 4 }),
      });
      if (resp.ok) {
        setConfCutoffSaved(true);
        setTimeout(() => setConfCutoffSaved(false), 2000);
        toast({ title: "Koha e mbylljes për të konfirmuarat u ruajt" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setConfCutoffSaving(false); }
  };

  const handleSaveCutoff = async () => {
    setCutoffSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/sell-cutoff`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hours: parseFloat(cutoffHours) || 3 }),
      });
      if (resp.ok) {
        setCutoffSaved(true);
        setTimeout(() => setCutoffSaved(false), 2000);
        toast({ title: "Koha e mbylljes u ruajt" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setCutoffSaving(false); }
  };

  const fetchAgentRounding = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/agent-rounding`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setAgentRoundWhole(data.roundWhole !== false);
      }
    } catch { /* ignore */ }
  };

  const fetchGuestMarkup = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/guest-markup`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setGuestMarkupType(data.type === "fixed" ? "fixed" : "percent");
        setGuestMarkupValue(String(data.value ?? "0"));
      }
    } catch { /* ignore */ }
  };

  const handleSaveGuestMarkup = async () => {
    setGuestMarkupSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/guest-markup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: guestMarkupType, value: parseFloat(guestMarkupValue) || 0 }),
      });
      if (resp.ok) {
        setGuestMarkupSaved(true);
        setTimeout(() => setGuestMarkupSaved(false), 2000);
        toast({ title: "Markup-i për vizitorët u ruajt" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } catch {
      toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
    } finally { setGuestMarkupSaving(false); }
  };

  const handleSaveAgentRounding = async (value: boolean) => {
    setAgentRoundSaving(true);
    setAgentRoundWhole(value);
    try {
      const resp = await fetch(`${API_BASE}/settings/agent-rounding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ roundWhole: value }),
      });
      if (resp.ok) {
        toast({ title: value ? "Rrumbullakosja u aktivizua (euro të plota)" : "Rrumbullakosja u çaktivizua (me cent)" });
      } else {
        setAgentRoundWhole(!value);
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } catch {
      setAgentRoundWhole(!value);
      toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
    } finally { setAgentRoundSaving(false); }
  };

  const fetchGpTtl = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/google-price-ttl`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setGpTtlHours(String(data.hours ?? "6"));
        setGpDailyTime(data.schedule?.time ?? "");
        setGpNextRun(data.schedule?.nextRun ?? null);
      }
    } catch { /* ignore */ }
  };

  const handleSaveGpTtl = async () => {
    setGpTtlSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/google-price-ttl`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hours: parseFloat(gpTtlHours) || 6 }),
      });
      if (resp.ok) {
        setGpTtlSaved(true);
        setTimeout(() => setGpTtlSaved(false), 2000);
        // Apply the new interval immediately on the flights list.
        queryClient.invalidateQueries({ queryKey: ["google-price-ttl"] });
        toast({ title: "Intervali i rifreskimit u ruajt" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setGpTtlSaving(false); }
  };

  const handleSaveGpTime = async () => {
    setGpTimeSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/google-price-ttl`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyTime: gpDailyTime }),
      });
      if (!resp.ok) throw new Error("Ruajtja dështoi");
      const data = await resp.json();
      setGpDailyTime(data.schedule.time);
      setGpNextRun(data.schedule.nextRun);
      toast({ title: "Ora e rifreskimit u ruajt" });
    } catch {
      toast({ title: "Ora nuk u ruajt. Provoni përsëri.", variant: "destructive" });
    } finally { setGpTimeSaving(false); }
  };

  const fetchUpcomingDays = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/upcoming-days`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setUpcomingDays(String(data.days ?? "7"));
      }
    } catch { /* ignore */ }
  };

  const handleSaveUpcomingDays = async () => {
    setUpcomingDaysSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/upcoming-days`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ days: parseInt(upcomingDays, 10) || 7 }),
      });
      if (resp.ok) {
        setUpcomingDaysSaved(true);
        setTimeout(() => setUpcomingDaysSaved(false), 2000);
        queryClient.invalidateQueries({ queryKey: ["upcoming-days"] });
        toast({ title: "Intervali i datave të aferta u ruajt" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setUpcomingDaysSaving(false); }
  };

  const fetchDefaultBaggage = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/default-baggage`, { credentials: "include" });
      if (resp.ok) {
        const d = await resp.json();
        setBagCount(String(d.count ?? "1"));
        setBagKg(String(d.kg ?? "20"));
        setBagPrice(String(d.price ?? "60"));
      }
    } catch { /* ignore */ }
  };

  const handleSaveDefaultBaggage = async () => {
    setBagSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/default-baggage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          count: parseInt(bagCount, 10) || 0,
          kg: Number(bagKg) || 0,
          price: Math.round(Number(bagPrice) || 0),
        }),
      });
      if (resp.ok) {
        setBagSaved(true);
        setTimeout(() => setBagSaved(false), 2000);
        toast({ title: "Rregulli i bagazhit u ruajt" });
      } else {
        const d = await resp.json().catch(() => null);
        toast({ title: "Gabim gjatë ruajtjes", description: d?.error, variant: "destructive" });
      }
    } finally { setBagSaving(false); }
  };

  const handleRefreshGpNow = async () => {
    setGpRefreshing(true);
    try {
      const resp = await fetch(`${API_BASE}/flights/google-price/refresh`, { method: "POST", credentials: "include" });
      if (resp.ok) {
        // Server cache is cleared — now drop the client caches too so the flights
        // list cannot render a stale value first. We remove (not just invalidate)
        // the React Query entries and the localStorage seed; with no cached data,
        // the list is forced to fetch fresh from the now-cleared server cache and
        // shows a loading state on next render. (Only do this on success so a
        // failed server refresh doesn't wipe the user's working cache.)
        try {
          const stale: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith("gfp:")) stale.push(k);
          }
          stale.forEach(k => localStorage.removeItem(k));
        } catch { /* ignore */ }
        queryClient.removeQueries({ queryKey: ["google-flight-price"] });
        toast({ title: "Çmimet u rifreskuan", description: "Çmimet e reja shfaqen në listën e fluturimeve." });
      } else {
        toast({ title: "Gabim gjatë rifreskimit", variant: "destructive" });
      }
    } finally { setGpRefreshing(false); }
  };

  const fetchSeatCheck = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/seat-check`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setScEnabled(!!data.enabled);
        setScDays(String(data.days ?? "10"));
        setScMinSeats(String(data.minSeats ?? "5"));
        setScInterval(String(Math.round((data.intervalHours ?? 12) * 60)));
        setScFlaggedInterval(String(data.flaggedIntervalMinutes ?? 5));
        setScAutoSoldOut(!!data.autoSoldOut);
        setScRefreshPrices(!!data.refreshPrices);
        setScSoldOutTask(!!data.soldOutTask);
        setScLastRun(data.lastRunAt ?? null);
      }
    } catch { /* ignore */ }
  };

  const handleSaveSeatCheck = async () => {
    if (!Number.isSafeInteger(Number(scFlaggedInterval)) || Number(scFlaggedInterval) < 1) {
      toast({ title: "Intervali për pak vende duhet të jetë të paktën 1 minutë.", variant: "destructive" });
      return;
    }
    setScSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/seat-check`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled: scEnabled,
          days: parseInt(scDays, 10) || 10,
          minSeats: parseInt(scMinSeats, 10) || 5,
          intervalHours: (parseInt(scInterval, 10) || 720) / 60,
          flaggedIntervalMinutes: Number(scFlaggedInterval),
          autoSoldOut: scAutoSoldOut,
          refreshPrices: scRefreshPrices,
          soldOutTask: scSoldOutTask,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setScLastRun(data.lastRunAt ?? null);
        setScSaved(true);
        setTimeout(() => setScSaved(false), 2000);
        toast({ title: "Cilësimet e kontrollit të vendeve u ruajtën" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setScSaving(false); }
  };

  const handleRunSeatCheckNow = async () => {
    setScRunning(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/seat-check/run`, { method: "POST", credentials: "include" });
      if (resp.ok) {
        const r = await resp.json();
        await fetchSeatCheck();
        if (r.ran) {
          toast({ title: "Kontrolli përfundoi", variant: r.apiErrorGroups ? "destructive" : "default", description: `U kontrolluan ${r.flightsChecked} fluturime · ${r.flagged} me pak vende${r.soldOut ? ` · ${r.soldOut} u nxorën Sold Out` : ""}${r.pricesRefreshed ? ` · u rifreskuan çmimet për ${r.pricesRefreshed} grupe` : ""}${r.apiErrorGroups ? ` · ${r.apiErrorGroups} grupe pa përgjigje nga Google` : ""}` });
        } else {
          toast({ title: "Kontrolli nuk u krye", description: r.reason === "already_running" ? "Një kontroll është duke u kryer." : "Kontrolli është joaktiv.", variant: "destructive" });
        }
      } else {
        toast({ title: "Gabim gjatë kontrollit", variant: "destructive" });
      }
    } finally { setScRunning(false); }
  };

  const fetchSocialProof = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/social-proof`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setSpEnabled(data.enabled !== false);
      }
    } catch { /* ignore */ }
  };

  const handleSaveSocialProof = async (enabled: boolean) => {
    setSpSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/social-proof`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (resp.ok) {
        setSpSaved(true);
        setTimeout(() => setSpSaved(false), 2000);
        toast({ title: enabled ? "Shenjat u aktivizuan" : "Shenjat u çaktivizuan" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
        await fetchSocialProof();
      }
    } catch {
      toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      await fetchSocialProof();
    } finally { setSpSaving(false); }
  };

  const fetchNoPriceCheck = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/no-price-check`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setNpEnabled(data.enabled !== false);
        setNpInterval(String(data.intervalMinutes ?? "5"));
        setNpLastRun(data.lastRunAt ?? null);
      }
    } catch { /* ignore */ }
  };

  const handleSaveNoPriceCheck = async () => {
    setNpSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/no-price-check`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled: npEnabled,
          intervalMinutes: parseFloat(npInterval) || 5,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setNpInterval(String(data.intervalMinutes ?? "5"));
        setNpLastRun(data.lastRunAt ?? null);
        setNpSaved(true);
        setTimeout(() => setNpSaved(false), 2000);
        toast({ title: "Cilësimet e kontrollit 'Pa Çmim' u ruajtën" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setNpSaving(false); }
  };

  const handleRunNoPriceCheckNow = async () => {
    setNpRunning(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/no-price-check/run`, { method: "POST", credentials: "include" });
      if (resp.ok) {
        const r = await resp.json();
        await fetchNoPriceCheck();
        toast({ title: "Kontrolli 'Pa Çmim' përfundoi", description: `U rikontrolluan ${r.refreshed ?? 0} grupe rutë+datë.` });
      } else {
        toast({ title: "Gabim gjatë kontrollit", variant: "destructive" });
      }
    } finally { setNpRunning(false); }
  };

  const fetchStalePriceCheck = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/stale-price-check`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setSpcEnabled(data.enabled !== false);
        setSpcInterval(String(data.intervalMinutes ?? "60"));
        setSpcLastRun(data.lastRunAt ?? null);
      }
    } catch { /* ignore */ }
  };

  const handleSaveStalePriceCheck = async () => {
    setSpcSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/stale-price-check`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled: spcEnabled,
          intervalMinutes: parseFloat(spcInterval) || 60,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSpcInterval(String(data.intervalMinutes ?? "60"));
        setSpcLastRun(data.lastRunAt ?? null);
        setSpcSaved(true);
        setTimeout(() => setSpcSaved(false), 2000);
        toast({ title: "Cilësimet e kontrollit 'Çmim i Vjetër' u ruajtën" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setSpcSaving(false); }
  };

  const handleRunStalePriceCheckNow = async () => {
    setSpcRunning(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/stale-price-check/run`, { method: "POST", credentials: "include" });
      if (resp.ok) {
        const result = await resp.json();
        if (result?.busy) {
          toast({ title: "Një kontroll është duke u kryer", description: "Provo sërish pas pak." });
          return;
        }
        if (!result?.started) {
          toast({ title: "Kontrolli nuk u nis", variant: "destructive" });
          return;
        }
        let final: any = null;
        let failures = 0;
        for (;;) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            const response = await fetch(`${API_BASE}/settings/stale-price-check/progress`, { credentials: "include" });
            if (!response.ok) { if (++failures > 5) break; continue; }
            failures = 0;
            const progress = await response.json();
            if (result.startedAt && progress.startedAt && progress.startedAt !== result.startedAt) break;
            if (!progress.running) { final = progress; break; }
          } catch {
            if (++failures > 5) break;
          }
        }
        await fetchStalePriceCheck();
        toast({ title: "Kontrolli 'Çmim i Vjetër' përfundoi", description: `U rikontrolluan ${final?.refreshed ?? 0} grupe rutë+datë.` });
      } else {
        toast({ title: "Gabim gjatë kontrollit", variant: "destructive" });
      }
    } finally { setSpcRunning(false); }
  };

  const fetchNewPriceCheck = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/new-price-check`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setNpriEnabled(data.enabled !== false);
        setNpriInterval(String(data.intervalMinutes ?? "30"));
        setNpriLastRun(data.lastRunAt ?? null);
      }
    } catch { /* ignore */ }
  };

  const handleSaveNewPriceCheck = async () => {
    setNpriSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/new-price-check`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled: npriEnabled,
          intervalMinutes: parseFloat(npriInterval) || 30,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setNpriInterval(String(data.intervalMinutes ?? "30"));
        setNpriLastRun(data.lastRunAt ?? null);
        setNpriSaved(true);
        setTimeout(() => setNpriSaved(false), 2000);
        toast({ title: "Cilësimet e kontrollit 'Çmim i Ri' u ruajtën" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setNpriSaving(false); }
  };

  const handleRunNewPriceCheckNow = async () => {
    setNpriRunning(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/new-price-check/run`, { method: "POST", credentials: "include" });
      if (resp.ok) {
        const r = await resp.json();
        if (r?.busy) { toast({ title: "Një kontroll është duke u kryer", description: "Provo sërish pas pak." }); return; }
        if (!r?.started) { toast({ title: "Kontrolli nuk u nis", variant: "destructive" }); return; }
        // Puna kryhet në SFOND në server — ndiq progresin derisa të mbarojë.
        let final: any = null;
        let failures = 0;
        for (;;) {
          await new Promise(res => setTimeout(res, 2000));
          try {
            const pr = await fetch(`${API_BASE}/settings/new-price-check/progress`, { credentials: "include" });
            if (!pr.ok) { if (++failures > 5) break; continue; }
            failures = 0;
            const p = await pr.json();
            // Nëse startedAt s'përputhet, gjendja i përket një runi tjetër.
            if (r?.startedAt && p.startedAt && p.startedAt !== r.startedAt) break;
            if (!p.running) { final = p; break; }
          } catch { if (++failures > 5) break; }
        }
        await fetchNewPriceCheck();
        toast({ title: "Kontrolli 'Çmim i Ri' përfundoi", description: `U rikontrolluan ${final?.refreshed ?? 0} grupe rutë+datë.` });
      } else {
        toast({ title: "Gabim gjatë kontrollit", variant: "destructive" });
      }
    } finally { setNpriRunning(false); }
  };

  const fetchPriceReportEmail = async () => {
    try {
      const resp = await fetch(`${API_BASE}/settings/price-report-email`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setPrMode(data.mode ?? "always");
        setPrThreshold(String(data.threshold ?? "10"));
      }
    } catch { /* ignore */ }
  };

  const handleSavePriceReportEmail = async () => {
    setPrSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/price-report-email`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: prMode,
          threshold: parseInt(prThreshold, 10) || 10,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setPrMode(data.mode ?? "always");
        setPrThreshold(String(data.threshold ?? "10"));
        setPrSaved(true);
        setTimeout(() => setPrSaved(false), 2000);
        toast({ title: "Cilësimet e email-it 'Raport Ndryshimi Çmimesh' u ruajtën" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setPrSaving(false); }
  };

  const fetchBeFlights = async () => {
    setBeLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/booking-engine/flights`, { credentials: "include" });
      if (resp.ok) setBeFlights(await resp.json());
    } catch { /* ignore */ } finally { setBeLoading(false); }
  };

  const toggleBeFlightVisibility = async (id: number, show: boolean) => {
    setBeToggling(prev => new Set(prev).add(id));
    try {
      const resp = await fetch(`${API_BASE}/booking-engine/flights/${id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ showInBookingEngine: show }),
      });
      if (resp.ok) {
        setBeFlights(prev => prev.map(f => f.id === id ? { ...f, showInBookingEngine: show } : f));
        toast({ title: show ? "Fluturimi u shtua në Booking Engine" : "Fluturimi u fsheh nga Booking Engine" });
      }
    } finally {
      setBeToggling(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const getFilteredBeFlights = () => {
    const q = beSearch.toLowerCase();
    return beFlights.filter(f => !q || f.flightNumber.toLowerCase().includes(q) || f.fromCity.toLowerCase().includes(q) || f.toCity.toLowerCase().includes(q) || f.airline.toLowerCase().includes(q));
  };

  const toggleAllBeFlights = async (show: boolean) => {
    const filtered = getFilteredBeFlights();
    if (!filtered.length) return;
    setBeSelectAllLoading(true);
    try {
      await Promise.all(
        filtered
          .filter(f => f.showInBookingEngine !== show)
          .map(f =>
            fetch(`${API_BASE}/booking-engine/flights/${f.id}/visibility`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ showInBookingEngine: show }),
            })
          )
      );
      setBeFlights(prev =>
        prev.map(f => filtered.find(ff => ff.id === f.id) ? { ...f, showInBookingEngine: show } : f)
      );
      toast({ title: show ? `${filtered.length} fluturime u aktivizuan` : `${filtered.length} fluturime u fshehën` });
    } finally { setBeSelectAllLoading(false); }
  };

  const handleSaveFormula = async () => {
    setFormulaSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/price-formula`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ minimum: Math.round(Number(formulaMinimum) || 0), above: Math.round(Number(formulaAbove) || 0), percent: formulaPercent, fallback: Math.round(Number(formulaFallback) || 0) }),
      });
      if (resp.ok) {
        setFormulaSaved(true);
        setTimeout(() => setFormulaSaved(false), 2000);
        toast({ title: "Formula u ruajt me sukses" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setFormulaSaving(false); }
  };

  const handleSaveCitizenPricing = async () => {
    setCitizenSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/settings/citizen-pricing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: citizenMarkupType, value: citizenMarkupValue }),
      });
      if (resp.ok) {
        setCitizenSaved(true);
        setTimeout(() => setCitizenSaved(false), 2000);
        toast({ title: "Markup-i Offline u ruajt me sukses" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setCitizenSaving(false); }
  };

  const fetchBranding = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/branding`, { credentials: "include" });
      if (resp.ok) {
        const data: Branding = await resp.json();
        setBranding(data);
        setSiteName(data.siteName);
        setTagline(data.tagline);
        setLogoB64(data.logoBase64);
        setBgB64(data.backgroundBase64);
        setPrimaryColor(data.primaryColor);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchBranding(); fetchFormula(); fetchCitizenPricing(); fetchCutoff(); fetchConfCutoff(); fetchAgentRounding(); fetchGuestMarkup(); fetchGpTtl(); fetchSeatCheck(); fetchNoPriceCheck(); fetchStalePriceCheck(); fetchNewPriceCheck(); fetchPriceReportEmail(); fetchSocialProof(); fetchBeFlights(); fetchUpcomingDays(); fetchDefaultBaggage(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/branding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          siteName,
          tagline,
          logoBase64: logoB64,
          backgroundBase64: bgB64,
          primaryColor,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setBranding(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        window.dispatchEvent(new CustomEvent("brandingUpdated"));
        toast({ title: "Cilësimet u ruajtën me sukses" });
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl xl:max-w-5xl 2xl:max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Cilësimet e Sistemit
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Personalizoni temën, logon, sfondin dhe emrin e sistemit tuaj
        </p>
      </div>

      {isAdmin && <ModulesSettings />}
      {isAdmin && <PageLayoutsSection />}

      {isAdmin && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Siguria dhe Aksesi
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Menaxho IP-të e lejuara dhe bllokimet
            </p>
          </CardHeader>
          <CardContent>
            <Link href="/settings/ip-access">
              <Button variant="default" className="w-full sm:w-auto">
                <ShieldAlert className="h-4 w-4 mr-2" />
                Paneli i IP-ve
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Matjet e performancës</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Matje të përafërta që mund të përfshijnë kërkesa periodike pak pas një ndërveprimi. Raporti ruhet vetëm për këtë sesion dhe nuk dërgohet në rrjet.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportPerformanceReport}>
              <Download className="h-4 w-4 mr-2" />
              Shkarko raportin JSON
            </Button>
            <Button type="button" variant="outline" onClick={clearPerformanceReport}>
              <Trash2 className="h-4 w-4 mr-2" />
              Fshi matjet
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Theme Picker ── */}
      <Card className="border-2" style={{ borderColor: theme.accentColor + "33" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Paintbrush className="h-4 w-4" style={{ color: theme.accentColor }} />
            Tema e Ndërfaqes
          </CardTitle>
          <p className="text-xs text-gray-400 mt-0.5">
            Zgjidhni stilin vizual të panelit — ndryshimi bëhet menjëherë
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {Object.values(THEMES).map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className="text-left space-y-2 group focus:outline-none"
              >
                <ThemePreview theme={t} isActive={themeId === t.id} />
                <div className="px-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.accentColor }} />
                    <span className={cn(
                      "text-sm font-semibold",
                      themeId === t.id ? "text-gray-900" : "text-gray-600"
                    )}>{t.name}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 pl-4">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Team Chat ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            Chat i Ekipit
          </CardTitle>
          <p className="text-xs text-gray-400 mt-0.5">
            Aktivizoni ose çaktivizoni dritaren e bisedës që shfaqet poshtë djathtas
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 max-w-md">
            <div className="space-y-0.5">
              <label className="text-sm font-medium text-gray-700">
                {chatEnabled ? "Chat-i është aktiv" : "Chat-i është çaktivizuar"}
              </label>
              <p className="text-xs text-gray-400">
                {chatEnabled
                  ? "Butoni i bisedës shfaqet në të gjitha faqet."
                  : "Butoni i bisedës është i fshehur nga të gjitha faqet."}
              </p>
            </div>
            <Switch
              checked={chatEnabled}
              onCheckedChange={(v) => setChatEnabled(v)}
              aria-label="Aktivizo ose çaktivizo chat-in"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Zilja e rezervimeve ── */}
      <EmailModuleCard />
      <GoogleLiveAutoCard />
      <BookingChimeCard />
      {isAdmin && <PokAccountsCard />}
      {isAdmin && <PokLinkPolicyCard />}
      {isAdmin && <PokReconciliationCard />}

      {/* ── Identity ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Type className="h-4 w-4 text-primary" />
            Identiteti i Sistemit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Emri i sistemit</label>
            <Input
              value={siteName}
              onChange={e => setSiteName(e.target.value)}
              placeholder="FMS Pro"
              className="max-w-xs"
            />
            <p className="text-xs text-gray-400">Shfaqet në sidebar dhe faqen e hyrjes</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Nënshkrimi</label>
            <Input
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              placeholder="Kings Travel · Panel i Administrimit"
              className="max-w-sm"
            />
            <p className="text-xs text-gray-400">Teksti i vogël nën emrin e sistemit</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Ngjyra kryesore (faqja e hyrjes)</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                className="h-9 w-16 cursor-pointer rounded-lg border border-gray-200 p-0.5"
              />
              <span className="text-sm text-gray-500 font-mono">{primaryColor}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Logo ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="h-4 w-4 text-primary" />
            Logo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUploadZone
            label="Logo e sistemit (rekomandohet PNG/SVG transparent, max 1MB)"
            value={logoB64}
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onUpload={b64 => setLogoB64(b64)}
            onClear={() => setLogoB64(null)}
            maxKb={1024}
          />
        </CardContent>
      </Card>

      {/* ── Background ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            Sfondi i Faqes së Hyrjes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUploadZone
            label="Imazh sfond (PNG/JPG · max 3MB)"
            value={bgB64}
            accept="image/png,image/jpeg,image/webp"
            onUpload={b64 => setBgB64(b64)}
            onClear={() => setBgB64(null)}
            maxKb={3072}
          />
          <p className="text-xs text-gray-400 mt-2">
            Shfaqet si sfond i errët mbi faqen e hyrjes
          </p>
        </CardContent>
      </Card>

      {/* ── Preview ── */}
      {(logoB64 || siteName) && (
        <Card className="bg-[#0f172a]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white/70 flex items-center gap-2">
              Pamja paraprake e faqes së hyrjes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center py-6 gap-2">
              {logoB64 ? (
                <img src={logoB64} alt="Logo" className="h-14 w-14 object-contain mb-1" />
              ) : (
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1"
                  style={{ backgroundColor: primaryColor }}>
                  <span className="text-white font-bold text-xl">{(siteName || "FMS")[0]}</span>
                </div>
              )}
              <div className="text-white font-bold text-xl">{siteName || "FMS Pro"}</div>
              <div className="text-slate-400 text-sm">{tagline || "Panel i Administrimit"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Save branding ── */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          {saving ? "Po ruhet..." : saved ? "U ruajt!" : "Ruaj ndryshimet"}
        </Button>
        <Button variant="outline" onClick={fetchBranding} disabled={loading} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Rikthe
        </Button>
      </div>

      {/* ── Google Flights Price Formula ── */}
      <Card className="border-2 border-blue-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-500" />
            Formula e Çmimit — Google Flights
          </CardTitle>
          <p className="text-xs text-gray-400 mt-0.5">
            Kontrollon si ndryshohet çmimi kur klikoni "Sinkronizo Çmimet" te Flight Inventory
          </p>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Three fields row 1 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 border rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">MINIMUM</span>
                <span className="text-[10px] text-slate-400">(€)</span>
              </div>
              <Input
                type="number" min="0" step="1"
                value={formulaMinimum}
                onChange={e => setFormulaMinimum(e.target.value)}
                className="text-center text-lg font-bold h-10"
                placeholder="0"
              />
              <p className="text-[10px] text-slate-400 leading-snug">Çmimi minimal i shitjes — rezultati kurrë nuk bie nën kaq</p>
            </div>

            <div className="bg-slate-50 border rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">MBI</span>
                <span className="text-[10px] text-slate-400">(€)</span>
              </div>
              <Input
                type="number" min="0" step="1"
                value={formulaAbove}
                onChange={e => setFormulaAbove(e.target.value)}
                className="text-center text-lg font-bold h-10"
                placeholder="0"
              />
              <p className="text-[10px] text-slate-400 leading-snug">Nëse Google &gt; kaq → apliko formulën</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">ZBRITJE</span>
                <span className="text-[10px] text-blue-400">(%)</span>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number" min="0" max="100" step="0.1"
                  value={formulaPercent}
                  onChange={e => setFormulaPercent(e.target.value)}
                  className="text-center text-lg font-bold h-10 border-blue-300"
                  placeholder="0"
                />
                <span className="text-blue-500 font-bold text-lg">%</span>
              </div>
              <p className="text-[10px] text-blue-400 leading-snug">Çmimi = Google − %</p>
            </div>
          </div>

          {/* Fallback field */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">ÇMIM REZERVË</span>
              <span className="text-[10px] text-orange-400">(€) — kur Google nuk gjendet</span>
              <span className="ml-auto text-[10px] text-orange-400 italic">lër 0 për të mos ndryshuar</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-orange-500 font-bold text-lg">€</span>
              <Input
                type="number" min="0" step="1"
                value={formulaFallback}
                onChange={e => setFormulaFallback(e.target.value)}
                className="text-center text-lg font-bold h-10 border-orange-300 max-w-[160px]"
                placeholder="0"
              />
              <p className="text-[11px] text-orange-500 leading-snug flex-1">
                {parseFloat(formulaFallback || "0") > 0
                  ? <>Kur Google nuk gjendon çmim → vendoset automatikisht <strong>€{fmtM(parseFloat(formulaFallback))}</strong></>
                  : "Kur Google nuk gjendon çmim → biletë nuk ndryshohet (0 = çaktivizo)"}
              </p>
            </div>
          </div>

          {/* Formula preview */}
          <div className="rounded-xl border bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 text-xs font-medium">
              <TrendingUp className="h-3.5 w-3.5" />
              Si funksionon formula
            </div>
            <div className="space-y-1.5 text-xs">
              {/* Step 1: Google not found → fallback */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Google nuk gjendet</span>
                <span className="text-slate-600">→</span>
                {parseFloat(formulaFallback || "0") > 0
                  ? <span className="text-orange-400 font-medium">Çmimi rezervë = €{fmtM(parseFloat(formulaFallback || "0"))}</span>
                  : <span className="text-yellow-400 font-medium">Mos ndrysho</span>}
              </div>
              {/* Step 2: Google ≤ above → don't change */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Google ≤ €{fmtM(formulaAbove || "0")}</span>
                <span className="text-slate-600">→</span>
                <span className="text-yellow-400 font-medium">Mos ndrysho</span>
              </div>
              {/* Step 3: Google > above → apply discount, floor at minimum */}
              <div className="flex items-start gap-2">
                <span className="text-slate-400 shrink-0">Google &gt; €{fmtM(formulaAbove || "0")}</span>
                <span className="text-slate-600">→</span>
                <span className="text-green-400 font-medium leading-snug">
                  {(() => {
                    const ab = parseFloat(formulaAbove || "0");
                    const pct = parseFloat(formulaPercent || "0");
                    const mn = parseFloat(formulaMinimum || "0");
                    if (!ab || !pct) return `Çmimi = Google − ${pct}%`;
                    const exGoogle = ab + 50;
                    const calc = Math.round(exGoogle * (1 - pct / 100) * 100) / 100;
                    const final = mn > 0 && calc < mn ? mn : calc;
                    const floored = mn > 0 && calc < mn;
                    return `Çmimi = Google − ${pct}% (p.sh. €${fmtM(exGoogle)} → €${fmtM(final)}${floored ? `, min €${fmtM(mn)}` : ""})`;
                  })()}
                  {parseFloat(formulaMinimum || "0") > 0 && (
                    <span className="block text-blue-400 mt-0.5">↳ kurrë nën €{fmtM(parseFloat(formulaMinimum))} (minimum)</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <Button onClick={handleSaveFormula} disabled={formulaSaving} className="gap-2 bg-blue-600 hover:bg-blue-700 w-full">
            {formulaSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : formulaSaved ? <Check className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            {formulaSaving ? "Po ruhet..." : formulaSaved ? "✓ Formula u ruajt!" : "Ruaj Formulën"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Çmimi Offline (Offline Flights) ── */}
      <Card className="border-2 border-emerald-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-emerald-500" />
            Markup-i Çmimit — Offline Flights
          </CardTitle>
          <p className="text-xs text-gray-400 mt-0.5">
            Shtesa globale që i shtohet çmimit bazë të të rriturit për fluturimet offline.
            Çmimi i foshnjës NUK ndryshohet. Çdo fluturim mund të ketë override manual te faqja "Offline Flights".
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {/* type toggle */}
            <div className="bg-slate-50 border rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">LLOJI I MARKUP-IT</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCitizenMarkupType("percent")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${citizenMarkupType === "percent" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
                  Përqindje (%)
                </button>
                <button
                  type="button"
                  onClick={() => setCitizenMarkupType("fixed")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${citizenMarkupType === "fixed" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
                  Fikse (€)
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">Zgjidh nëse markup-i është përqindje e çmimit bazë apo shumë fikse në €</p>
            </div>

            {/* value */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">VLERA E MARKUP-IT</span>
                <span className="text-[10px] text-emerald-400">({citizenMarkupType === "percent" ? "%" : "€"})</span>
              </div>
              <div className="flex items-center gap-1">
                {citizenMarkupType === "fixed" && <span className="text-emerald-500 font-bold text-lg">€</span>}
                <Input
                  type="number" min="0" step={citizenMarkupType === "percent" ? "0.1" : "0.01"}
                  value={citizenMarkupValue}
                  onChange={e => setCitizenMarkupValue(e.target.value)}
                  className="text-center text-lg font-bold h-10 border-emerald-300"
                  placeholder="0"
                />
                {citizenMarkupType === "percent" && <span className="text-emerald-500 font-bold text-lg">%</span>}
              </div>
              <p className="text-[10px] text-emerald-400 leading-snug">0 = pa ndryshim (çmimi offline = çmimi bazë)</p>
            </div>
          </div>

          {/* live example */}
          <div className="rounded-xl border bg-gradient-to-r from-emerald-800 to-emerald-900 text-white px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-200 text-xs font-medium">
              <TrendingUp className="h-3.5 w-3.5" />
              Shembull
            </div>
            <div className="text-xs text-emerald-100">
              {(() => {
                const base = 200;
                const v = parseFloat(citizenMarkupValue || "0") || 0;
                const result = citizenMarkupType === "percent" ? base + (base * v) / 100 : base + v;
                const markupTxt = citizenMarkupType === "percent" ? `+${v}%` : `+€${fmtM(v)}`;
                return <>Çmimi bazë <strong>€{fmtM(200)}</strong> <span className="text-emerald-300">{markupTxt}</span> → Çmimi Offline <strong className="text-white">€{fmtM(result)}</strong></>;
              })()}
            </div>
          </div>

          <Button onClick={handleSaveCitizenPricing} disabled={citizenSaving} className="gap-2 bg-emerald-600 hover:bg-emerald-700 w-full">
            {citizenSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : citizenSaved ? <Check className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            {citizenSaving ? "Po ruhet..." : citizenSaved ? "✓ Markup-i u ruajt!" : "Ruaj Markup-in Offline"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Versioni i Sistemit ─────────────────────────────────────────────── */}
      <VersionSection />

      {/* ── Agent Price Rules ───────────────────────────────────────────────── */}
      <PriceRulesSection />

      {/* ── Sell Cutoff (vetëm admin — menaxheri e ndryshon te paneli i fluturimit) ── */}
      {isAdmin && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-orange-500" />
            Mbyllja e Shitjes (End Selling Time)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sistemi ndalon automatikisht shitjen e biletave kur mbeten
            <span className="font-semibold text-foreground"> X orë</span> para nisjes.
            Klientët nuk mund të rezervojnë fluturime brenda kësaj kohe.
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Orë para nisjes
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={cutoffHours}
                  onChange={e => setCutoffHours(e.target.value)}
                  className="w-32 text-center text-lg font-semibold"
                />
                <span className="text-sm text-muted-foreground">orë</span>
              </div>
            </div>
            <div className="pt-6">
              <div className={`rounded-lg px-3 py-2 text-xs font-medium border ${
                parseFloat(cutoffHours) > 0
                  ? "bg-orange-50 border-orange-200 text-orange-700"
                  : "bg-gray-50 border-gray-200 text-gray-500"
              }`}>
                {parseFloat(cutoffHours) > 0
                  ? `Mbyllet ${cutoffHours}h para nisjes`
                  : "Pa kufizim kohe"}
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 space-y-0.5">
            <p className="font-semibold">Shembull:</p>
            <p>Fluturim niset <strong>15 Gusht ora {fmtAmPm("06:00")}</strong> → me {cutoffHours}h cutoff</p>
            <p>Shitja mbyllet <strong>
              {(() => {
                const h = parseFloat(cutoffHours) || 0;
                const dep = new Date("2026-08-15T06:00:00Z");
                const cutoff = new Date(dep.getTime() - h * 3600000);
                return `${cutoff.toISOString().slice(0, 10)} ora ${fmtAmPm(cutoff.toISOString().slice(11, 16))} UTC`;
              })()}
            </strong></p>
          </div>

          <Button onClick={handleSaveCutoff} disabled={cutoffSaving} className="gap-2 bg-orange-600 hover:bg-orange-700 w-full">
            {cutoffSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : cutoffSaved ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {cutoffSaving ? "Po ruhet..." : cutoffSaved ? "✓ U ruajt!" : "Ruaj Kohën e Mbylljes"}
          </Button>

          {/* ── Fluturimet e KONFIRMUARA (⭐) ── */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Fluturimet e Konfirmuara (⭐)</p>
            <p className="text-sm text-muted-foreground">
              Të konfirmuarat mbyllin shitjen <span className="font-semibold text-foreground">{confCutoffHours || "4"} orë</span> para
              nisjes. Nëse mbyllja bie kur zyra është mbyllur (00:30–09:00), shitja mbyllet
              më herët — në <span className="font-semibold text-foreground">00:30</span>, para se të mbyllet zyra.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="1"
                value={confCutoffHours}
                onChange={e => setConfCutoffHours(e.target.value)}
                className="w-32 text-center text-lg font-semibold"
              />
              <span className="text-sm text-muted-foreground">orë para nisjes</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 space-y-0.5">
              <p className="font-semibold">Shembuj (me {parseFloat(confCutoffHours) || 4} orë):</p>
              <p>Nisja <strong>16:00</strong> → mbyllet <strong>{(() => { const h = parseFloat(confCutoffHours) || 4; const m = 16 * 60 - h * 60; const mm = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`; })()}</strong> (zyra hapur)</p>
              <p>Nisja <strong>06:00</strong> → mbyllja do binte {(() => { const h = parseFloat(confCutoffHours) || 4; const m = 6 * 60 - h * 60; const mm = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`; })()} (zyra mbyllur) → mbyllet në <strong>00:30</strong></p>
            </div>
            <Button onClick={handleSaveConfCutoff} disabled={confCutoffSaving} className="gap-2 bg-orange-600 hover:bg-orange-700 w-full">
              {confCutoffSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : confCutoffSaved ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              {confCutoffSaving ? "Po ruhet..." : confCutoffSaved ? "✓ U ruajt!" : "Ruaj për të Konfirmuarat"}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ── Rrumbullakosja e Çmimit të Agjentit ──────────────────────────────── */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4 text-indigo-500" />
              Rrumbullakosja e Çmimit të Agjentit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Kur është e aktivizuar, çmimi per-person që sheh agjenti rrumbullakoset
              në <span className="font-semibold text-foreground">euro të plotë</span> (p.sh.
              132.01 € → 132 €) — pa shifrat e cent pas euros. Kur është e çaktivizuar,
              ruhet çmimi i saktë me <span className="font-semibold text-foreground">2 decimale</span>.
            </p>

            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-800">
                  Rrumbullakos në euro të plotë
                </div>
                <div className="text-xs text-muted-foreground">
                  {agentRoundWhole
                    ? "Aktive — çmimi i agjentit shfaqet pa cent (p.sh. 132 €)"
                    : "Joaktive — çmimi i agjentit ruan centët (p.sh. 132.01 €)"}
                </div>
              </div>
              <Switch
                checked={agentRoundWhole}
                disabled={agentRoundSaving}
                onCheckedChange={(v) => handleSaveAgentRounding(v)}
              />
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-700">
              Prek vetëm çmimet e agjentëve (faqja e jashtme dhe API e partnerit). Çmimet
              e brendshme/admin mbeten me 2 decimale.
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Markup për Vizitorët e Paregjistruar (faqja e jashtme) ───────────── */}
      {isAdmin && (
        <Card className="border-2 border-sky-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-sky-500" />
              Markup për Vizitorët e Paregjistruar
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Shtesa që i shtohet çmimit bazë VETËM për vizitorët e faqes së jashtme që
              <span className="font-semibold text-gray-500"> nuk janë të loguar (jo të regjistruar)</span>.
              Agjentët e loguar dhe klientët e regjistruar nuk preken — çmimet e tyre mbeten siç janë.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {/* type toggle */}
              <div className="bg-slate-50 border rounded-xl p-3 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">LLOJI I MARKUP-IT</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGuestMarkupType("percent")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${guestMarkupType === "percent" ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
                    Përqindje (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuestMarkupType("fixed")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${guestMarkupType === "fixed" ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
                    Fikse (€)
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">Zgjidh nëse markup-i është përqindje e çmimit bazë apo shumë fikse në €</p>
              </div>

              {/* value */}
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600">VLERA E MARKUP-IT</span>
                  <span className="text-[10px] text-sky-400">({guestMarkupType === "percent" ? "%" : "€"})</span>
                </div>
                <div className="flex items-center gap-1">
                  {guestMarkupType === "fixed" && <span className="text-sky-500 font-bold text-lg">€</span>}
                  <Input
                    type="number" min="0" step={guestMarkupType === "percent" ? "0.1" : "0.01"}
                    value={guestMarkupValue}
                    onChange={e => setGuestMarkupValue(e.target.value)}
                    className="text-center text-lg font-bold h-10 border-sky-300"
                    placeholder="0"
                  />
                  {guestMarkupType === "percent" && <span className="text-sky-500 font-bold text-lg">%</span>}
                </div>
                <p className="text-[10px] text-sky-400 leading-snug">0 = pa ndryshim (vizitori sheh çmimin bazë)</p>
              </div>
            </div>

            {/* live example */}
            <div className="rounded-xl border bg-gradient-to-r from-sky-800 to-sky-900 text-white px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sky-200 text-xs font-medium">
                <TrendingUp className="h-3.5 w-3.5" />
                Shembull
              </div>
              <div className="text-xs text-sky-100">
                {(() => {
                  const base = 200;
                  const v = parseFloat(guestMarkupValue || "0") || 0;
                  const result = guestMarkupType === "percent" ? base + (base * v) / 100 : base + v;
                  const markupTxt = guestMarkupType === "percent" ? `+${v}%` : `+€${fmtM(v)}`;
                  return <>Çmimi bazë <strong>€{fmtM(200)}</strong> <span className="text-sky-300">{markupTxt}</span> → Çmimi për vizitorin <strong className="text-white">€{fmtM(result)}</strong></>;
                })()}
              </div>
            </div>

            <Button onClick={handleSaveGuestMarkup} disabled={guestMarkupSaving} className="gap-2 bg-sky-600 hover:bg-sky-700 w-full">
              {guestMarkupSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : guestMarkupSaved ? <Check className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
              {guestMarkupSaving ? "Po ruhet..." : guestMarkupSaved ? "✓ Markup-i u ruajt!" : "Ruaj Markup-in e Vizitorëve"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Rifreskimi i Çmimeve nga Google ──────────────────────────────────── */}
      {hasPermission("can_use_google_price_tools") && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-emerald-500" />
            Rifreskimi i Çmimeve nga Google
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Rifreskimi i plotë automatik kryhet një herë në ditë, në orën që caktoni më poshtë.
            Ruajtja e orës nuk nis rifreskim menjëherë.
          </p>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
            <label htmlFor="google-daily-time" className="block text-sm font-medium">Ora e rifreskimit automatik (ora e Shqipërisë)</label>
            <div className="flex flex-wrap items-center gap-3">
              <Input id="google-daily-time" type="time" value={gpDailyTime}
                onChange={e => setGpDailyTime(e.target.value)} className="w-36" />
              <Button onClick={handleSaveGpTime} disabled={gpTimeSaving || !gpDailyTime}>
                {gpTimeSaving ? "Po ruhet..." : "Ruaj Orën"}
              </Button>
            </div>
            <p className="text-sm text-emerald-800">
              Rifreskimi i ardhshëm sipas orës së ruajtur: {gpNextRun
                ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Tirane", dateStyle: "short", timeStyle: "short", hour12: false }).format(new Date(gpNextRun))
                : "Nuk u ngarkua orari"}
            </p>
            <p className="text-xs text-muted-foreground">Nëse ka një kontroll tjetër në proces, rifreskimi pret përfundimin e tij. Nëse është nisur sot, ora e re zbatohet nesër. Kur ora e zgjedhur mungon gjatë ndryshimit veror, nis në 03:00.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Vjetërsia e çmimit të ruajtur
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={gpTtlHours}
                  onChange={e => setGpTtlHours(e.target.value)}
                  className="w-32 text-center text-lg font-semibold"
                />
                <span className="text-sm text-muted-foreground">orë</span>
              </div>
            </div>
            <div className="pt-6">
              <div className="rounded-lg px-3 py-2 text-xs font-medium border bg-emerald-50 border-emerald-200 text-emerald-700">
                {parseFloat(gpTtlHours) > 0
                  ? `Çmimi quhet i vjetër pas ${gpTtlHours}h`
                  : "Vlerë e pavlefshme"}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleSaveGpTtl} disabled={gpTtlSaving} className="gap-2 bg-emerald-600 hover:bg-emerald-700 flex-1">
              {gpTtlSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : gpTtlSaved ? <Check className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {gpTtlSaving ? "Po ruhet..." : gpTtlSaved ? "✓ U ruajt!" : "Ruaj Intervalin"}
            </Button>
            <Button onClick={handleRefreshGpNow} disabled={gpRefreshing} variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 flex-1">
              {gpRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {gpRefreshing ? "Po rifreskohet..." : "Rifresko Tani"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            "Rifresko Tani" fshin cache-in, merr çmimet e fundit nga Google dhe rillogarit menjëherë çmimet e shitjes për fluturimet që kanë rregull. Edhe ndryshimi i intervalit i rifreskon çmimet me rregull menjëherë.
          </p>
        </CardContent>
      </Card>
      )}

      {/* ── Kontrolli i Çmimeve për Fluturimet "Pa Çmim" ───────────────────── */}
      {hasPermission("can_use_google_price_tools") && (
      <Card className="border-2 border-sky-100">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4 text-sky-500" />
            Kontrolli i Çmimeve "Pa Çmim"
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Të dy kontrollet menaxhohen këtu, por kanë intervale të veçanta: <span className="font-semibold text-foreground">"Pa Çmim"</span>
            kontrollohet më shpesh, ndërsa <span className="font-semibold text-foreground">"Çmim i Vjetër"</span> grupohet
            sipas rutës dhe datës për të shmangur kërkesa të tepërta. Fluturimet <span className="font-semibold">Sold Out</span> nuk përfshihen.
          </p>

          <div>
            <p className="text-sm font-semibold text-foreground">Pa Çmim</p>
            <p className="text-xs text-muted-foreground">Rikontrollon fluturimet për të cilat Google ende nuk ka kthyer çmim.</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={npEnabled}
              onChange={e => setNpEnabled(e.target.checked)}
              className="h-4 w-4 accent-sky-600"
            />
            <span className="text-sm font-medium text-gray-700">Aktivizo kontrollin automatik</span>
          </label>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Çdo sa minuta
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={npInterval}
                  onChange={e => setNpInterval(e.target.value)}
                  disabled={!npEnabled}
                  className="w-32 text-center text-lg font-semibold"
                />
                <span className="text-sm text-muted-foreground">minuta</span>
              </div>
            </div>
            <div className="pt-6">
              <div className="rounded-lg px-3 py-2 text-xs font-medium border bg-sky-50 border-sky-200 text-sky-700">
                {npEnabled && parseFloat(npInterval) >= 1
                  ? `Rikontrollohet çdo ${npInterval} min`
                  : npEnabled ? "Vlerë e pavlefshme" : "Joaktiv"}
              </div>
            </div>
          </div>

          {npLastRun && (
            <p className="text-xs text-muted-foreground">
              Kontrolli i fundit: {fmtDateTimeAmPm(npLastRun)}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleSaveNoPriceCheck} disabled={npSaving} className="gap-2 bg-sky-600 hover:bg-sky-700 flex-1">
              {npSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : npSaved ? <Check className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {npSaving ? "Po ruhet..." : npSaved ? "✓ U ruajt!" : "Ruaj Intervalin"}
            </Button>
            <Button onClick={handleRunNoPriceCheckNow} disabled={npRunning} variant="outline" className="gap-2 border-sky-300 text-sky-700 hover:bg-sky-50 flex-1">
              {npRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {npRunning ? "Po kontrollohet..." : "Kontrollo Tani"}
            </Button>
          </div>

          <div className="border-t border-sky-100 pt-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Çmim i Vjetër</p>
              <p className="text-xs text-muted-foreground">Bën deri në 5 kontrolle radhazi sipas intervalit më poshtë. Nëse nuk gjendet çmimi i fluturimit, pas kontrollit të pestë kalon te “Fluturime të dyshimta”. Nëse gjendet çmimi, numërimi zerohet.</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={spcEnabled}
                onChange={e => setSpcEnabled(e.target.checked)}
                className="h-4 w-4 accent-amber-600"
              />
              <span className="text-sm font-medium text-gray-700">Aktivizo kontrollin automatik për "Çmim i Vjetër"</span>
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 block mb-1">Çdo sa minuta</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={spcInterval}
                    onChange={e => setSpcInterval(e.target.value)}
                    disabled={!spcEnabled}
                    className="w-32 text-center text-lg font-semibold"
                  />
                  <span className="text-sm text-muted-foreground">minuta</span>
                </div>
              </div>
              <div className="pt-6">
                <div className="rounded-lg px-3 py-2 text-xs font-medium border bg-amber-50 border-amber-200 text-amber-700">
                  {spcEnabled && parseFloat(spcInterval) >= 1
                    ? `Rikontrollohet çdo ${spcInterval} min`
                    : spcEnabled ? "Vlerë e pavlefshme" : "Joaktiv"}
                </div>
              </div>
            </div>
            {spcLastRun && (
              <p className="text-xs text-muted-foreground">Kontrolli i fundit: {fmtDateTimeAmPm(spcLastRun)}</p>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleSaveStalePriceCheck} disabled={spcSaving} className="gap-2 bg-amber-600 hover:bg-amber-700 flex-1">
                {spcSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : spcSaved ? <Check className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                {spcSaving ? "Po ruhet..." : spcSaved ? "✓ U ruajt!" : "Ruaj Intervalin"}
              </Button>
              <Button onClick={handleRunStalePriceCheckNow} disabled={spcRunning} variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 flex-1">
                {spcRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {spcRunning ? "Po kontrollohet..." : "Kontrollo Tani"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ── Çmimi i Ri — Kërkim Automatik ─────────────────────────────────── */}
      {hasPermission("can_use_google_price_tools") && (
      <Card className="border-2 border-blue-100">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4 text-blue-500" />
            Çmimi i Ri — Kërkim Automatik
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Skeda <span className="font-semibold text-foreground">"Çmim i Ri"</span> shfaq çmimin më të fundit
            LIVE nga Google për të gjitha fluturimet e ardhshme. Ky çmim merret automatikisht në intervalin e
            mëposhtëm dhe është <span className="font-semibold">vetëm për shikim</span> — nuk aplikohet vetë.
            Çmimet aplikohen vetëm kur zgjedh fluturime dhe shtyp <span className="font-semibold">"Updato Çmimet"</span>.
          </p>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={npriEnabled}
              onChange={e => setNpriEnabled(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            <span className="text-sm font-medium text-gray-700">Aktivizo kërkimin automatik</span>
          </label>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Çdo sa minuta
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={npriInterval}
                  onChange={e => setNpriInterval(e.target.value)}
                  disabled={!npriEnabled}
                  className="w-32 text-center text-lg font-semibold"
                />
                <span className="text-sm text-muted-foreground">minuta</span>
              </div>
            </div>
            <div className="pt-6">
              <div className="rounded-lg px-3 py-2 text-xs font-medium border bg-blue-50 border-blue-200 text-blue-700">
                {npriEnabled && parseFloat(npriInterval) >= 1
                  ? `Kërkohet çdo ${npriInterval} min`
                  : npriEnabled ? "Vlerë e pavlefshme" : "Joaktiv"}
              </div>
            </div>
          </div>

          {npriLastRun && (
            <p className="text-xs text-muted-foreground">
              Kërkimi i fundit: {fmtDateTimeAmPm(npriLastRun)}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleSaveNewPriceCheck} disabled={npriSaving} className="gap-2 bg-blue-600 hover:bg-blue-700 flex-1">
              {npriSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : npriSaved ? <Check className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {npriSaving ? "Po ruhet..." : npriSaved ? "✓ U ruajt!" : "Ruaj Intervalin"}
            </Button>
            <Button onClick={handleRunNewPriceCheckNow} disabled={npriRunning} variant="outline" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 flex-1">
              {npriRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {npriRunning ? "Po kërkohet..." : "Rifresko Tani"}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ── Raport Ndryshimi Çmimesh (email) ──────────────────────────────── */}
      {isAdmin && (
      <Card className="border-2 border-violet-100">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-violet-500" />
            Email "Raport Ndryshimi Çmimesh"
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sa herë rifreskimi i Google ndryshon çmimin e shitjes së të paktën një fluturimi, sistemi dërgon
            një raport me email. Çmimet <span className="font-semibold">përditësohen gjithmonë</span> — kjo
            zgjedhje prek <span className="font-semibold">vetëm email-in</span>.
          </p>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Kur të dërgohet email-i</label>
            <select
              value={prMode}
              onChange={e => setPrMode(e.target.value as typeof prMode)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="always">Në çdo ndryshim (parazgjedhje)</option>
              <option value="daily_manual">Vetëm raporti i përditshëm (02:00) + kur rifreskoj manualisht</option>
              <option value="threshold">Vetëm kur ndryshojnë shumë fluturime njëherësh</option>
              <option value="off">Asnjëherë (fikur)</option>
            </select>
          </div>

          {prMode === "threshold" && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Dërgo vetëm kur ndryshojnë të paktën
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={prThreshold}
                  onChange={e => setPrThreshold(e.target.value)}
                  className="w-32 text-center text-lg font-semibold"
                />
                <span className="text-sm text-muted-foreground">fluturime</span>
              </div>
            </div>
          )}

          <div className="rounded-lg px-3 py-2 text-xs font-medium border bg-violet-50 border-violet-200 text-violet-700">
            {prMode === "always" && "Email në çdo rifreskim që ndryshon ≥1 çmim."}
            {prMode === "daily_manual" && "Email vetëm nga rifreskimi i përditshëm (02:00) dhe rifreskimet manuale — JO nga rifreskimi automatik periodik."}
            {prMode === "threshold" && `Email vetëm kur ndryshojnë ≥ ${parseInt(prThreshold, 10) || 10} fluturime në një rifreskim.`}
            {prMode === "off" && "Nuk dërgohet asnjë email (çmimet përditësohen pa email)."}
          </div>

          <Button onClick={handleSavePriceReportEmail} disabled={prSaving} className="gap-2 bg-violet-600 hover:bg-violet-700 w-full">
            {prSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : prSaved ? <Check className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {prSaving ? "Po ruhet..." : prSaved ? "✓ U ruajt!" : "Ruaj"}
          </Button>
        </CardContent>
      </Card>
      )}

      {/* ── Data të Aferta ────────────────────────────────────────────────── */}
      <Card className="border-2 border-amber-100">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-amber-500" />
            Cakto Intervalin për Data të Aferta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Skeda <span className="font-semibold text-foreground">Të Aferta</span> në listën e fluturimeve
            shfaq vetëm fluturimet që nisin brenda <span className="font-semibold">{upcomingDays}</span> ditëve
            nga sot. Ndryshoni numrin e ditëve sipas nevojës.
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Numri i ditëve
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={upcomingDays}
                  onChange={e => setUpcomingDays(e.target.value)}
                  className="w-32 text-center text-lg font-semibold"
                />
                <span className="text-sm text-muted-foreground">ditë</span>
              </div>
            </div>
            <div className="pt-6">
              <div className="rounded-lg px-3 py-2 text-xs font-medium border bg-amber-50 border-amber-200 text-amber-700">
                {parseInt(upcomingDays, 10) > 0
                  ? `Fluturimet e ${upcomingDays} ditëve`
                  : "Vlerë e pavlefshme"}
              </div>
            </div>
          </div>

          <Button onClick={handleSaveUpcomingDays} disabled={upcomingDaysSaving} className="gap-2 bg-amber-600 hover:bg-amber-700 w-full">
            {upcomingDaysSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : upcomingDaysSaved ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {upcomingDaysSaving ? "Po ruhet..." : upcomingDaysSaved ? "✓ U ruajt!" : "Ruaj Intervalin"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Bagazhi Default për Fluturime të Reja ───────────────────────────── */}
      <Card className="border-2 border-sky-100">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plane className="h-4 w-4 text-sky-500" />
            Bagazhi Default për Fluturime të Reja
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Kur hap dritaren <span className="font-semibold text-foreground">"Fluturim i Ri"</span>, fushat e
            "Bagazhi i Kontrolluar" plotësohen automatikisht me këto vlera (i ndryshon dot për çdo fluturim para ruajtjes).
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nr. copë</label>
              <Input type="number" min="0" step="1" value={bagCount} onChange={e => setBagCount(e.target.value)} className="text-center" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Pesha (kg)</label>
              <Input type="number" min="0" step="0.5" value={bagKg} onChange={e => setBagKg(e.target.value)} className="text-center" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Çmimi €</label>
              <Input type="number" min="0" step="1" value={bagPrice} onChange={e => setBagPrice(e.target.value)} className="text-center" />
            </div>
          </div>
          <Button onClick={handleSaveDefaultBaggage} disabled={bagSaving} className="gap-2 bg-sky-600 hover:bg-sky-700 w-full">
            {bagSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : bagSaved ? <Check className="h-4 w-4" /> : <Plane className="h-4 w-4" />}
            {bagSaving ? "Po ruhet..." : bagSaved ? "✓ U ruajt!" : "Ruaj Rregullin e Bagazhit"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Kontrolli i Vendeve (Google) ────────────────────────────────────── */}
      <Card className="border-2 border-orange-100">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plane className="h-4 w-4 text-orange-500" />
            Kontrolli i Vendeve (Google)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Kontrollon automatikisht në Google fluturimet e ardhshme brenda një periudhe, duke
            kërkuar për një numër të caktuar personash. Nëse një fluturim nuk ka aq vende, shfaqet
            te skeda <span className="font-semibold text-foreground">Njoftime</span> me etiketën
            <span className="font-semibold text-orange-700"> "Pak vende"</span>.
            Ky kontroll është krejt i veçantë nga kontrolli i orareve/çmimeve.
          </p>

          {/* Enable toggle */}
          <label className="flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer">
            <span className="text-sm font-medium text-gray-700">Aktiv (kontroll automatik)</span>
            <input
              type="checkbox"
              checked={scEnabled}
              onChange={e => setScEnabled(e.target.checked)}
              className="h-5 w-5 accent-orange-500 cursor-pointer"
            />
          </label>

          {/* Auto Sold Out toggle */}
          <label className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/50 px-3 py-2.5 cursor-pointer">
            <span className="text-sm font-medium text-gray-700">
              Nxirr <span className="font-semibold text-red-600">Sold Out</span> fluturimet me pak vende
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                Ndalon shitjet automatikisht për fluturimet e shënuara "Pak vende". (Nuk i rihap vetë.)
              </span>
            </span>
            <input
              type="checkbox"
              checked={scAutoSoldOut}
              onChange={e => setScAutoSoldOut(e.target.checked)}
              className="h-5 w-5 accent-red-500 cursor-pointer shrink-0 ml-3"
            />
          </label>

          {/* Sold-out task toggle */}
          <label className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 cursor-pointer">
            <span className="text-sm font-medium text-gray-700">
              Krijo <span className="font-semibold text-amber-700">task automatik</span> kur fluturimi del Sold Out
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                Kur është joaktiv, nuk krijohet asnjë task — dërgohet vetëm email-i i njoftimit.
              </span>
            </span>
            <input
              type="checkbox"
              checked={scSoldOutTask}
              onChange={e => setScSoldOutTask(e.target.checked)}
              className="h-5 w-5 accent-amber-500 cursor-pointer shrink-0 ml-3"
            />
          </label>

          {/* Refresh Google prices in the same run */}
          <label className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50/50 px-3 py-2.5 cursor-pointer">
            <span className="text-sm font-medium text-gray-700">
              Përfshi edhe <span className="font-semibold text-sky-700">rifreskimin e çmimeve</span> në Google
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                Në të njëjtin kontroll, rikontrollon çmimet në Google për fluturimet brenda periudhës dhe përditëson çmimin e shitjes sipas rregullave.
              </span>
            </span>
            <input
              type="checkbox"
              checked={scRefreshPrices}
              onChange={e => setScRefreshPrices(e.target.checked)}
              className="h-5 w-5 accent-sky-500 cursor-pointer shrink-0 ml-3"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Brenda sa ditëve</label>
              <Input
                type="number" min="1" step="1"
                value={scDays}
                onChange={e => setScDays(e.target.value)}
                className="text-center text-lg font-semibold"
              />
              <p className="text-xs text-gray-400 mt-1">Fluturimet brenda kësaj periudhe</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Numri i vendeve</label>
              <Input
                type="number" min="1" step="1"
                value={scMinSeats}
                onChange={e => setScMinSeats(e.target.value)}
                className="text-center text-lg font-semibold"
              />
              <p className="text-xs text-gray-400 mt-1">Alarm nëse ka më pak</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Çdo sa minuta</label>
              <Input
                type="number" min="1" step="1"
                value={scInterval}
                onChange={e => setScInterval(e.target.value)}
                className="text-center text-lg font-semibold"
              />
              <p className="text-xs text-gray-400 mt-1">Përsëritja e kontrollit (min. 1 minutë)</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Rikontrollo fluturimet me pak vende çdo X minuta</label>
            <Input type="number" min="1" step="1" value={scFlaggedInterval}
              onChange={e => setScFlaggedInterval(e.target.value)}
              className="max-w-40 text-center text-lg font-semibold" />
            <p className="text-xs text-gray-400 mt-1">Vetëm për 1/3 dhe 2/3. Nis edhe gjatë kontrolleve të tjera; ruan kufizimet e kërkesave drejt Google.</p>
          </div>
          {scLastRun && (
            <p className="text-xs text-muted-foreground">
              Kontrolli i fundit: {fmtDateTimeAmPm(scLastRun, { timeZone: "Europe/Tirane" })}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleSaveSeatCheck} disabled={scSaving} className="gap-2 bg-orange-600 hover:bg-orange-700 flex-1">
              {scSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : scSaved ? <Check className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {scSaving ? "Po ruhet..." : scSaved ? "✓ U ruajt!" : "Ruaj Cilësimet"}
            </Button>
            <Button onClick={handleRunSeatCheckNow} disabled={scRunning} variant="outline" className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50 flex-1">
              {scRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {scRunning ? "Po kontrollohet..." : "Kontrollo Tani"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            "Kontrollo Tani" e kryen kontrollin menjëherë (edhe nëse është joaktiv), pa pritur intervalin.
          </p>
        </CardContent>
      </Card>


      {/* ── Fjalëkalimi i Anulimit ──────────────────────────────────────────── */}
      <CancelPasswordCard />

      {/* ── Shenjat "Social Proof" në Booking Engine ────────────────────────── */}
      <Card className="border-2 border-rose-100">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-rose-500" />
            Shenjat "Social Proof" (Booking Engine)
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Shenjat te kartat e fluturimeve në faqen publike të rezervimit, p.sh.
            <span className="font-semibold text-rose-700"> "🔥 4 persona rezervuan 44 min më parë"</span> ose
            <span className="font-semibold text-sky-700"> "3 persona po shikojnë tani"</span>.
            Këta numra janë <span className="font-semibold">demonstrativë</span> (nuk janë të dhëna reale).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer">
            <span className="text-sm font-medium text-gray-700">
              Shfaq shenjat te klientët
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                Çaktivizoje për t'i fshehur plotësisht nga faqja e rezervimit.
              </span>
            </span>
            <input
              type="checkbox"
              checked={spEnabled}
              disabled={spSaving}
              onChange={e => { setSpEnabled(e.target.checked); handleSaveSocialProof(e.target.checked); }}
              className="h-5 w-5 accent-rose-500 cursor-pointer shrink-0 ml-3"
            />
          </label>
          {spSaved && (
            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> U ruajt!
            </p>
          )}
        </CardContent>
      </Card>

      {isAdmin && <GuestFlightAccess />}
      {/* ── Default agency rules for Booking Engine ──────────────────────── */}
      {isAdmin && <Card id="agency-flight-rules">
        <CardHeader><CardTitle className="text-base">Rregullat e agjencive</CardTitle></CardHeader>
        <CardContent className="space-y-4">
        <AgencyGroupsSettings />
        <p className="text-sm text-muted-foreground">
          Agjencitë pa grup nuk shohin dhe nuk rezervojnë asnjë fluturim në Booking Engine. Caktoni grupin te profili i agjencisë; rregullat e veçanta të saj u shtohen rregullave të grupit.
        </p>
        <p className="text-xs text-muted-foreground">
          Rregullat dhe përjashtimet e përgjithshme të mëparshme ruhen në sistem, por nuk janë aktive dhe nuk ndryshohen më nga kjo faqe.
        </p>
        </CardContent>
      </Card>}

      {/* ── Booking Engine Visibility ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plane className="h-4 w-4 text-blue-500" />
            Fluturimet në Booking Engine
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Kontrollo cilat fluturime janë të dukshme për klientët në faqen e rezervimit publik.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Kërko sipas numrit, qytetit..."
              value={beSearch}
              onChange={e => setBeSearch(e.target.value)}
              className="max-w-xs text-sm"
            />
            <Button variant="outline" size="sm" onClick={fetchBeFlights} disabled={beLoading} title="Rifresko">
              <RefreshCw className={`h-4 w-4 ${beLoading ? "animate-spin" : ""}`} />
            </Button>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {getFilteredBeFlights().length} fluturime
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={beSelectAllLoading || beLoading || getFilteredBeFlights().length === 0}
                onClick={() => toggleAllBeFlights(true)}
                className="gap-1.5 text-xs text-blue-700 border-blue-200 hover:bg-blue-50"
              >
                {beSelectAllLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Shfaq të Gjitha
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={beSelectAllLoading || beLoading || getFilteredBeFlights().length === 0}
                onClick={() => toggleAllBeFlights(false)}
                className="gap-1.5 text-xs text-gray-600 border-gray-200 hover:bg-gray-50"
              >
                {beSelectAllLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                Fshih të Gjitha
              </Button>
            </div>
          </div>

          {beLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Po ngarkon fluturimet...
            </div>
          )}

          {!beLoading && (
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] text-xs font-medium text-muted-foreground bg-muted/40 px-3 py-2 border-b">
                <span>Fluturimi</span>
                <span className="pr-12">Data</span>
                <span className="pr-4">Statusi</span>
                <span>Booking</span>
              </div>
              <div className="divide-y max-h-[420px] overflow-y-auto">
                {getFilteredBeFlights().map(f => (
                  <div key={f.id} className={`grid grid-cols-[1fr_auto_auto_auto] px-3 py-2.5 items-center text-sm transition-colors ${!f.showInBookingEngine ? "bg-red-50/50" : ""}`}>
                    <div>
                      <span className="font-medium">{fmtFlightNum(f.flightNumber)}</span>
                      <span className="text-muted-foreground text-xs ml-2">{f.fromCity} → {f.toCity}</span>
                    </div>
                    <span className="text-xs text-muted-foreground pr-12">{f.departureDate}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full mr-4 ${
                      f.status === "open" ? "bg-green-100 text-green-700" :
                      f.status === "closed" ? "bg-gray-100 text-gray-600" :
                      "bg-red-100 text-red-700"
                    }`}>{f.status}</span>
                    <button
                      onClick={() => toggleBeFlightVisibility(f.id, !f.showInBookingEngine)}
                      disabled={beToggling.has(f.id) || beSelectAllLoading}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                        f.showInBookingEngine
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                      title={f.showInBookingEngine ? "Fshih nga Booking Engine" : "Shfaq në Booking Engine"}
                    >
                      {beToggling.has(f.id)
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : f.showInBookingEngine
                        ? <Eye className="h-3.5 w-3.5" />
                        : <EyeOff className="h-3.5 w-3.5" />
                      }
                      {f.showInBookingEngine ? "Aktiv" : "Fshehur"}
                    </button>
                  </div>
                ))}
                {getFilteredBeFlights().length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Asnjë fluturim nuk u gjet.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            <Eye className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Fluturimet <strong>Aktiv</strong> janë të dukshme në faqen publike. Fluturimet <strong>Fshehur</strong> nuk shfaqen te klientët por mbeten aktive në FMS.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CancelPasswordCard() {
  const { toast } = useToast();
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/settings/cancel-password`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { isSet: false })
      .then(d => setIsSet(!!d.isSet))
      .catch(() => setIsSet(false));
  }, []);

  const save = async () => {
    if (pwd.length < 3) { toast({ title: "Min. 3 karaktere", variant: "destructive" }); return; }
    if (pwd !== pwd2) { toast({ title: "Fjalëkalimet nuk përputhen", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/settings/cancel-password`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      if (r.ok) {
        toast({ title: "Fjalëkalimi u ruajt" });
        setIsSet(true); setPwd(""); setPwd2("");
      } else {
        const e = await r.json().catch(() => ({}));
        toast({ title: "Gabim", description: e.error || "S'u ruajt", variant: "destructive" });
      }
    } finally { setBusy(false); }
  };

  const clear = async () => {
    if (!(await confirmDangerDialog({ title: "Hiq fjalëkalimin?", text: "Pas kësaj anulimet do të bllokohen derisa të vendoset sërish." }))) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/settings/cancel-password`, { method: "DELETE", credentials: "include" });
      if (r.ok) { toast({ title: "Fjalëkalimi u hoq" }); setIsSet(false); }
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <XIcon className="h-4 w-4 text-red-500" />
          Fjalëkalimi i Anulimit
        </CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Kërkohet kur stafi anullon ose rikthen një rezervim. Vetëm admini mund ta vendosë/ndryshojë.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs">
          Statusi:{" "}
          {isSet === null
            ? <span className="text-muted-foreground">duke u kontrolluar...</span>
            : isSet
              ? <span className="text-emerald-700 font-medium">I VENDOSUR</span>
              : <span className="text-amber-700 font-medium">JO I VENDOSUR — anulimi është i bllokuar</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
          <Input type={show ? "text" : "password"} placeholder={isSet ? "Fjalëkalim i ri" : "Vendos fjalëkalim"} value={pwd} onChange={e => setPwd(e.target.value)} />
          <Input type={show ? "text" : "password"} placeholder="Konfirmo fjalëkalimin" value={pwd2} onChange={e => setPwd2(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShow(s => !s)} className="text-xs">
            {show ? <><EyeOff className="h-3.5 w-3.5 mr-1" />Fshih</> : <><Eye className="h-3.5 w-3.5 mr-1" />Shfaq</>}
          </Button>
          <Button size="sm" onClick={save} disabled={busy || !pwd || !pwd2}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            Ruaj
          </Button>
          {isSet && (
            <Button size="sm" variant="outline" onClick={clear} disabled={busy} className="text-red-600 border-red-300 hover:bg-red-50">
              Hiq fjalëkalimin
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const XIcon = X;

// ── Agent Price Rules section ────────────────────────────────────────────────
type RuleTierForm = { minPrice: string; maxPrice: string; value: string };
interface AgentLite { id: number; name: string; company?: string | null }
interface PriceRuleDTO {
  id: number;
  name: string;
  active: boolean;
  discountType: string;
  tiers: { minPrice: number; maxPrice: number | null; value: number }[];
  applyAllFlights: boolean;
  flightIds: number[];
  fromCity: string | null;
  toCity: string | null;
  airline: string | null;
  departureFrom: string | null;
  departureTo: string | null;
  agentIds: number[];
}

interface RuleForm {
  name: string;
  active: boolean;
  discountType: "percent" | "fixed";
  tiers: RuleTierForm[];
  applyAllFlights: boolean;
  flightIds: string;
  fromCity: string;
  toCity: string;
  airline: string;
  departureFrom: string;
  departureTo: string;
  agentIds: number[];
}

const emptyRuleForm = (): RuleForm => ({
  name: "",
  active: true,
  discountType: "percent",
  tiers: [{ minPrice: "0", maxPrice: "", value: "0" }],
  applyAllFlights: true,
  flightIds: "",
  fromCity: "",
  toCity: "",
  airline: "",
  departureFrom: "",
  departureTo: "",
  agentIds: [],
});

function ruleToForm(r: PriceRuleDTO): RuleForm {
  return {
    name: r.name,
    active: r.active,
    discountType: r.discountType === "fixed" ? "fixed" : "percent",
    tiers: (r.tiers?.length ? r.tiers : [{ minPrice: 0, maxPrice: null, value: 0 }]).map(t => ({
      minPrice: String(t.minPrice ?? 0),
      maxPrice: t.maxPrice == null ? "" : String(t.maxPrice),
      value: String(t.value ?? 0),
    })),
    applyAllFlights: r.applyAllFlights,
    flightIds: (r.flightIds ?? []).join(", "),
    fromCity: r.fromCity ?? "",
    toCity: r.toCity ?? "",
    airline: r.airline ?? "",
    departureFrom: r.departureFrom ?? "",
    departureTo: r.departureTo ?? "",
    agentIds: r.agentIds ?? [],
  };
}

function VersionSection() {
  const [showHistory, setShowHistory] = useState(false);
  const latest = CHANGELOG[0];
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-indigo-500" />
            Versioni i Sistemit
          </CardTitle>
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 border border-indigo-100">
            v{APP_VERSION}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <button
          type="button"
          onClick={() => setShowHistory(s => !s)}
          className="flex w-full items-center justify-between rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <span>
            {showHistory ? "Fshih historikun e versioneve" : "Shiko historikun e versioneve"}
            {latest?.date && <span className="text-[11px] text-gray-400"> · i fundit {latest.date}</span>}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showHistory ? "rotate-180" : ""}`} />
        </button>

        {showHistory && (
          <div className="mt-3 max-h-72 space-y-4 overflow-y-auto pr-1">
            {CHANGELOG.map((entry) => (
              <div key={entry.version} className="border-l-2 border-indigo-200 pl-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">v{entry.version}</span>
                  {entry.date && <span className="text-[11px] text-gray-400">{entry.date}</span>}
                </div>
                <ul className="mt-1 space-y-1">
                  {entry.notes.map((n, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PriceRulesSection() {
  const { toast } = useToast();
  const [rules, setRules] = useState<PriceRuleDTO[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<RuleForm>(emptyRuleForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [rr, aa] = await Promise.all([
        fetch(`${API_BASE}/price-rules`, { credentials: "include" }),
        fetch(`${API_BASE}/agents`, { credentials: "include" }),
      ]);
      if (rr.ok) setRules(await rr.json());
      if (aa.ok) {
        const data = await aa.json();
        const list: any[] = Array.isArray(data) ? data : data.agents ?? [];
        setAgents(list.map(a => ({ id: a.id, name: a.name, company: a.company })));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const agentName = (id: number) => {
    const a = agents.find(x => x.id === id);
    return a ? (a.company ? `${a.name} (${a.company})` : a.name) : `#${id}`;
  };

  const openCreate = () => { setForm(emptyRuleForm()); setEditingId(null); setShowForm(true); };
  const openEdit = (r: PriceRuleDTO) => { setForm(ruleToForm(r)); setEditingId(r.id); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingId(null); };

  const setTier = (i: number, field: keyof RuleTierForm, value: string) =>
    setForm(f => ({ ...f, tiers: f.tiers.map((t, idx) => idx === i ? { ...t, [field]: value } : t) }));
  const addTier = () => setForm(f => ({ ...f, tiers: [...f.tiers, { minPrice: "0", maxPrice: "", value: "0" }] }));
  const removeTier = (i: number) => setForm(f => ({ ...f, tiers: f.tiers.filter((_, idx) => idx !== i) }));
  const toggleAgent = (id: number) =>
    setForm(f => ({ ...f, agentIds: f.agentIds.includes(id) ? f.agentIds.filter(x => x !== id) : [...f.agentIds, id] }));

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Vendos një emër për rregullin", variant: "destructive" }); return; }
    if (form.agentIds.length === 0) { toast({ title: "Zgjidh të paktën një agjent", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        active: form.active,
        discountType: form.discountType,
        tiers: form.tiers.map(t => ({
          minPrice: Number(t.minPrice) || 0,
          maxPrice: t.maxPrice === "" ? null : Number(t.maxPrice),
          value: Number(t.value) || 0,
        })),
        applyAllFlights: form.applyAllFlights,
        flightIds: form.applyAllFlights ? [] : form.flightIds.split(",").map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n)),
        fromCity: form.fromCity.trim() || null,
        toCity: form.toCity.trim() || null,
        airline: form.airline.trim() || null,
        departureFrom: form.departureFrom || null,
        departureTo: form.departureTo || null,
        agentIds: form.agentIds,
      };
      const url = editingId ? `${API_BASE}/price-rules/${editingId}` : `${API_BASE}/price-rules`;
      const resp = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        toast({ title: editingId ? "Rregulli u përditësua" : "Rregulli u krijua" });
        closeForm();
        load();
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  const toggleActive = async (r: PriceRuleDTO) => {
    const resp = await fetch(`${API_BASE}/price-rules/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active: !r.active }),
    });
    if (resp.ok) setRules(prev => prev.map(x => x.id === r.id ? { ...x, active: !x.active } : x));
  };

  const remove = async (r: PriceRuleDTO) => {
    const ok = await confirmDangerDialog({
      title: "Fshi rregullin",
      text: `Je i sigurt që do të fshish rregullin "${r.name}"?`,
      confirmText: "Fshi",
    });
    if (!ok) return;
    const resp = await fetch(`${API_BASE}/price-rules/${r.id}`, { method: "DELETE", credentials: "include" });
    if (resp.ok) { setRules(prev => prev.filter(x => x.id !== r.id)); toast({ title: "Rregulli u fshi" }); }
  };

  const tierLabel = (t: { minPrice: number; maxPrice: number | null; value: number; minSalePrice?: number | null }, type: string) => {
    const range = t.maxPrice == null ? `€${fmtM(t.minPrice)}+` : `€${fmtM(t.minPrice)}–€${fmtM(t.maxPrice)}`;
    const val = type === "fixed" ? `−€${fmtM(t.value)}` : `−${t.value}%`;
    const floor = t.minSalePrice != null ? ` (min €${fmtM(t.minSalePrice)})` : "";
    return `${range}: ${val}${floor}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="h-4 w-4 text-emerald-600" />
          Rregullat e Çmimeve të Agjentëve
        </CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">
          Çmime me kushte për agjentë specifikë. Kur një agjent ka ≥1 rregull aktiv,
          rregullat përcaktojnë çmimin (markup-i dhe zbritja fikse anashkalohen).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : (
          <>
            {rules.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nuk ka rregulla. Krijo një rregull të ri më poshtë.</p>
            ) : (
              <div className="space-y-2">
                {rules.map(r => (
                  <div key={r.id} className={cn("border rounded-xl p-3 flex items-start gap-3", r.active ? "bg-white" : "bg-gray-50 opacity-70")}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{r.name}</span>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", r.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500")}>
                          {r.active ? "AKTIV" : "JOAKTIV"}
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                          {r.discountType === "fixed" ? "Fikse (€)" : "Përqindje (%)"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                        {r.tiers.map((t, i) => <span key={i} className="bg-slate-100 rounded px-1.5 py-0.5">{tierLabel(t, r.discountType)}</span>)}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1">
                        {r.applyAllFlights ? "Të gjitha fluturimet" : `Fluturime: ${(r.flightIds ?? []).join(", ") || "—"}`}
                        {(r.fromCity || r.toCity) && <> · {r.fromCity || "*"}→{r.toCity || "*"}</>}
                        {r.airline && <> · {r.airline}</>}
                        {(r.departureFrom || r.departureTo) && <> · {r.departureFrom || "…"} – {r.departureTo || "…"}</>}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        <span className="font-medium">Agjentë:</span> {(r.agentIds ?? []).map(agentName).join(", ") || "—"}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => toggleActive(r)}>
                        {r.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => remove(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!showForm ? (
              <Button onClick={openCreate} className="gap-2 bg-emerald-600 hover:bg-emerald-700 w-full">
                <Plus className="h-4 w-4" /> Rregull i Ri
              </Button>
            ) : (
              <div className="border-2 border-emerald-200 rounded-xl p-4 space-y-4 bg-emerald-50/30">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 text-sm">{editingId ? "Përditëso Rregullin" : "Rregull i Ri"}</h3>
                  <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Emri</label>
                    <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="p.sh. VIP Agjentët" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Lloji i zbritjes</label>
                    <select
                      value={form.discountType}
                      onChange={e => setForm(f => ({ ...f, discountType: e.target.value === "fixed" ? "fixed" : "percent" }))}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="percent">Përqindje (%)</option>
                      <option value="fixed">Shumë fikse (€)</option>
                    </select>
                  </div>
                </div>

                {/* Tiers */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">
                    Nivelet e çmimit (sipas çmimit bazë të biletës)
                  </label>
                  <div className="space-y-2">
                    {form.tiers.map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input type="number" step="1" value={t.minPrice} onChange={e => setTier(i, "minPrice", e.target.value)} placeholder="Min €" className="h-9 text-sm" />
                        <span className="text-gray-400 text-xs">–</span>
                        <Input type="number" step="1" value={t.maxPrice} onChange={e => setTier(i, "maxPrice", e.target.value)} placeholder="Max € (bosh = ∞)" className="h-9 text-sm" />
                        <span className="text-gray-400 text-xs">→</span>
                        <Input type="number" step={form.discountType === "fixed" ? "1" : "0.01"} value={t.value} onChange={e => setTier(i, "value", e.target.value)} placeholder={form.discountType === "fixed" ? "€" : "%"} className="h-9 text-sm w-24" />
                        <button onClick={() => removeTier(i)} disabled={form.tiers.length <= 1} className="text-red-400 hover:text-red-600 disabled:opacity-30 shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" onClick={addTier} className="gap-1 mt-2 h-8 text-xs">
                    <Plus className="h-3.5 w-3.5" /> Shto nivel
                  </Button>
                </div>

                {/* Flight scope */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={form.applyAllFlights} onChange={e => setForm(f => ({ ...f, applyAllFlights: e.target.checked }))} />
                    Apliko për të gjitha fluturimet
                  </label>
                  {!form.applyAllFlights && (
                    <Input value={form.flightIds} onChange={e => setForm(f => ({ ...f, flightIds: e.target.value }))} placeholder="ID-të e fluturimeve, ndarë me presje (p.sh. 12, 34, 56)" className="h-9 text-sm" />
                  )}
                </div>

                {/* Filters */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Nga (kod)</label>
                    <Input value={form.fromCity} onChange={e => setForm(f => ({ ...f, fromCity: e.target.value }))} placeholder="TIA" className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Për (kod)</label>
                    <Input value={form.toCity} onChange={e => setForm(f => ({ ...f, toCity: e.target.value }))} placeholder="LGW" className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Kompania ajrore</label>
                    <Input value={form.airline} onChange={e => setForm(f => ({ ...f, airline: e.target.value }))} placeholder="Wizz" className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Nisja nga</label>
                    <Input type="date" value={form.departureFrom} onChange={e => setForm(f => ({ ...f, departureFrom: e.target.value }))} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Nisja deri</label>
                    <Input type="date" value={form.departureTo} onChange={e => setForm(f => ({ ...f, departureTo: e.target.value }))} className="h-9 text-sm" />
                  </div>
                </div>

                {/* Agents */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Agjentët ({form.agentIds.length} të zgjedhur)</label>
                  <div className="border rounded-lg max-h-40 overflow-y-auto bg-white divide-y">
                    {agents.length === 0 ? (
                      <p className="text-xs text-gray-400 italic p-3">Nuk ka agjentë.</p>
                    ) : agents.map(a => (
                      <label key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={form.agentIds.includes(a.id)} onChange={() => toggleAgent(a.id)} />
                        <span className="text-gray-700">{a.name}{a.company ? <span className="text-gray-400"> · {a.company}</span> : null}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                  Rregull aktiv
                </label>

                <div className="flex gap-2">
                  <Button onClick={save} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700 flex-1">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {saving ? "Po ruhet..." : editingId ? "Përditëso" : "Krijo Rregullin"}
                  </Button>
                  <Button variant="outline" onClick={closeForm} disabled={saving}>Anulo</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Google Price Rules ────────────────────────────────────────────────────────
type GoogleTierForm = { minPrice: string; maxPrice: string; value: string; minSalePrice: string; maxSalePrice: string };
interface FlightLite {
  id: number;
  airline: string;
  flightNumber: string;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
}
interface GoogleRuleDTO {
  id: number;
  name: string;
  active: boolean;
  applyOffline: boolean;
  applyInternal?: boolean;
  discountType: string;
  tiers: { minPrice: number; maxPrice: number | null; value: number; minSalePrice?: number | null; maxSalePrice?: number | null }[];
  offlineTiers?: { minPrice: number; maxPrice: number | null; value: number; minSalePrice?: number | null; maxSalePrice?: number | null }[];
  offlineDiscountType?: string;
  offlineRoundToFive?: boolean;
  minPrice: number | null;
  roundToFive: boolean;
  applyAllFlights: boolean;
  flightIds: number[];
  fromCity: string | null;
  toCity: string | null;
  airline: string | null;
  departureFrom: string | null;
  departureTo: string | null;
}

interface GoogleRuleForm {
  name: string;
  active: boolean;
  applyOffline: boolean;
  applyInternal: boolean;
  discountType: "percent" | "fixed";
  tiers: GoogleTierForm[];
  offlineTiers: GoogleTierForm[];
  offlineDiscountType: "percent" | "fixed";
  offlineRoundToFive: boolean;
  roundToFive: boolean;
  applyAllFlights: boolean;
  flightIds: number[];
  fromCity: string;
  toCity: string;
  airline: string;
  departureFrom: string;
  departureTo: string;
}

const emptyGoogleRuleForm = (): GoogleRuleForm => ({
  name: "",
  active: true,
  applyOffline: false,
  applyInternal: true,
  discountType: "percent",
  tiers: [{ minPrice: "0", maxPrice: "", value: "0", minSalePrice: "", maxSalePrice: "" }],
  offlineTiers: [{ minPrice: "0", maxPrice: "", value: "0", minSalePrice: "", maxSalePrice: "" }],
  offlineDiscountType: "percent",
  offlineRoundToFive: true,
  roundToFive: true,
  applyAllFlights: true,
  flightIds: [],
  fromCity: "",
  toCity: "",
  airline: "",
  departureFrom: "",
  departureTo: "",
});

function googleRuleToForm(r: GoogleRuleDTO): GoogleRuleForm {
  const mapTier = (t: { minPrice: number; maxPrice: number | null; value: number; minSalePrice?: number | null; maxSalePrice?: number | null }, legacyFloor: number | null) => ({
    minPrice: String(t.minPrice ?? 0),
    maxPrice: t.maxPrice == null ? "" : String(t.maxPrice),
    value: String(t.value ?? 0),
    // Pre-fill from per-tier floor; fall back to legacy rule-level minPrice so
    // older single-floor rules still show their value when edited.
    minSalePrice:
      t.minSalePrice != null ? String(t.minSalePrice) : legacyFloor != null ? String(legacyFloor) : "",
    maxSalePrice: t.maxSalePrice != null ? String(t.maxSalePrice) : "",
  });
  const blankTier = { minPrice: 0, maxPrice: null, value: 0, minSalePrice: null, maxSalePrice: null };
  // Offline tiers fall back to the internal tiers for legacy offline rules whose
  // offlineTiers were never populated — so editing them shows their real values.
  const offlineSource = r.offlineTiers?.length ? r.offlineTiers : (r.applyOffline && r.tiers?.length ? r.tiers : null);
  return {
    name: r.name,
    active: r.active,
    applyOffline: r.applyOffline ?? false,
    applyInternal: r.applyInternal !== false,
    discountType: r.discountType === "fixed" ? "fixed" : "percent",
    tiers: (r.tiers?.length ? r.tiers : [blankTier]).map(t => mapTier(t, r.minPrice)),
    offlineTiers: (offlineSource ?? [blankTier]).map(t => mapTier(t, null)),
    offlineDiscountType: (r.offlineTiers?.length ? r.offlineDiscountType : r.applyOffline ? r.discountType : r.offlineDiscountType) === "fixed" ? "fixed" : "percent",
    offlineRoundToFive: r.offlineTiers?.length ? (r.offlineRoundToFive ?? true) : (r.applyOffline ? (r.roundToFive ?? true) : (r.offlineRoundToFive ?? true)),
    roundToFive: r.roundToFive ?? true,
    applyAllFlights: r.applyAllFlights,
    flightIds: r.flightIds ?? [],
    fromCity: r.fromCity ?? "",
    toCity: r.toCity ?? "",
    airline: r.airline ?? "",
    departureFrom: r.departureFrom ?? "",
    departureTo: r.departureTo ?? "",
  };
}

export function GooglePriceRulesSection() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const [rules, setRules] = useState<GoogleRuleDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<GoogleRuleForm>(emptyGoogleRuleForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [copyingFromName, setCopyingFromName] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flights, setFlights] = useState<FlightLite[]>([]);
  const [flightsReady, setFlightsReady] = useState(false);
  const [flightsError, setFlightsError] = useState(false);
  const ruleRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [scrollToId, setScrollToId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rr = await fetch(`${API_BASE}/google-price-rules`, { credentials: "include" });
      if (rr.ok) setRules(await rr.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  const loadFlights = async () => {
    setFlightsReady(false);
    setFlightsError(false);
    try {
      const resp = await fetch(`${API_BASE}/google-price-rules/flight-options`, { credentials: "include" });
      if (!resp.ok) throw new Error("Flight catalog unavailable");
      if (resp.ok) {
        const data = await resp.json();
        const list: any[] = Array.isArray(data) ? data : data.data ?? [];
        setFlights(list.map(f => ({
          id: f.id,
          airline: f.airline ?? "",
          flightNumber: f.flightNumber ?? "",
          fromCity: f.fromCity ?? "",
          toCity: f.toCity ?? "",
          departureDate: f.departureDate ?? "",
          departureTime: f.departureTime ?? "",
        })));
        setFlightsReady(true);
      }
    } catch { setFlightsError(true); }
  };
  useEffect(() => { load(); loadFlights(); }, []);

  // Pas ruajtjes forma mbyllet dhe lista shkurtohet — më parë kjo e bënte faqen
  // të "kërcente" dhe përdoruesi humbte vendin. Ankorohu te rregulli i ruajtur
  // duke e sjellë rreshtin e tij (tani i mbyllur) prapë në pamje.
  useEffect(() => {
    if (scrollToId == null) return;
    const el = ruleRowRefs.current.get(scrollToId);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setScrollToId(null);
    }
  }, [rules, scrollToId]);

  const openCreate = () => {
    setForm(emptyGoogleRuleForm());
    setEditingId(null);
    setCopyingFromName(null);
    setShowForm(true);
  };
  const openEdit = (r: GoogleRuleDTO) => {
    setForm(googleRuleToForm(r));
    setEditingId(r.id);
    setCopyingFromName(null);
    setShowForm(true);
  };
  const openCopy = (r: GoogleRuleDTO) => {
    const baseName = `Kopje — ${r.name}`;
    const existingNames = new Set(rules.map(rule => rule.name.trim().toLocaleLowerCase()));
    let copyName = baseName;
    let suffix = 2;
    while (existingNames.has(copyName.toLocaleLowerCase())) {
      copyName = `Kopje ${suffix} — ${r.name}`;
      suffix += 1;
    }
    setForm({ ...googleRuleToForm(r), name: copyName, active: false });
    setEditingId(null);
    setCopyingFromName(r.name);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setCopyingFromName(null);
  };

  const setTier = (i: number, field: keyof GoogleTierForm, value: string) =>
    setForm(f => ({ ...f, tiers: f.tiers.map((t, idx) => idx === i ? { ...t, [field]: value } : t) }));
  const addTier = () => setForm(f => ({ ...f, tiers: [...f.tiers, { minPrice: "0", maxPrice: "", value: "0", minSalePrice: "", maxSalePrice: "" }] }));
  const removeTier = (i: number) => setForm(f => ({ ...f, tiers: f.tiers.filter((_, idx) => idx !== i) }));
  // Offline (Citizen) tier editors — independent state, mirror the internal ones.
  const setOfflineTier = (i: number, field: keyof GoogleTierForm, value: string) =>
    setForm(f => ({ ...f, offlineTiers: f.offlineTiers.map((t, idx) => idx === i ? { ...t, [field]: value } : t) }));
  const addOfflineTier = () => setForm(f => ({ ...f, offlineTiers: [...f.offlineTiers, { minPrice: "0", maxPrice: "", value: "0", minSalePrice: "", maxSalePrice: "" }] }));
  const removeOfflineTier = (i: number) => setForm(f => ({ ...f, offlineTiers: f.offlineTiers.filter((_, idx) => idx !== i) }));
  const save = async () => {
    if (!flightsReady) { toast({ title: "Prit të ngarkohet lista e plotë e fluturimeve.", variant: "destructive" }); return; }
    if (!form.name.trim()) { toast({ title: "Vendos një emër për rregullin", variant: "destructive" }); return; }
    const isCreatingCopy = copyingFromName != null;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        active: form.active,
        discountType: form.discountType,
        tiers: form.tiers.map(t => ({
          minPrice: Math.round(Number(t.minPrice) || 0),
          maxPrice: t.maxPrice === "" ? null : Math.round(Number(t.maxPrice)),
          value: form.discountType === "fixed" ? Math.round(Number(t.value) || 0) : Number(t.value) || 0,
          minSalePrice: t.minSalePrice.trim() === "" ? null : Math.round(Number(t.minSalePrice)),
          maxSalePrice: t.maxSalePrice.trim() === "" ? null : Math.round(Number(t.maxSalePrice)),
        })),
        minPrice: null,
        applyOffline: form.applyOffline,
        applyInternal: form.applyInternal,
        offlineDiscountType: form.offlineDiscountType,
        offlineRoundToFive: form.offlineRoundToFive,
        offlineTiers: form.offlineTiers.map(t => ({
          minPrice: Math.round(Number(t.minPrice) || 0),
          maxPrice: t.maxPrice === "" ? null : Math.round(Number(t.maxPrice)),
          value: form.offlineDiscountType === "fixed" ? Math.round(Number(t.value) || 0) : Number(t.value) || 0,
          minSalePrice: t.minSalePrice.trim() === "" ? null : Math.round(Number(t.minSalePrice)),
          maxSalePrice: t.maxSalePrice.trim() === "" ? null : Math.round(Number(t.maxSalePrice)),
        })),
        roundToFive: form.roundToFive,
        applyAllFlights: form.applyAllFlights,
        flightIds: form.applyAllFlights ? [] : form.flightIds,
        fromCity: form.fromCity.trim() || null,
        toCity: form.toCity.trim() || null,
        airline: form.airline.trim() || null,
        departureFrom: form.departureFrom || null,
        departureTo: form.departureTo || null,
      };
      const url = editingId ? `${API_BASE}/google-price-rules/${editingId}` : `${API_BASE}/google-price-rules`;
      const resp = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        let savedId: number | null = editingId;
        try { const saved = await resp.json(); if (saved && typeof saved.id === "number") savedId = saved.id; } catch { /* ignore */ }
        toast({ title: editingId ? "Rregulli u përditësua" : isCreatingCopy ? "Kopja e rregullit u krijua" : "Rregulli u krijua" });
        closeForm();
        await load();
        if (savedId != null) setScrollToId(savedId);
      } else {
        toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  const toggleActive = async (r: GoogleRuleDTO) => {
    const resp = await fetch(`${API_BASE}/google-price-rules/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active: !r.active }),
    });
    if (resp.ok) setRules(prev => prev.map(x => x.id === r.id ? { ...x, active: !x.active } : x));
  };

  const remove = async (r: GoogleRuleDTO) => {
    const ok = await confirmDangerDialog({
      title: "Fshi rregullin",
      text: `Je i sigurt që do të fshish rregullin "${r.name}"?`,
      confirmText: "Fshi",
    });
    if (!ok) return;
    const resp = await fetch(`${API_BASE}/google-price-rules/${r.id}`, { method: "DELETE", credentials: "include" });
    if (resp.ok) {
      setRules(prev => prev.filter(x => x.id !== r.id));
      if (editingId === r.id) closeForm();
      toast({ title: "Rregulli u fshi" });
    }
  };

  const tierLabel = (t: { minPrice: number; maxPrice: number | null; value: number; minSalePrice?: number | null; maxSalePrice?: number | null }, type: string) => {
    const range = t.maxPrice == null ? `€${fmtM(t.minPrice)}+` : `€${fmtM(t.minPrice)}–€${fmtM(t.maxPrice)}`;
    const val = type === "fixed" ? `−€${fmtM(t.value)}` : `−${t.value}%`;
    const floor = t.minSalePrice != null ? ` (min €${fmtM(t.minSalePrice)})` : "";
    const cap = t.maxSalePrice != null ? ` (max €${fmtM(t.maxSalePrice)})` : "";
    return `${range}: ${val}${floor}${cap}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-sky-600" />
          Rregullat e Çmimeve sipas Google
        </CardTitle>
        {!showForm && (
          <p className="text-xs text-gray-400 mt-0.5">
            Llogaritin automatikisht çmimin REAL të shitjes (çmimi i të rriturit) duke u nisur nga
            çmimi i Google Flights. Nivelet maten sipas çmimit të Google; rezultati nuk zbret kurrë
            nën çmimin minimal të caktuar.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : showForm ? (
          <div className="space-y-3">
            <button
              onClick={closeForm}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              <ChevronLeft className="h-4 w-4" /> Kthehu te lista
            </button>
            {renderFormPanel()}
          </div>
        ) : (
          <>
            {rules.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nuk ka rregulla. Krijo një rregull të ri më poshtë.</p>
            ) : (
              <div className="space-y-1.5">
                {rules.map(r => {
                  const drivesInternal = r.applyInternal !== false;
                  const offlineTierList = r.offlineTiers?.length ? r.offlineTiers : (r.applyOffline ? r.tiers : []);
                  const flightText = drivesInternal ? r.tiers.map(t => tierLabel(t, r.discountType)).join("  ·  ") : "";
                  const offlineText = r.applyOffline ? offlineTierList.map(t => tierLabel(t, r.offlineTiers?.length ? (r.offlineDiscountType ?? "percent") : r.discountType)).join("  ·  ") : "";
                  const tierText = [drivesInternal && flightText ? `Fluturime: ${flightText}` : "", r.applyOffline && offlineText ? `Offline: ${offlineText}` : ""].filter(Boolean).join("   |   ");
                  return (
                    <div
                      key={r.id}
                      ref={el => { if (el) ruleRowRefs.current.set(r.id, el); else ruleRowRefs.current.delete(r.id); }}
                      className={cn("border rounded-xl overflow-hidden transition-shadow scroll-mt-4", r.active ? "bg-white" : "bg-gray-50")}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openEdit(r)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(r); } }}
                        className={cn("flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none hover:bg-slate-50", !r.active && "opacity-70")}
                      >
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                        <span className="font-semibold text-gray-900 text-sm shrink-0 max-w-[150px] xl:max-w-[280px] truncate" title={r.name}>{r.name}</span>
                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0", r.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500")}>
                          {r.active ? "AKTIV" : "JOAKTIV"}
                        </span>
                        {drivesInternal && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 shrink-0" title="Ky rregull vendos çmimin e fluturimeve (i rritur/fëmijë)">
                            <TrendingUp className="h-2.5 w-2.5" /> FLUTURIME
                          </span>
                        )}
                        {r.applyOffline && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0" title="Ky rregull vendos çmimin Offline">
                            <Wifi className="h-2.5 w-2.5" /> OFFLINE
                          </span>
                        )}
                        <span className="flex-1 min-w-0 truncate text-xs text-gray-500" title={tierText}>{tierText}</span>
                        <span className="hidden md:inline text-[11px] text-gray-400 shrink-0 whitespace-nowrap">
                          {r.applyAllFlights ? "Të gjitha" : `${(r.flightIds ?? []).length} flut.`}
                          {(r.fromCity || r.toCity) ? ` · ${r.fromCity || "*"}→${r.toCity || "*"}` : ""}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggleActive(r)} title={r.active ? "Çaktivizo" : "Aktivizo"}>
                            {r.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openCopy(r)} title="Kopjo rregullin" aria-label={`Kopjo rregullin ${r.name}`}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => remove(r)} title="Fshi">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Button onClick={openCreate} className="gap-2 w-full text-white" style={{ backgroundColor: theme.accentColor }}>
              <Plus className="h-4 w-4" /> Rregull i Ri
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );

  function renderFormPanel() {
    // Shared tier editor used by BOTH the internal (flights) block and the
    // independent Offline (Citizen) block. `amber` only changes the styling.
    const renderTierEditor = (
      tiers: GoogleTierForm[],
      onSet: (i: number, field: keyof GoogleTierForm, value: string) => void,
      onAdd: () => void,
      onRemove: (i: number) => void,
      dType: "percent" | "fixed",
      amber: boolean,
    ) => (
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1.5">
          Nivelet e çmimit (sipas çmimit të Google)
        </label>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className={cn("rounded-lg border p-2.5 space-y-2", amber ? "border-amber-400 bg-amber-100/70" : "border-gray-200 bg-white")}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-[170px]">
                  <Input type="number" step="1" value={t.minPrice} onChange={e => onSet(i, "minPrice", e.target.value)} placeholder="Min €" className={cn("h-9 text-sm flex-1 min-w-0", amber && "bg-amber-50 border-amber-300 text-amber-900 placeholder:text-amber-400")} />
                  <span className={cn("text-xs", amber ? "text-amber-500" : "text-gray-400")}>–</span>
                  <Input type="number" step="1" value={t.maxPrice} onChange={e => onSet(i, "maxPrice", e.target.value)} placeholder="Max € (bosh = ∞)" className={cn("h-9 text-sm flex-1 min-w-0", amber && "bg-amber-50 border-amber-300 text-amber-900 placeholder:text-amber-400")} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs", amber ? "text-amber-500" : "text-gray-400")}>→</span>
                  <Input type="number" step={dType === "fixed" ? "1" : "0.01"} value={t.value} onChange={e => onSet(i, "value", e.target.value)} placeholder={dType === "fixed" ? "€" : "%"} className={cn("h-9 text-sm w-24", amber && "bg-amber-50 border-amber-300 text-amber-900 placeholder:text-amber-400")} />
                  <button onClick={() => onRemove(i)} disabled={tiers.length <= 1} className="text-red-400 hover:text-red-600 disabled:opacity-30 shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-0.5">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[11px] font-medium whitespace-nowrap", amber ? "text-amber-700" : "text-gray-500")}>Çmimi minimal i shitjes:</span>
                  <Input type="number" step="1" value={t.minSalePrice} onChange={e => onSet(i, "minSalePrice", e.target.value)} placeholder="bosh = pa kufi" className={cn("h-8 text-sm w-32", amber && "bg-amber-50 border-amber-300 text-amber-900 placeholder:text-amber-400")} />
                  <span className={cn("text-[11px]", amber ? "text-amber-500" : "text-gray-400")}>€</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[11px] font-medium whitespace-nowrap", amber ? "text-amber-700" : "text-gray-500")}>Çmimi maksimal i shitjes:</span>
                  <Input type="number" step="1" value={t.maxSalePrice} onChange={e => onSet(i, "maxSalePrice", e.target.value)} placeholder="bosh = pa kufi" className={cn("h-8 text-sm w-32", amber && "bg-amber-50 border-amber-300 text-amber-900 placeholder:text-amber-400")} />
                  <span className={cn("text-[11px]", amber ? "text-amber-500" : "text-gray-400")}>€</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={onAdd} className="gap-1 mt-2 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" /> Shto nivel
        </Button>
        <p className="text-[11px] text-gray-400 mt-1.5">Çdo nivel ka çmimin e vet minimal: çmimi i llogaritur për atë nivel nuk zbret kurrë nën të.</p>
      </div>
    );
    return (
              <div className="border-2 rounded-xl p-4" style={{ borderColor: theme.accentColor + "55", backgroundColor: theme.accentColor + "0d" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 text-sm">{editingId ? "Përditëso Rregullin" : copyingFromName ? "Kopjo Rregullin" : "Rregull i Ri"}</h3>
                  <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                </div>
                {copyingFromName && (
                  <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Po krijon një kopje të “{copyingFromName}”. Kopja nis JOAKTIVE që të mund ta kontrollosh para aktivizimit.
                  </p>
                )}

                <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2 xl:items-stretch">
                <div className="min-w-0 space-y-4">

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Emri</label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="p.sh. Google −10%" />
                </div>

                {/* ===== Block A: Internal flight price (adult/child) ===== */}
                <div className="rounded-xl border-2 border-sky-200 bg-sky-50/50 p-3 space-y-3">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.applyInternal}
                      onChange={e => setForm(f => ({ ...f, applyInternal: e.target.checked }))}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-sky-800 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Apliko te çmimi i fluturimeve (i rritur/fëmijë)</span>
                      <span className="block text-[11px] text-sky-700/80">Vendos çmimin REAL të shitjes brenda sistemit (i rritur dhe fëmijë), i llogaritur nga çmimi i Google sipas niveleve më poshtë.</span>
                    </span>
                  </label>

                  {form.applyInternal && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Lloji i zbritjes</label>
                        <select
                          value={form.discountType}
                          onChange={e => setForm(f => ({ ...f, discountType: e.target.value === "fixed" ? "fixed" : "percent" }))}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="percent">Përqindje (%)</option>
                          <option value="fixed">Shumë fikse (€)</option>
                        </select>
                      </div>
                      <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!form.roundToFive}
                          onChange={e => setForm(f => ({ ...f, roundToFive: !e.target.checked }))}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">Bëj çmimin fiks</span>
                          <span className="block text-[11px] text-gray-400">Mos e rrumbullakos te 5-a — përdor numrin ekzakt të llogaritur (p.sh. 132€ në vend të 130€).</span>
                        </span>
                      </label>
                      {renderTierEditor(form.tiers, setTier, addTier, removeTier, form.discountType, false)}
                    </div>
                  )}
                </div>

                {/* ===== Block B: Offline (Citizen) price — INDEPENDENT ===== */}
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50/60 p-3 space-y-3">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.applyOffline}
                      onChange={e => setForm(f => ({ ...f, applyOffline: e.target.checked }))}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-amber-800 flex items-center gap-1"><Wifi className="h-3.5 w-3.5" /> Apliko te çmimi Offline</span>
                      <span className="block text-[11px] text-amber-700/80">Kur është aktiv, ky rregull vendos çmimin <b>Offline</b> me një zbritje <b>krejt të pavarur</b> nga çmimi i fluturimeve më sipër. Cakto nivelet e veta më poshtë. Fluturimet e vendosura te "përjashto nga Google" nuk preken.</span>
                    </span>
                  </label>

                  {form.applyOffline && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-amber-800 block mb-1">Lloji i zbritjes (Offline)</label>
                        <select
                          value={form.offlineDiscountType}
                          onChange={e => setForm(f => ({ ...f, offlineDiscountType: e.target.value === "fixed" ? "fixed" : "percent" }))}
                          className="w-full h-10 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm text-amber-900"
                        >
                          <option value="percent">Përqindje (%)</option>
                          <option value="fixed">Shumë fikse (€)</option>
                        </select>
                      </div>
                      <label className="flex items-start gap-2 text-sm text-amber-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!form.offlineRoundToFive}
                          onChange={e => setForm(f => ({ ...f, offlineRoundToFive: !e.target.checked }))}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">Bëj çmimin Offline fiks</span>
                          <span className="block text-[11px] text-amber-700/80">Mos e rrumbullakos te 5-a — përdor numrin ekzakt të llogaritur.</span>
                        </span>
                      </label>
                      {renderTierEditor(form.offlineTiers, setOfflineTier, addOfflineTier, removeOfflineTier, form.offlineDiscountType, true)}
                    </div>
                  )}
                </div>

                </div>
                <div className="min-w-0 xl:relative">
                <div className="flex min-w-0 min-h-0 flex-col gap-4 xl:absolute xl:inset-0">

                {/* Flight scope — multi-select flight picker */}
                {/* The entire right column, including filters, fits the pricing column height. */}
                <div className="min-w-0 min-h-0 flex-1">
                <div className="flex h-full min-w-0 min-h-0 flex-col gap-2">
                  <label className="flex shrink-0 items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={form.applyAllFlights} onChange={e => setForm(f => ({ ...f, applyAllFlights: e.target.checked }))} />
                    Apliko për të gjitha fluturimet
                  </label>
                  {!form.applyAllFlights && (
                    <div className="flex-1 min-h-0">
                      {flightsReady ? <GoogleRuleFlightPicker showFooter={false} flights={flights} selected={form.flightIds}
                        onChange={flightIds => setForm(f => ({ ...f, flightIds }))} /> :
                        flightsError ? <p role="alert" className="text-sm text-red-700">Lista nuk u ngarkua.
                          <Button type="button" variant="outline" size="sm" onClick={loadFlights}>Provo përsëri</Button>
                        </p> : <p className="text-sm text-gray-500">Duke ngarkuar fluturimet…</p>}
                    </div>
                  )}
                </div>
                </div>

                {/* Filters */}
                <div className="shrink-0 space-y-4">
                {!form.applyAllFlights && flightsReady && <GoogleRuleFlightPickerFooter selected={form.flightIds}
                  onChange={flightIds => setForm(f => ({ ...f, flightIds }))} />}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Nga (kod)</label>
                    <Input value={form.fromCity} onChange={e => setForm(f => ({ ...f, fromCity: e.target.value }))} placeholder="TIA" className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Për (kod)</label>
                    <Input value={form.toCity} onChange={e => setForm(f => ({ ...f, toCity: e.target.value }))} placeholder="LGW" className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Kompania ajrore</label>
                    <Input value={form.airline} onChange={e => setForm(f => ({ ...f, airline: e.target.value }))} placeholder="Wizz" className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Nisja nga</label>
                    <Input type="date" value={form.departureFrom} onChange={e => setForm(f => ({ ...f, departureFrom: e.target.value }))} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Nisja deri</label>
                    <Input type="date" value={form.departureTo} onChange={e => setForm(f => ({ ...f, departureTo: e.target.value }))} className="h-9 text-sm" />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                  Rregull aktiv
                </label>

                </div>
                </div>
                </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button onClick={save} disabled={saving || !flightsReady} className="gap-2 flex-1 text-white" style={{ backgroundColor: theme.accentColor }}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {saving ? "Po ruhet..." : editingId ? "Përditëso" : copyingFromName ? "Krijo Kopjen" : "Krijo Rregullin"}
                  </Button>
                  <Button variant="outline" onClick={closeForm} disabled={saving}>Anulo</Button>
                </div>
              </div>
    );
  }
}

// ── Zilja e rezervimeve: zgjidh tonin që luhet kur vjen një rezervim i ri ──
function ChimePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl">
      {BOOKING_CHIMES.map(c => (
        <button
          key={c.id}
          onClick={() => onPick(c.id)}
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
            value === c.id
              ? "border-primary bg-primary/5 font-semibold text-primary"
              : "text-gray-600 hover:bg-muted"
          )}
        >
          <span>{c.name}</span>
          {value === c.id ? <Check className="h-4 w-4" /> : <Bell className="h-3.5 w-3.5 opacity-40" />}
        </button>
      ))}
    </div>
  );
}

// ── Çelësi global i modulit Email (server-side, vlen për të gjithë adminët) ──
function EmailModuleCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/admin-email/enabled`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setEnabled(d.enabled !== false); })
      .catch(() => {});
  }, []);
  const toggle = async (v: boolean) => {
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/admin-email/enabled`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: v }),
      });
      if (r.ok) {
        setEnabled(v);
        window.dispatchEvent(new CustomEvent("admin-email-enabled-changed", { detail: v }));
      }
    } catch { /* silent */ }
    setSaving(false);
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Moduli i Email-it
        </CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">
          Ndal/aktivizon krejt funksionin e Email-it (faqja Email + kontrolli i inbox-it) për të gjithë adminët
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="text-sm font-medium text-gray-700">
            {enabled === null ? "Duke ngarkuar..." : enabled ? "I aktivizuar" : "I çaktivizuar"}
          </div>
          <Switch
            checked={enabled === true}
            disabled={enabled === null || saving}
            onCheckedChange={toggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function GoogleLiveAutoCard() {
  const [on, setOn] = useState(getGoogleLiveAutoEnabled());
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Çmimi Live i Google në hapje
        </CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">
          Kur është ndezur, karta "Çmimi i Google" kërkon automatikisht çmimin live sa herë hapet fluturimi/rezervimi. Kur është fikur, kërkon vetëm me butonin ↻ (ruhet në këtë pajisje)
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="text-sm font-medium text-gray-700">
            {on ? "Kërkim automatik i aktivizuar" : "Vetëm me buton (i çaktivizuar)"}
          </div>
          <Switch checked={on} onCheckedChange={(v) => { setOn(v); setGoogleLiveAutoEnabled(v); }} />
        </div>
      </CardContent>
    </Card>
  );
}

function BookingChimeCard() {
  const [bookingId, setBookingId] = useState(getBookingChimeId());
  const [flightId, setFlightId] = useState(getFlightChimeId());
  const [emailOn, setEmailOn] = useState(getEmailNotifyEnabled());
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Zilet e Njoftimeve
        </CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">
          Klikoni një ton për ta dëgjuar dhe zgjedhur — ruhet në këtë pajisje
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">🎫 Rezervim i ri</div>
          <ChimePicker
            value={bookingId}
            onPick={id => { setBookingId(id); setBookingChimeId(id); playBookingChime(id); }}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium text-gray-700">📧 Njoftim nga email-i</div>
            <p className="text-xs text-gray-400 mt-0.5">Zile + njoftim kur vjen email "NEW BOOKING" në inbox</p>
          </div>
          <Switch checked={emailOn} onCheckedChange={v => { setEmailOn(v); setEmailNotifyEnabled(v); }} />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">✈️ Njoftim fluturimi</div>
          <ChimePicker
            value={flightId}
            onPick={id => { setFlightId(id); setFlightChimeId(id); playFlightAlertChime(id); }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

type PokAccountRow = {
  id: number;
  label: string;
  merchantIdMasked: string;
  keyIdMasked: string;
  active: boolean;
  disabledAt: string | null;
  secretConfigured: boolean;
};

function PokAccountsCard() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<PokAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/settings/pok-accounts`, { credentials: "include" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Nuk u ngarkuan llogaritë POK");
      setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    } catch (e: any) {
      setError(e?.message || "Nuk u ngarkuan llogaritë POK");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setLabel("");
    setMerchantId("");
    setKeyId("");
    setKeySecret("");
    setFormOpen(true);
  };
  const openEdit = (account: PokAccountRow) => {
    setEditing(account.id);
    setLabel(account.label);
    // Credentials intentionally remain blank: masked values are never copied
    // into editable fields, and an omitted field preserves the stored secret.
    setMerchantId("");
    setKeyId("");
    setKeySecret("");
    setFormOpen(true);
  };
  const save = async () => {
    if (!label.trim() || (!editing && (!merchantId.trim() || !keyId.trim() || !keySecret))) {
      toast({ title: editing ? "Vendosni emrin e llogarisë" : "Plotësoni të gjitha fushat", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = { label: label.trim() };
      if (merchantId.trim()) body.merchantId = merchantId.trim();
      if (keyId.trim()) body.keyId = keyId.trim();
      if (keySecret) body.keySecret = keySecret;
      const response = await fetch(
        `${API_BASE}/settings/pok-accounts${editing ? `/${editing}` : ""}`,
        { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Gabim gjatë ruajtjes");
      setFormOpen(false);
      setKeySecret("");
      toast({ title: editing ? "Llogaria POK u përditësua" : "Llogaria POK u shtua" });
      await load();
    } catch (e: any) {
      toast({ title: e?.message || "Gabim gjatë ruajtjes", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const changeState = async (account: PokAccountRow, action: "activate" | "disable") => {
    const ok = await confirmDangerDialog({
      title: action === "activate" ? "Aktivizo llogarinë POK" : "Çaktivizo llogarinë POK",
      text: action === "activate"
        ? `Llogaria "${account.label}" do të përdoret për pagesat e reja. Porositë ekzistuese nuk ndryshojnë.`
        : `Je i sigurt që do të çaktivizosh "${account.label}"?`,
      confirmText: action === "activate" ? "Aktivizo" : "Çaktivizo",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/settings/pok-accounts/${account.id}/${action}`, { method: "POST", credentials: "include" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Veprimi dështoi");
      toast({ title: action === "activate" ? "Llogaria u aktivizua" : "Llogaria u çaktivizua" });
      await load();
    } catch (e: any) {
      toast({ title: e?.message || "Veprimi dështoi", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          Pagesat me Kartë
        </CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">
          Menaxhoni llogaritë e POK Pay. Vetëm një llogari është aktive për porositë e reja.
        </p>
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
          Kredencialet ruhen të enkriptuara me SESSION_SECRET. Mos e ndryshoni këtë sekret në server; ndryshimi e bën të pamundur deshifrimin e kredencialeve ekzistuese.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{error}</span><Button size="sm" variant="outline" onClick={() => void load()}>Provo përsëri</Button>
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-gray-500">Nuk ka llogari POK të konfiguruara.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map(account => (
              <div key={account.id} className={cn("rounded-lg border p-3 flex items-center gap-3", account.active ? "border-emerald-300 bg-emerald-50/40" : "bg-gray-50")}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{account.label}</span>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", account.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500")}>
                      {account.active ? "AKTIVE" : "JOAKTIVE"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 font-mono">
                    Merchant: {account.merchantIdMasked} · Key: {account.keyIdMasked} · Secret: ••••••••
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!account.active && <Button size="sm" variant="outline" disabled={saving} onClick={() => void changeState(account, "activate")}>Aktivizo</Button>}
                  {account.active && <span className="text-xs text-emerald-700 px-2 py-1">Aktive (aktivizo një tjetër për ta ndërruar)</span>}
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => openEdit(account)} aria-label="Ndrysho llogarinë"><Pencil className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {formOpen && (
          <div className="rounded-xl border border-primary/20 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{editing ? "Ndrysho llogarinë" : "Shto llogari"}</h3>
              <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium text-gray-600">Emri / etiketa</label><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="POK Kryesor" /></div>
              <div className="space-y-1"><label className="text-xs font-medium text-gray-600">Merchant ID</label><Input value={merchantId} onChange={e => setMerchantId(e.target.value)} placeholder={editing ? "•••• (lire për ta ruajtur)" : "Merchant ID"} autoComplete="off" /></div>
              <div className="space-y-1"><label className="text-xs font-medium text-gray-600">Key ID</label><Input value={keyId} onChange={e => setKeyId(e.target.value)} placeholder={editing ? "•••• (lëre bosh për ta ruajtur)" : "Key ID"} autoComplete="off" /></div>
              <div className="space-y-1"><label className="text-xs font-medium text-gray-600">Key Secret</label><Input type="password" value={keySecret} onChange={e => setKeySecret(e.target.value)} placeholder={editing ? "Lëre bosh për ta ruajtur sekretin" : "Key Secret"} autoComplete="new-password" /></div>
            </div>
            {editing && <p className="text-[11px] text-gray-500">Për siguri, kredencialet nuk shfaqen kurrë. Fushat bosh nuk ndryshojnë vlerat ekzistuese.</p>}
            <div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Anulo</Button><Button onClick={() => void save()} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Ruaj</Button></div>
          </div>
        )}
        {!formOpen && <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Shto llogari</Button>}
      </CardContent>
    </Card>
  );
}

function PokLinkPolicyCard() {
  const { toast } = useToast();
  const [createNewLinkEachAttempt, setCreateNewLinkEachAttempt] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/settings/pok-link-policy`, { credentials: "include" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Nuk u ngarkua politika e linkut POK");
      if (typeof data?.createNewLinkEachAttempt !== "boolean") throw new Error("Përgjigje e pavlefshme për politikën e linkut POK");
      setCreateNewLinkEachAttempt(data.createNewLinkEachAttempt);
    } catch (cause) {
      setCreateNewLinkEachAttempt(null);
      setError(cause instanceof Error ? cause.message : "Nuk u ngarkua politika e linkut POK");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const changePolicy = async (next: boolean) => {
    if (loading || saving || confirming || createNewLinkEachAttempt === null) return;
    if (next) {
      setConfirming(true);
      let confirmed = false;
      try {
        confirmed = await confirmDangerDialog({
          title: "Krijo link të ri për çdo tentativë?",
          text: "Linket e mëparshme mbeten të pagueshme edhe pas krijimit të linkut të ri. Klienti mund të paguajë më shumë se një herë. Kontrolloni pagesat e dyfishta në POK dhe bëni rikonsiliim për rezultatet e panjohura. Vetëm pagesat e verifikuara në POK regjistrohen në sistem.",
          confirmText: "Po, aktivizo",
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Konfirmimi dështoi");
        return;
      } finally {
        setConfirming(false);
      }
      if (!confirmed) return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/settings/pok-link-policy`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ createNewLinkEachAttempt: next }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Politika e linkut POK nuk u ruajt");
      if (typeof data?.createNewLinkEachAttempt !== "boolean") throw new Error("Përgjigje e pavlefshme për politikën e linkut POK; rifreskoni gjendjen");
      setCreateNewLinkEachAttempt(data.createNewLinkEachAttempt);
      toast({ title: data.createNewLinkEachAttempt ? "Linku i ri për çdo tentativë u aktivizua" : "Linku i ri për çdo tentativë u çaktivizua" });
    } catch (cause) {
      // The server may have committed despite a network error; require a fresh GET before another change.
      setCreateNewLinkEachAttempt(null);
      setError(cause instanceof Error ? cause.message : "Politika e linkut POK nuk u ruajt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="card-pok-link-policy">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Politika e linkut POK</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">Kur është fikur, përdoret linku ekzistues për tentativat e pagesës.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="pok-link-policy-switch" className="text-sm font-medium text-gray-700">Krijo link të ri në çdo tentativë pagese</label>
          <Switch
            id="pok-link-policy-switch"
            data-testid="switch-pok-link-policy"
            checked={createNewLinkEachAttempt === true}
            disabled={loading || saving || confirming || createNewLinkEachAttempt === null}
            onCheckedChange={next => void changePolicy(next)}
          />
        </div>
        <p className="text-xs text-amber-700">Kur aktivizohet, linket e mëparshme mbeten të pagueshme — ka rrezik pagese të dyfishtë. Rezultatet e panjohura kërkojnë rikonsiliim; vetëm pagesat e verifikuara në POK regjistrohen.</p>
        {loading && <p role="status" data-testid="status-pok-link-policy-loading" className="text-sm text-gray-500">Duke ngarkuar politikën POK…</p>}
        {saving && <p role="status" data-testid="status-pok-link-policy-saving" className="text-sm text-gray-500">Duke ruajtur politikën POK…</p>}
        {error && <div role="alert" data-testid="status-pok-link-policy-error" className="text-sm text-red-700 flex items-center gap-3">{error}<Button size="sm" variant="outline" data-testid="button-retry-pok-link-policy" disabled={loading || saving} onClick={() => void load()}>Provo përsëri</Button></div>}
      </CardContent>
    </Card>
  );
}

type PokReconciliationIntent = {
  id: number;
  bookingRef: string;
  accountLabel: string;
  amount: number;
  status: "creating" | "unknown" | string;
  providerOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  notificationClosedAt: string | null;
};

function PokReconciliationCard() {
  const { toast } = useToast();
  const [intents, setIntents] = useState<PokReconciliationIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<number | null>(null);
  const [view, setView] = useState<"active" | "closed">("active");
  const activeIntents = intents.filter(intent => !intent.notificationClosedAt);
  const closedIntents = intents.filter(intent => !!intent.notificationClosedAt);
  const visibleIntents = view === "active" ? activeIntents : closedIntents;
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/settings/pok-reconciliation`, { credentials: "include" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Nuk u ngarkuan intentet POK");
      setIntents(Array.isArray(data?.intents) ? data.intents : []);
    } catch (e: any) {
      toast({ title: e?.message || "Nuk u ngarkuan intentet POK", variant: "destructive" });
    } finally { setLoading(false); }
  };
  useEffect(() => {
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const closeNotification = async (intent: PokReconciliationIntent) => {
    setWorking(intent.id);
    try {
      const response = await fetch(`${API_BASE}/settings/pok-reconciliation/${intent.id}/close`, {
        method: "POST", credentials: "include",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Njoftimi nuk u mbyll");
      toast({ title: "Njoftimi u zhvendos te Të mbyllura" });
      await load();
    } catch (e: any) {
      toast({ title: e?.message || "Njoftimi nuk u mbyll", variant: "destructive" });
    } finally { setWorking(null); }
  };
  const recheck = async (intent: PokReconciliationIntent) => {
    const providerOrderId = intent.providerOrderId || window.prompt("Vendosni providerOrderId nga dashboard-i i POK (nuk krijohet porosi e re):")?.trim();
    if (!providerOrderId) return;
    setWorking(intent.id);
    try {
      const response = await fetch(`${API_BASE}/settings/pok-reconciliation/${intent.id}/recheck`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ providerOrderId }),
      });
      const data = await response.json().catch(() => null);
      const needsReview = data?.code === "POK_REVIEW_REQUIRED" || data?.result?.code === "POK_REVIEW_REQUIRED" || data?.status === "review_required";
      if (!response.ok && !needsReview) throw new Error(data?.error || "Rikontrolli dështoi");
      toast({ title: needsReview ? "Pagesa kërkon shqyrtim — mos e regjistroni përsëri" : data?.status === "paid" ? "Pagesa u regjistrua" : "Porosia u rikontrollua", variant: response.ok ? "default" : "destructive" });
      await load();
    } catch (e: any) { toast({ title: e?.message || "Rikontrolli dështoi", variant: "destructive" }); }
    finally { setWorking(null); }
  };
  const markFailed = async (intent: PokReconciliationIntent) => {
    const ok = await confirmDangerDialog({
      title: "Shëno intentin si të dështuar",
      text: `Kontrolloni dashboard-in e POK për ${intent.bookingRef}. Një porosi e hapur/pagueshme nuk mund të shënohet si e dështuar dhe nuk lejon riprovim. Vazhdoni vetëm pasi POK të konfirmojë failed, cancelled ose expired (not-found kërkon rikontroll cancellation/expiry).`,
      confirmText: "E kontrollova — shëno të dështuar",
    });
    if (!ok) return;
    const terminalStatus = window.prompt("Vendosni statusin terminal të konfirmuar nga POK (failed, cancelled, expired ose not-found):")?.trim().toLowerCase();
    if (!terminalStatus || !["failed", "cancelled", "expired", "not-found"].includes(terminalStatus)) {
      toast({ title: "Kërkohet status terminal i konfirmuar nga POK", variant: "destructive" });
      return;
    }
    setWorking(intent.id);
    try {
      const response = await fetch(`${API_BASE}/settings/pok-reconciliation/${intent.id}/fail`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ confirm: true, dashboardChecked: true, dashboardRechecked: true, terminalStatus }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Veprimi dështoi");
      toast({ title: "Intenti u shënua si i dështuar" });
      await load();
    } catch (e: any) { toast({ title: e?.message || "Veprimi dështoi", variant: "destructive" }); }
    finally { setWorking(null); }
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-amber-600" /> Rikonsiliimi i Pagesave me Kartë</CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">Intentet creating/unknown nuk riprovohen automatikisht. Kontrolloni POK dhe përdorni rikontrollin vetëm për orderId të njohur.</p>
        <p className="text-xs text-gray-500">Mbyllja heq vetëm njoftimin nga lista aktive. Pagesa dhe linku i saj mbeten të pandryshuara.</p>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4" role="group" aria-label="Lista e njoftimeve POK">
          <Button size="sm" variant={view === "active" ? "default" : "outline"} aria-pressed={view === "active"} onClick={() => setView("active")}>Aktive ({activeIntents.length})</Button>
          <Button size="sm" variant={view === "closed" ? "default" : "outline"} aria-pressed={view === "closed"} onClick={() => setView("closed")}>Të mbyllura ({closedIntents.length})</Button>
        </div>
        {loading ? <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div> :
          visibleIntents.length === 0 ? <p className="text-sm text-gray-500">{view === "closed" ? "Nuk ka njoftime të mbyllura." : "Nuk ka intentë për rikonsiliim."}</p> :
            <div className="space-y-2">{visibleIntents.map(intent => (
              <div key={intent.id} className="border rounded-lg p-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center flex-wrap"><span className="font-semibold text-sm">{intent.bookingRef}</span><span data-testid={`status-pok-intent-${intent.id}`} className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">{intent.status === "review_required" ? "Kërkon shqyrtim" : intent.status === "superseded" ? "Link i mëparshëm — mund të paguhet" : intent.status}</span></div>
                  <div className="text-xs text-gray-500 mt-1">€{fmtM(intent.amount)} · {intent.accountLabel} · {new Date(intent.createdAt).toLocaleString()}</div>
                  <div className="text-[11px] text-gray-400 font-mono mt-1">{intent.providerOrderId ? `orderId: ${intent.providerOrderId}` : "orderId: i panjohur — kërkon kontroll manual"}</div>
                  {intent.notificationClosedAt && <div className="text-xs text-gray-500 mt-1">Mbyllur më {new Date(intent.notificationClosedAt).toLocaleString()}</div>}
                </div>
                {view === "active" && <div className="flex gap-1 flex-wrap shrink-0"><Button size="sm" variant="outline" disabled={working !== null} onClick={() => void recheck(intent)}>Rikontrollo</Button>{intent.status !== "review_required" && <Button size="sm" variant="outline" disabled={working !== null} onClick={() => void markFailed(intent)}>Shëno dështim</Button>}<Button size="sm" variant="outline" disabled={working !== null} onClick={() => void closeNotification(intent)}>Mbyll njoftimin</Button></div>}
              </div>
            ))}</div>}
      </CardContent>
    </Card>
  );
}
