import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";

const STORAGE_KEY = "be_lang";

export type Lang = "sq" | "en";

function readStored(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "en" ? "en" : "sq";
  } catch {
    return "sq";
  }
}

i18n.use(initReactI18next).init({
  // Albanian is the source language: keys ARE the Albanian strings, so `sq`
  // intentionally has no resources and the raw key (Albanian) is returned.
  // `en` overrides with English; anything missing falls back to Albanian.
  resources: {
    sq: { translation: {} },
    en: { translation: en },
  },
  lng: readStored(),
  fallbackLng: "sq",
  keySeparator: false,
  nsSeparator: false,
  returnNull: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

export function setLanguage(lng: Lang) {
  i18n.changeLanguage(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore persistence errors */
  }
}

export default i18n;
