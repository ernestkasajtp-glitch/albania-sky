import { Link, useLocation, useAuth, useTranslation, setLanguage } from "./_local";
import { User, LogOut, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

function LangSwitch() {
  const { i18n } = useTranslation();
  const cur = i18n.language === "en" ? "en" : "sq";
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-white/20 bg-white/5 p-0.5">
      {(["sq", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLanguage(l)}
          aria-pressed={cur === l}
          className={`px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide transition-colors ${
            cur === l ? "bg-amber-500 text-white shadow-sm" : "text-white/60 hover:text-white"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Navbar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const isHome = location === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const navBase = isHome && !scrolled
    ? "absolute top-0 left-0 right-0 z-50 bg-transparent"
    : "fixed top-0 left-0 right-0 z-50 bg-[#0b1f3a]/95 backdrop-blur-md shadow-lg";

  return (
    <>
      <nav className={`${navBase} transition-all duration-300`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center group">
            <img
              src="/__mockup/images/air-home/albania-sky-logo.png"
              alt="Albania Sky"
              className="h-12 w-auto object-contain group-hover:scale-105 transition-transform"
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/flights" className="text-white/80 hover:text-white text-sm font-medium transition-colors tracking-wide">
              {t("Fluturime")}
            </Link>
            {user && (
              <Link href="/my-bookings" className="text-white/80 hover:text-white text-sm font-medium transition-colors tracking-wide">
                {t("Rezervimet e Mia")}
              </Link>
            )}
          </div>

          {/* Auth */}
          <div className="hidden md:flex items-center gap-3">
            <LangSwitch />
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-white/90 text-sm">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
                    <User className="h-4 w-4 text-amber-400" />
                  </div>
                  <span className="font-medium">{user.name}</span>
                  {user.role === "agent" && (
                    <span className="bg-amber-400 text-amber-950 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">{t("Agjent")}</span>
                  )}
                </div>
                <button onClick={handleLogout}
                  className="flex items-center gap-1.5 text-white/60 hover:text-white/90 text-sm transition-colors">
                  <LogOut className="h-3.5 w-3.5" />
                  {t("Dil")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
                  {t("Hyr")}
                </Link>
                <Link href="/register"
                  className="bg-amber-500 hover:bg-amber-400 text-white font-semibold text-sm px-5 py-2 rounded-full transition-all shadow-md hover:shadow-amber-500/25 hover:-translate-y-0.5">
                  {t("Regjistrohu")}
                </Link>
              </div>
            )}
          </div>

          {/* Mobile toggle */}
          <div className="md:hidden flex items-center gap-2">
            <LangSwitch />
            <button className="text-white p-1" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-[#0b1f3a] border-t border-white/10 px-6 py-4 space-y-3">
            <Link href="/flights" className="block text-white/80 hover:text-white py-2 text-sm font-medium" onClick={() => setMenuOpen(false)}>
              {t("Fluturime")}
            </Link>
            {user ? (
              <>
                <Link href="/my-bookings" className="block text-white/80 hover:text-white py-2 text-sm font-medium" onClick={() => setMenuOpen(false)}>
                  {t("Rezervimet e Mia")}
                </Link>
                <button onClick={handleLogout} className="block text-white/60 hover:text-white py-2 text-sm w-full text-left">
                  {t("Dil")} ({user.name})
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="block text-white/80 hover:text-white py-2 text-sm" onClick={() => setMenuOpen(false)}>{t("Hyr")}</Link>
                <Link href="/register" className="inline-block bg-amber-500 text-white font-semibold text-sm px-5 py-2 rounded-full mt-1" onClick={() => setMenuOpen(false)}>{t("Regjistrohu")}</Link>
              </>
            )}
          </div>
        )}
      </nav>
      {/* Spacer for non-home pages */}
      {!isHome && <div className="h-[73px]" />}
    </>
  );
}
