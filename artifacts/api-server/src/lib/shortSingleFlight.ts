/** Cache successful results only; concurrent callers share one upstream read. */
export function shortSingleFlight<T>(load: () => Promise<T>, ttlMs: number) {
  let cached: { value: T; expires: number } | undefined;
  let pending: Promise<T> | undefined;
  return (): Promise<T> => {
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    if (pending) return pending;
    pending = Promise.resolve().then(load).then(value => {
      cached = { value, expires: Date.now() + ttlMs };
      return value;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
