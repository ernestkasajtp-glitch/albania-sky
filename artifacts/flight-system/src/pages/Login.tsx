import { useState, useEffect } from "react";
import { Plane, Eye, EyeOff, Loader2, ShieldCheck, LockKeyhole } from "lucide-react";
import { BlockedFmsIpError, useAdminAuth } from "@/context/AdminAuthContext";
import { loadBranding, type BrandingSummary } from "@/lib/branding";

export default function Login() {
  const { login, setup, requestBlockedAccess, verifyBlockedAccess, hasAdmin } = useAdminAuth();
  const isSetup = hasAdmin === false;

  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [blocked, setBlocked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessExpiresAt, setAccessExpiresAt] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [branding, setBranding] = useState<BrandingSummary | null>(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  useEffect(() => {
    loadBranding()
      .then(data => { if (data) setBranding(data); setBrandingLoaded(true); })
      .catch(() => { setBrandingLoaded(true); });
  }, []);

  useEffect(() => {
    if (!accessExpiresAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [accessExpiresAt]);

  const secondsLeft = accessExpiresAt
    ? Math.max(0, Math.ceil((new Date(accessExpiresAt).getTime() - clock) / 1000))
    : 0;

  const siteName = brandingLoaded ? (branding?.siteName || "FMS Pro") : "";
  const tagline  = brandingLoaded ? (branding?.tagline  || "Kings Travel · Panel i Administrimit") : "";
  const logoB64  = branding?.logoUrl;
  const bgB64    = branding?.backgroundUrl;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password || (isSetup && !name)) { setError("Plotësoni të gjitha fushat."); return; }
    setLoading(true);
    try {
      if (isSetup) await setup(email, password, name);
      else await login(email, password);
    } catch (err: any) {
      if (err instanceof BlockedFmsIpError) setBlocked(true);
      setError(err.message || "Gabim gjatë hyrjes");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async () => {
    setError("");
    if (!email || !password) { setError("Shkruaj emailin dhe fjalëkalimin."); return; }
    setLoading(true);
    try {
      const expiresAt = await requestBlockedAccess(email, password);
      setAccessCode("");
      setAccessExpiresAt(expiresAt);
      setClock(Date.now());
    } catch (err: any) {
      setError(err.message || "Kodi nuk u dërgua.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{8}$/.test(accessCode)) { setError("Shkruaj kodin 8-shifror."); return; }
    setLoading(true);
    try {
      await verifyBlockedAccess(email, password, accessCode);
    } catch (err: any) {
      setError(err.message || "Verifikimi dështoi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{ background: bgB64 ? `url(${bgB64}) center/cover no-repeat` : "#0f172a" }}
    >
      {bgB64 && <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />}
      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {logoB64 ? (
            <img src={logoB64} alt={siteName} className="h-14 w-14 object-contain mb-4" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-blue-500 flex items-center justify-center mb-4 shadow-xl shadow-blue-500/30">
              <Plane className="h-8 w-8 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-white tracking-tight">{siteName}</h1>
          <p className="text-slate-400 text-sm mt-1">{tagline}</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
          {isSetup && (
            <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-5">
              <ShieldCheck className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-blue-300 text-sm font-semibold">Konfigurimi i parë</p>
                <p className="text-blue-400/80 text-xs mt-0.5">Krijoni llogarinë e administratorit për të filluar.</p>
              </div>
            </div>
          )}

          <h2 className="text-white font-semibold text-lg mb-5">
            {isSetup ? "Krijo llogarinë Admin" : "Hyni në sistem"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSetup && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Emri i plotë</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="p.sh. Ernest Kasaj"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@example.com"
                autoComplete="email"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Fjalëkalimi</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-3 py-2.5">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "Duke hyrë..." : isSetup ? "Krijo llogarinë" : "Hyr në sistem"}
            </button>
          </form>
          {!isSetup && blocked && (
            <div className="mt-5 border-t border-white/10 pt-5 space-y-3" role="region" aria-label="Kërko akses nga IP e bllokuar">
              <div className="flex items-start gap-2 text-slate-200">
                <LockKeyhole className="h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold">Kërko Akses</p>
                  <p className="text-xs text-slate-400 mt-1">IP-ja është e bllokuar. Pas kontrollit të fjalëkalimit, administratori merr një kod që vlen 60 sekonda.</p>
                </div>
              </div>
              {accessExpiresAt && secondsLeft > 0 && (
                <p className="text-sm text-amber-300" role="status">Kodi iu dërgua administratorit. Mbeten {secondsLeft} sekonda.</p>
              )}
              {accessExpiresAt && secondsLeft === 0 && (
                <p className="text-sm text-amber-300" role="status">Kodi ka skaduar. Kërko një kod të ri.</p>
              )}
              {secondsLeft > 0 && (
                <form onSubmit={handleVerifyAccess} className="space-y-2">
                  <label htmlFor="blocked-access-code" className="block text-xs text-slate-300">Kodi nga administratori</label>
                  <input id="blocked-access-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8}
                    value={accessCode} onChange={e => setAccessCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="8 shifra"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="submit" disabled={loading || accessCode.length !== 8}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold py-2.5 rounded-xl text-sm">
                    {loading ? "Duke verifikuar..." : "Verifiko dhe hyr"}
                  </button>
                </form>
              )}
              {secondsLeft === 0 && (
                <button type="button" onClick={handleRequestAccess} disabled={loading}
                  className="w-full border border-amber-400/50 text-amber-200 hover:bg-amber-400/10 disabled:opacity-50 font-semibold py-2.5 rounded-xl text-sm">
                  {loading ? "Duke dërguar kërkesën..." : accessExpiresAt ? "Kërko kod të ri" : "Kërko Akses"}
                </button>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          kings-travel.tours · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
