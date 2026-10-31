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
  indigo: {
    id: "indigo",
    name: "Indigo Pro",
    nameEn: "Indigo Pro",
    description: "Modern · SaaS · B2B",
    sidebarBg: "#0a0f1e",
    accentColor: "#6366f1",
    accentBg: "rgba(99,102,241,0.13)",
    accentText: "#818cf8",
    indicatorColor: "#818cf8",
    avatarFrom: "#818cf8",
    avatarTo: "#a855f7",
    mainBg: "#f8fafc",
    preview: ["#0a0f1e", "#6366f1", "#818cf8"],
  },
  gold: {
    id: "gold",
    name: "Executive Gold",
    nameEn: "Executive Gold",
    description: "Luksoz · Premium · Airline",
    sidebarBg: "#0d0b07",
    accentColor: "#f59e0b",
    accentBg: "rgba(245,158,11,0.13)",
    accentText: "#fbbf24",
    indicatorColor: "#fbbf24",
    avatarFrom: "#fbbf24",
    avatarTo: "#f97316",
    mainBg: "#fafaf9",
    preview: ["#0d0b07", "#f59e0b", "#fbbf24"],
  },
  carbon: {
    id: "carbon",
    name: "Slate Carbon",
    nameEn: "Slate Carbon",
    description: "Minimal · Dark · Pro",
    sidebarBg: "#18181b",
    accentColor: "#0ea5e9",
    accentBg: "rgba(14,165,233,0.13)",
    accentText: "#38bdf8",
    indicatorColor: "#38bdf8",
    avatarFrom: "#38bdf8",
    avatarTo: "#6366f1",
    mainBg: "#f0f9ff",
    preview: ["#18181b", "#0ea5e9", "#38bdf8"],
  },
  sky: {
    id: "sky",
    name: "Sky Pearl",
    nameEn: "Sky Pearl",
    description: "E hapur · E qetë · Sy-miqësore",
    sidebarBg: "#eef3fa",
    accentColor: "#2563eb",
    accentBg: "rgba(37,99,235,0.09)",
    accentText: "#1d4ed8",
    indicatorColor: "#3b82f6",
    avatarFrom: "#60a5fa",
    avatarTo: "#38bdf8",
    mainBg: "#ffffff",
    preview: ["#eef3fa", "#2563eb", "#60a5fa"],
    lightSidebar: true,
  },
  premium: {
    id: "premium",
    name: "Premium",
    nameEn: "Premium",
    description: "Pamje e re · Rezervimet · Krijim",
    sidebarBg: "#eef3fa",
    accentColor: "#4f46e5",
    accentBg: "rgba(79,70,229,0.10)",
    accentText: "#4338ca",
    indicatorColor: "#6366f1",
    avatarFrom: "#8b5cf6",
    avatarTo: "#ec4899",
    mainBg: "#ffffff",
    preview: ["#eef3fa", "#4f46e5", "#a5b4fc"],
    lightSidebar: true,
    premiumLayout: true,
  },
  neoGlass: {
    id: "neoGlass",
    name: "Neo Glass",
    nameEn: "Neo Glass",
    description: "E errët · E pastër · Rezervim",
    sidebarBg: "#07111f",
    accentColor: "#22d3ee",
    accentBg: "rgba(34,211,238,0.12)",
    accentText: "#67e8f9",
    indicatorColor: "#22d3ee",
    avatarFrom: "#22d3ee",
    avatarTo: "#8b5cf6",
    mainBg: "#07111f",
    preview: ["#07111f", "#22d3ee", "#8b5cf6"],
    premiumLayout: true,
    bookingNewLayout: "neoGlass",
  },
  midnightOps: {
    id: "midnightOps",
    name: "Midnight Ops",
    nameEn: "Midnight Operations",
    description: "E errët · E plotë · Gjithë sistemi",
    sidebarBg: "#081426",
    accentColor: "#14b8ff",
    accentBg: "rgba(20,184,255,0.16)",
    accentText: "#67d8ff",
    indicatorColor: "#14b8ff",
    avatarFrom: "#14b8ff",
    avatarTo: "#6366f1",
    mainBg: "#07111f",
    preview: ["#081426", "#14b8ff", "#182c45"],
    premiumLayout: true,
    systemDark: true,
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
