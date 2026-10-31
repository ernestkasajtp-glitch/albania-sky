export type PriceRetry = {
  identity: string;
  misses: number;
  checkedAt: number;
};
export const retryKey = (id: number) => `stalePriceRetry.${id}`;
export function readPriceRetry(value: string | null | undefined, identity: string): PriceRetry | null {
  try {
    const state = JSON.parse(value ?? "") as PriceRetry;
    return state.identity === identity && Number.isInteger(state.misses) &&
      state.misses >= 0 && state.misses <= 5 && Number.isFinite(state.checkedAt) ? state : null;
  } catch { return null; }
}
export function advancePriceRetry(previous: PriceRetry | null, identity: string,
  now: number, intervalMinutes: number, foundExactPrice: boolean): PriceRetry | null {
  if (foundExactPrice) return null;
  if (previous && now < previous.checkedAt + intervalMinutes * 60_000) return previous;
  // Five missing fares are still not evidence that a flight is missing.
  // Keep the existing cadence active until a usable search recovers.
  return { identity, misses: Math.min(5, (previous?.misses ?? 0) + 1), checkedAt: now };
}
