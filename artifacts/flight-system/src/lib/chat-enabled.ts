import { useSyncExternalStore } from "react";

// A ruhet i aktivizuar chat-i i ekipit (butoni poshtë djathtas).
// PARAZGJEDHJE: i ÇAKTIVIZUAR — shfaqet vetëm nëse përdoruesi e aktivizon te Cilësimet.
// Ruhet në localStorage (per-shfletues), njësoj si tema.

const LS_KEY = "fms.chat.enabled";

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function getChatEnabled(): boolean {
  return getSnapshot();
}

export function setChatEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useChatEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
