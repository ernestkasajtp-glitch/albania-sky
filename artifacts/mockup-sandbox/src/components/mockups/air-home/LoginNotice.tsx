import { type MouseEvent } from "react";
import Home from "./_LoginHome";
import { Navbar } from "./_Navbar";
import { language } from "./_local";
import "./_sky.css";
import "./_login-notice.css";

function initializeLanguage() {
  const url = new URL(window.location.href);
  let preferred: string | null = null;
  try { preferred = window.sessionStorage.getItem("ah-sky-language"); } catch { /* Storage is optional. */ }
  if (!url.searchParams.has("lang") && preferred !== "sq") {
    url.searchParams.set("lang", "en");
    window.history.replaceState(window.history.state, "", url.toString());
  }
}

function rememberLanguage(event: MouseEvent<HTMLDivElement>) {
  const target = event.target instanceof Element ? event.target.closest("button") : null;
  if (!target?.hasAttribute("aria-pressed")) return;
  const choice = target.textContent?.trim().toLowerCase();
  if (choice !== "sq" && choice !== "en") return;
  try { window.sessionStorage.setItem("ah-sky-language", choice); } catch { /* URL selection still works. */ }
}

export default function LoginNotice() {
  initializeLanguage();
  return (
    <div className="ah-home ah-proposed ah-sky ah-login-notice" lang={language()} onClickCapture={rememberLanguage}>
      <Navbar />
      <Home />
    </div>
  );
}
