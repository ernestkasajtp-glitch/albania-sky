/**
 * bookingDetailDirty — backward-compat shim.
 *
 * All mutable draft state lives inside BookingDraftProvider (per-instance
 * React context keyed to each BookingDetailContent mount). This module
 * re-exports that context's public hooks and delegates every imperative
 * call to the currently active (innermost) instance via a module-level
 * stack, so the 13+ external call-sites (pages, dialogs) need no changes.
 */
import { _getActiveInstance } from "@/context/BookingDraftContext";
export {
  useDirtyCount,
  useBookingDetailNavGuard,
  BookingDraftProvider,
  useBookingDraft,
  _clearPendingNav,
} from "@/context/BookingDraftContext";

// All delegating calls are resilient: if no BookingDraftProvider is currently
// mounted (e.g. a field component runs its unmount cleanup AFTER the provider
// has already been torn down), they no-op instead of throwing. A thrown error
// during React render/teardown unmounts the whole tree → blank page, so these
// must degrade gracefully. There is nothing to clear/queue when no instance
// exists anyway.

export function markDirty(id: string, isDirty: boolean) { _getActiveInstance()?.markDirty(id, isDirty); }
export function registerFlush(id: string, fn: () => Promise<void> | void) { return _getActiveInstance()?.registerFlush(id, fn) ?? (() => {}); }
export function unregisterFlushAndClearDirty(id: string) { _getActiveInstance()?.unregisterFlushAndClearDirty(id); }
export function queueOp(label: string, exec: () => Promise<void> | void) { return _getActiveInstance()?.queueOp(label, exec) ?? ""; }
export function cancelOp(id: string) { _getActiveInstance()?.cancelOp(id); }
export function getQueuedOps() { return _getActiveInstance()?.getQueuedOps() ?? []; }
export function registerSaveAndClose(fn: () => Promise<void> | void) { return _getActiveInstance()?.registerSaveAndClose(fn) ?? (() => {}); }
export function hasUnsavedBookingDetail(): boolean { return _getActiveInstance()?.hasUnsaved() ?? false; }
export function dirtyCount(): number { return _getActiveInstance()?.dirtyCount() ?? 0; }
export async function flushAllBookingDetail(): Promise<void> { await _getActiveInstance()?.flushAll(); }
export function clearAllBookingDetail() { _getActiveInstance()?.clearAll(); }
export async function performSaveAndExit(): Promise<void> { await _getActiveInstance()?.performSaveAndExit(); }
export function performDiscardAndExit() { _getActiveInstance()?.performDiscardAndExit(); }
export function subscribeCloseConfirm(fn: (n: number) => void) { return _getActiveInstance()?.subscribeCloseConfirm(fn) ?? (() => {}); }

/**
 * Called by any dialog/page hosting a BookingDetailContent before closing.
 * Returns true if safe to close; otherwise triggers the 3-button confirm
 * dialog and returns false.
 * Delegates to the innermost active BookingDraftProvider instance — safe
 * even when multiple BookingDetailContent instances are mounted concurrently.
 */
export function canCloseBookingDetail(): boolean {
  const inst = _getActiveInstance();
  return inst ? inst.canClose() : true;
}
