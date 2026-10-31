import { useEffect, useState } from "react";

export type PaymentMethodOption = {
  id: number;
  name: string;
  color: string;
  active: boolean;
  sortOrder: number;
};

let cache: PaymentMethodOption[] | null = null;
const listeners = new Set<(v: PaymentMethodOption[]) => void>();
let inflight: Promise<void> | null = null;

async function load() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/payment-methods", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        cache = data.filter((m: PaymentMethodOption) => m.active);
        listeners.forEach(l => l(cache!));
      }
    } catch { /* silent */ }
    finally { inflight = null; }
  })();
  return inflight;
}

export function refreshPaymentMethods() {
  cache = null;
  load();
}

export function usePaymentMethods(): PaymentMethodOption[] {
  const [methods, setMethods] = useState<PaymentMethodOption[]>(cache ?? []);

  useEffect(() => {
    listeners.add(setMethods);
    if (cache) setMethods(cache);
    else load();
    return () => { listeners.delete(setMethods); };
  }, []);

  return methods;
}
