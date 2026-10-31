import { i18n } from "./_local";

// Locale-aware date label data. The Albanian set matches the original hardcoded
// arrays exactly so the Albanian view is unchanged; English mirrors it.

const MONTHS_LONG: Record<"sq" | "en", string[]> = {
  sq: ["Janar", "Shkurt", "Mars", "Prill", "Maj", "Qershor", "Korrik", "Gusht", "Shtator", "Tetor", "Nëntor", "Dhjetor"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

// Monday-first (calendar weekday headers)
const WEEK_MON: Record<"sq" | "en", string[]> = {
  sq: ["Hën", "Mar", "Mër", "Enj", "Pre", "Sht", "Die"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

// Sunday-first, indexed by Date.getDay() (0 = Sunday)
const DAY_SHORT_SUN: Record<"sq" | "en", string[]> = {
  sq: ["Die", "Hën", "Mar", "Mër", "Enj", "Pre", "Sht"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

function lang(): "sq" | "en" {
  return i18n.language === "en" ? "en" : "sq";
}

export const monthsLong = (): string[] => MONTHS_LONG[lang()];
export const weekHeadersMon = (): string[] => WEEK_MON[lang()];
export const dayShort = (jsDay: number): string => DAY_SHORT_SUN[lang()][jsDay];
