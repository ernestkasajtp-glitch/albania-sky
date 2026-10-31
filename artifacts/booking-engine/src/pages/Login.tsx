import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Plane, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const redirect = params.get("redirect")
    || (typeof window !== "undefined" ? localStorage.getItem("bookflight_redirect") : null)
    || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      localStorage.removeItem("bookflight_redirect");
      setLocation(redirect);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0b1f3a 0%, #0f3460 50%, #1a5276 100%)" }}>
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }} />
        <div className="relative flex flex-col justify-center px-14 py-20">
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
            {t("Mirë se")}<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg, #f59e0b, #fbbf24)" }}>
              {t("Erdhe")}
            </span>
          </h2>
          <p className="text-blue-200/70 leading-relaxed max-w-xs">
            {t("Hyr në llogarinë tënde dhe menaxho rezervimet, shiko historikun e udhëtimeve.")}
          </p>
          <div className="mt-12 space-y-4">
            {["Rezervim i shpejtë dhe i sigurt", "Çmimet më të mira të garantuara", "Mbështetje 24/7"].map(f => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                </div>
                <span className="text-blue-200/70 text-sm">{t(f)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-slate-50">
        <div className="w-full max-w-md">
          <button onClick={() => setLocation("/")} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-sm mb-8 transition-colors">
            <ArrowLeft className="h-4 w-4" /> {t("Kthehu")}
          </button>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{t("Hyr në llogarinë tënde")}</h1>
            <p className="text-gray-500">{t("Vendos kredencialet për të vazhduar")}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t("Fjalëkalimi")}</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-sm text-red-700 flex items-start gap-2">
                  <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg hover:shadow-blue-900/20 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)", color: "white" }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? t("Duke hyrë...") : t("Hyr")}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-gray-500 mt-6">
            {t("Nuk ke llogari?")}{" "}
            <Link href={redirect && redirect !== "/" ? `/register?redirect=${encodeURIComponent(redirect)}` : "/register"} className="text-blue-600 font-semibold hover:underline">{t("Regjistrohu falas")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
