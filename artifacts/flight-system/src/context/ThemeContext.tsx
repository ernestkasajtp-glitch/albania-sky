import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";

export interface AppTheme {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  sidebarBg: string;
  accentColor: string;
  accentBg: string;
  accentText: string;
  indicatorColor: string;
  avatarFrom: string;
  avatarTo: string;
  mainBg: string;
  preview: string[];
  lightSidebar?: boolean;
  /** Optional HSL triplet (p.sh. "220 13% 74%") që mbivendos --border për ndarje më të dukshme. */
  borderHsl?: string;
  /** Kur true, faqet Rezervimet / Krijimi / Detajet përdorin layout-in premium. */
  premiumLayout?: boolean;
  /** Variant i dedikuar vetëm për faqen Krijo Rezervim. */
  bookingNewLayout?: "neoGlass";
  /** Aplikon një paletë të errët në të gjithë Flight System. */
  systemDark?: boolean;
}

export const THEMES: Record<string, AppTheme> = {
  navyGold: {
    id: "navyGold", name: "Blu & Ar", nameEn: "Navy & Gold",
    description: "Panel blu · Përzgjedhje ari · Ikona premium",
    sidebarBg: "#112343", accentColor: "#64748b",
    accentBg: "#e6c27c", accentText: "#252c38", indicatorColor: "#b28b37",
    avatarFrom: "#94a3b8", avatarTo: "#64748b", mainBg: "#f1f2f4",
    preview: ["#112343", "#f3d185", "#d8b26f"],
    borderHsl: "215 16% 72%", premiumLayout: true,
  },
  graphite: {
    id: "graphite",
    name: "Gri Klasik",
    nameEn: "Classic Gray",
    description: "Gri · I qetë · Ndarje të dukshme",
    sidebarBg: "#e9ebee",
    accentColor: "#64748b",
    accentBg: "rgba(100,116,139,0.14)",
    accentText: "#334155",
    indicatorColor: "#64748b",
    avatarFrom: "#94a3b8",
    avatarTo: "#64748b",
    mainBg: "#f1f2f4",
    preview: ["#e9ebee", "#64748b", "#94a3b8"],
    borderHsl: "215 16% 72%",
    lightSidebar: true,
    premiumLayout: true,
  },
};

const STORAGE_KEY = "fms_theme";
const BASE_STORAGE_KEY = "fms_navy_gold_base";

interface ThemeContextValue {
  theme: AppTheme;
  themeId: string;
  setTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES.graphite,
  themeId: "graphite",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // This skin changes only navigation and stat icons, not the selected page layouts.
  const [baseThemeId, setBaseThemeId] = useState(() => {
    const saved = localStorage.getItem(BASE_STORAGE_KEY);
    return saved && saved !== "navyGold" && THEMES[saved] ? saved : "graphite";
  });
  const [themeId, setThemeId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && THEMES[saved] ? saved : "graphite";
  });

  const setTheme = (id: string) => {
    if (!THEMES[id]) return;
    if (id === "navyGold" && themeId !== "navyGold") {
      setBaseThemeId(themeId);
      localStorage.setItem(BASE_STORAGE_KEY, themeId);
    }
    setThemeId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const theme = useMemo(() => themeId === "navyGold" ? {
    ...THEMES[baseThemeId],
    id: "navyGold", name: THEMES.navyGold.name, nameEn: THEMES.navyGold.nameEn,
    sidebarBg: "#112343", lightSidebar: false,
    accentBg: "#e6c27c", accentText: "#252c38", indicatorColor: "#b28b37",
  } : THEMES[themeId] ?? THEMES.graphite, [themeId, baseThemeId]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", !!theme.systemDark);
    document.documentElement.classList.toggle("theme-system-dark", !!theme.systemDark);
    document.documentElement.style.setProperty("--theme-accent", theme.accentColor);
    document.documentElement.style.setProperty("--theme-sidebar-bg", theme.sidebarBg);
    document.documentElement.style.setProperty("--theme-main-bg", theme.mainBg);
    if (theme.borderHsl) {
      document.documentElement.style.setProperty("--border", theme.borderHsl);
      document.documentElement.style.setProperty("--input", theme.borderHsl);
    } else {
      document.documentElement.style.removeProperty("--border");
      document.documentElement.style.removeProperty("--input");
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, themeId, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
