/**
 * Recheck a module at the last safe boundary before starting an external call.
 * The current request is allowed to finish if disabled while it is in flight;
 * callers repeat this check before the next date/route/flight.
 */
export async function fetchWhileEnabled<T>(
  isEnabled: () => Promise<boolean>,
  fetchNext: () => Promise<T>,
  label: string,
): Promise<T> {
  if (!(await isEnabled())) throw new Error(`${label} stopped: module disabled`);
  return fetchNext();
}