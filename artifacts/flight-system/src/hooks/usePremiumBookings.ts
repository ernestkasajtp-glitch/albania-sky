import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PremiumBookingListInput } from "@workspace/api-client-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
export const EMPTY_PREMIUM = {
  items: [] as any[], page: 1, totalPages: 1, matchingCount: 0, totalCount: 0, filteredCount: 0,
  statusCounts: {} as Record<string, number>, emailTicketCounts: { withEmail: 0, withoutEmail: 0 },
  alertCount: 0, unsentTicketCount: 0, filteredUnpaid: 0,
  stats: { periodCount: 0, periodSales: 0, periodProfit: 0, periodPax: 0 },
};
export type PremiumResponse = typeof EMPTY_PREMIUM;
export async function fetchPremiumBookings(input: PremiumBookingListInput, signal?: AbortSignal): Promise<PremiumResponse> {
  const response = await fetch(`${API_BASE}/booking-list/query`, {
    method: "POST", credentials: "include", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Nuk u ngarkuan rezervimet.");
  }
  return response.json();
}
export function usePremiumBookings(input: PremiumBookingListInput, userId?: number) {
  const textKey = JSON.stringify([input.search, input.pnrSearch, input.flightSearch]);
  const [settledText, setSettledText] = useState(textKey);
  useEffect(() => {
    const timer = setTimeout(() => setSettledText(textKey), 300);
    return () => clearTimeout(timer);
  }, [textKey]);
  const waiting = settledText !== textKey;
  const result = useQuery({
    queryKey: ["/api/bookings/premium-list", userId, input],
    queryFn: ({ signal }) => fetchPremiumBookings(input, signal),
    enabled: !!userId && !waiting,
    // Keep previously visited pages available during navigation; still refresh
    // on every mount and every SSE invalidation (no financial freshness delay).
    staleTime: 0, gcTime: 10 * 60_000, retry: 1,
  });
  return { ...result, isLoading: result.isLoading || waiting, input };
}