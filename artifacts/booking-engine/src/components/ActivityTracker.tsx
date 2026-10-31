import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { safeActivityPath, setActivityTracking, trackActivity } from "@/lib/activity";

export function ActivityTracker() {
  const [location] = useLocation();
  const query = useSearch();
  const { user } = useAuth();
  useEffect(() => {
    setActivityTracking(!!user?.agentId);
    if (user?.agentId) trackActivity({ type: "pageview" });
    return () => setActivityTracking(false);
  }, [location, query, user?.agentId]);
  useEffect(() => {
    if (!user?.agentId) return;
    const click = (event: MouseEvent) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const el = event.target.closest<HTMLElement>("a, button, [role=button], input, select, textarea, [data-activity-press]");
      if (!el || el.closest("[data-private], [data-no-track]") || el.matches(":disabled")) return;
      if ((event.type === "pointerdown") !== el.hasAttribute("data-activity-press")) return;
      // Inputs log only their field identity, NEVER the entered value.
      const input = el.matches("input, textarea, select");
      if (el instanceof HTMLInputElement && el.type === "password") return;
      const fieldLabel = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : el.closest("label")?.textContent;
      const label = el.dataset.activityLabel || el.getAttribute("aria-label") || el.getAttribute("title") || (input ? fieldLabel : "") ||
        (input ? el.getAttribute("placeholder") || el.getAttribute("name") || "Fushë formulari" : el.textContent?.trim()) || "Buton pa etiketë";
      const anchor = el.closest("a");
      const target = anchor ? safeActivityPath(anchor.href) : "";
      trackActivity({ type: "click", label: label.replace(/\s+/g, " ").slice(0, 120), target });
    };
    const change = (event: Event) => {
      const el = event.target;
      if (!event.isTrusted || !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) ||
        el.closest("[data-private], [data-no-track]")) return;
      // No text/identity/payment values. Only discrete, non-personal filter controls.
      const label = el.dataset.activityLabel || el.getAttribute("aria-label") || el.getAttribute("name") || "";
      if (!/filter|sort|status|rendit|filt|pamj/i.test(label)) return;
      if (el instanceof HTMLSelectElement)
        trackActivity({ type: "click", label: `Ndryshoi ${label}: ${el.selectedOptions[0]?.textContent?.trim().slice(0, 50) || "bosh"}` });
      else if (el.type === "checkbox" || el.type === "radio")
        trackActivity({ type: "click", label: `Ndryshoi ${label}: ${el.checked ? "aktiv" : "joaktiv"}` });
    };
    document.addEventListener("click", click, true);
    document.addEventListener("pointerdown", click, true);
    document.addEventListener("change", change, true);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("pointerdown", click, true);
      document.removeEventListener("change", change, true);
    };
  }, [user?.agentId]);
  return null;
}