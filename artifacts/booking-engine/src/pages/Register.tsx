import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Plane, Loader2, User, Building2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Register() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const redirect = params.get("redirect")
    || (typeof window !== "undefined" ? localStorage.getItem("bookflight_redirect") : null)
    || "/";

  const [role, setRole] = useState<"client" | "agent">(() => params.get("role") === "agent" ? "agent" : "client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError(t("Fjalëkalimi duhet të ketë të paktën 6 karaktere")); return; }
    setLoading(true);
    try {
      await register({ name, email, password, company, phone, role });
      localStorage.removeItem("bookflight_redirect");
      setLocation(redirect);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all";

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-5/12 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0b1f3a 0%, #0f3460 50%, #1a5276 100%)" }}>
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }} />
        <div className="relative flex flex-col justify-center px-12 py-20">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
              <Plane className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-lg tracking-wide">ALBANIA</div>
              <div className="text-amber-400 text-[10px] font-semibold tracking-[0.2em] uppercase">Sky</div>
            </div>
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            {t("Bashkohu")}<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg, #f59e0b, #fbbf24)" }}>
              {t("Me Ne")}
            </span>
          </h2>
          <p className="text-blue-200/70 leading-relaxed max-w-xs">
            {t("Krijo një llogari falas dhe fillo të rezervosh fluturime me çmimet tona ekskluzive.")}
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 bg-slate-50 overflow-y-auto">
        <div className="w-full max-w-md">
          <button onClick={() => setLocation(redirect && redirect !== "/" ? `/login?redirect=${encodeURIComponent(redirect)}` : "/")} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-sm mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4" /> {t("Kthehu")}
          </button>

          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{t("Krijo llogarinë tënde")}</h1>
            <p className="text-gray-500 text-sm">{t("Falas dhe shpejt — gati në sekonda")}</p>
          </div>

          {/* Role tabs */}
          <div className="flex rounded-xl border border-gray-200 bg-white p-1 mb-5 shadow-sm">
            <button type="button" onClick={() => setRole("client")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${role === "client" ? "text-white shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
              style={role === "client" ? { background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" } : {}}>
              <User className="h-4 w-4" /> {t("Udhëtar")}
            </button>
            <button type="button" onClick={() => setRole("agent")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${role === "agent" ? "text-white shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
              style={role === "agent" ? { background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" } : {}}>
              <Building2 className="h-4 w-4" /> {t("Agjent Udhëtimi")}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-7 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {role === "agent" ? t("Emri i Agjencisë *") : t("Emri i Plotë *")}
                  </label>
                  <input required value={name} onChange={e => setName(e.target.value)} className={inputCls}
                    placeholder={role === "agent" ? t("Emri i agjencisë suaj") : t("Emri Mbiemri")} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email *</label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="name@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t("Fjalëkalimi")} *</label>
                  <div className="relative">
                    <input required type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} pr-11`} placeholder={t("Minimum 6 karaktere")} />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t("Telefoni")}</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="+355 69 XXX XXXX" />
                </div>
                {role === "agent" && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">NIPT <span className="text-red-500">*</span></label>
                    <input required value={company} onChange={e => setCompany(e.target.value)} className={inputCls} placeholder="e.g. L91234567A" />
                  </div>
                )}
              </div>

              <div data-testid="registration-approval-notice" className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 leading-relaxed">
                {t("Llogaria aktivizohet vetëm pasi administratori miraton regjistrimin dhe cakton grupin. Deri atëherë nuk mund të kërkoni ose rezervoni fluturime.")}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-sm text-red-700">⚠ {error}</div>
              )}

              <button type="submit" disabled={loading}
                className="w-full font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)", color: "white" }}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? t("Duke krijuar llogarinë...") : t("Krijo Llogarinë")}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-gray-500 mt-5">
            {t("Ke tashmë një llogari?")}{" "}
            <Link href={redirect && redirect !== "/" ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login"} className="text-blue-600 font-semibold hover:underline">{t("Hyr këtu")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
