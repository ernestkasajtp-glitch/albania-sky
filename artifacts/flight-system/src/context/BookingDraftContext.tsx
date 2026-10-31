import { createContext, useContext, useRef, useCallback, useEffect, useState, ReactNode, useMemo } from "react";
import { AtomicBookingTransport } from "@/lib/atomicBookingTransport";

// ── Per-instance API ───────────────────────────────────────────────

export interface BookingDraftAPI {
  transport: AtomicBookingTransport;
  markDirty(id: string, isDirty: boolean): void;
  registerFlush(id: string, fn: () => Promise<void> | void): () => void;
  unregisterFlushAndClearDirty(id: string): void;
  queueOp(label: string, exec: () => Promise<void> | void): string;
  cancelOp(id: string): void;
  getQueuedOps(): ReadonlyArray<{ id: string; label: string }>;
  registerSaveAndClose(fn: () => Promise<void> | void): () => void;
  hasUnsaved(): boolean;
  dirtyCount(): number;
  isSaving(): boolean;
  subscribe(fn: () => void): () => void;
  flushAll(): Promise<void>;
  clearAll(): void;
  performSaveAndExit(): Promise<void>;
  performDiscardAndExit(): void;
  canClose(): boolean;
  subscribeCloseConfirm(fn: (n: number) => void): () => void;
}

// ── Context ────────────────────────────────────────────────────────

const BookingDraftContext = createContext<BookingDraftAPI | null>(null);

export function useBookingDraft(): BookingDraftAPI {
  const ctx = useContext(BookingDraftContext);
  if (!ctx) throw new Error("useBookingDraft must be used inside <BookingDraftProvider>");
  return ctx;
}

// ── Active-instance stack ──────────────────────────────────────────
// Lets module-level canCloseBookingDetail() delegate to the innermost
// mounted BookingDraftProvider without sharing any state between instances.

const _activeStack: BookingDraftAPI[] = [];

export function _pushActiveInstance(api: BookingDraftAPI): void { _activeStack.push(api); }
export function _popActiveInstance(api: BookingDraftAPI): void {
  const idx = _activeStack.lastIndexOf(api);
  if (idx >= 0) _activeStack.splice(idx, 1);
}
export function _getActiveInstance(): BookingDraftAPI | null {
  return _activeStack[_activeStack.length - 1] ?? null;
}

// ── Ref-counted global nav guard ───────────────────────────────────
// One shared history patch for all mounted providers; ref-counted so
// concurrent mounts/unmounts can't overwrite each other's originals.
// Covers three navigation vectors:
//   1. in-app pushState / replaceState (Wouter <Link>, navigate())
//   2. browser back/forward (popstate)
//   3. tab close / hard refresh (beforeunload, in the provider useEffect)

let _navGuardCount = 0;
let _origPush: typeof window.history.pushState | null = null;
let _origReplace: typeof window.history.replaceState | null = null;
let _popstateHandler: (() => void) | null = null;
// Prevents the synthetic popstate fired by history.forward() (used to
// undo a back-navigation) from triggering the guard a second time.
let _ignoreNextPopstate = false;
// Stores the blocked navigation action so it can be replayed after
// the user confirms save/discard. Cleared when user cancels.
let _pendingNav: (() => void) | null = null;

export function _clearPendingNav(): void { _pendingNav = null; }

function _installNavGuard(): void {
  if (_navGuardCount === 0) {
    _origPush = window.history.pushState.bind(window.history);
    _origReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = function (...args: Parameters<typeof window.history.pushState>) {
      const inst = _getActiveInstance();
      if (inst?.hasUnsaved()) {
        _pendingNav = () => _origPush!(...args);
        inst.canClose();
        return;
      }
      _origPush!(...args);
    } as typeof window.history.pushState;
    window.history.replaceState = function (...args: Parameters<typeof window.history.replaceState>) {
      const inst = _getActiveInstance();
      if (inst?.hasUnsaved()) {
        _pendingNav = () => _origReplace!(...args);
        inst.canClose();
        return;
      }
      _origReplace!(...args);
    } as typeof window.history.replaceState;

    // Block browser back/forward when there are unsaved changes.
    // We call history.forward() to undo the navigation, then invoke
    // canClose() so the user sees the same 3-option confirm dialog.
    _popstateHandler = () => {
      if (_ignoreNextPopstate) { _ignoreNextPopstate = false; return; }
      const inst = _getActiveInstance();
      if (inst?.hasUnsaved()) {
        _ignoreNextPopstate = true;
        window.history.forward();
        _pendingNav = () => window.history.back();
        inst.canClose();
      }
    };
    window.addEventListener("popstate", _popstateHandler);
  }
  _navGuardCount++;
}

function _uninstallNavGuard(): void {
  _navGuardCount--;
  if (_navGuardCount === 0 && _origPush && _origReplace) {
    window.history.pushState = _origPush;
    window.history.replaceState = _origReplace;
    _origPush = null;
    _origReplace = null;
    if (_popstateHandler) {
      window.removeEventListener("popstate", _popstateHandler);
      _popstateHandler = null;
    }
    _ignoreNextPopstate = false;
  }
}

// ── Provider ───────────────────────────────────────────────────────

export function BookingDraftProvider({ children }: { children: ReactNode }) {
  const transport = useRef(new AtomicBookingTransport());
  const flushPromise = useRef<Promise<void> | null>(null);
  const dirty = useRef(new Set<string>());
  const flushesRef = useRef(new Map<string, () => Promise<void> | void>());
  const opsQueueRef = useRef<Array<{ id: string; label: string; exec: () => Promise<void> | void }>>([]);
  const opCounterRef = useRef(0);
  const saveAndCloseFnRef = useRef<(() => Promise<void> | void) | null>(null);
  const listenersRef = useRef(new Set<() => void>());
  const closeConfirmListenersRef = useRef(new Set<(n: number) => void>());
  // Guard against double-push in React StrictMode's double-invoke.
  const pushedRef = useRef(false);

  const emit = useCallback(() => { listenersRef.current.forEach(l => l()); }, []);

  const api = useMemo((): BookingDraftAPI => {
    const self: BookingDraftAPI = {
      transport: transport.current,
      markDirty(id, isDirty) {
        const prev = dirty.current.has(id);
        if (isDirty && !prev) { dirty.current.add(id); emit(); }
        else if (!isDirty && prev) { dirty.current.delete(id); emit(); }
      },
      registerFlush(id, fn) {
        flushesRef.current.set(id, fn);
        return () => { flushesRef.current.delete(id); };
      },
      unregisterFlushAndClearDirty(id) {
        flushesRef.current.delete(id);
        if (dirty.current.delete(id)) emit();
      },
      queueOp(label, exec) {
        const id = `op-${++opCounterRef.current}`;
        opsQueueRef.current.push({ id, label, exec });
        dirty.current.add(id);
        emit();
        return id;
      },
      cancelOp(id) {
        const idx = opsQueueRef.current.findIndex(o => o.id === id);
        if (idx >= 0) opsQueueRef.current.splice(idx, 1);
        if (dirty.current.delete(id)) emit();
      },
      getQueuedOps() { return opsQueueRef.current.map(o => ({ id: o.id, label: o.label })); },
      registerSaveAndClose(fn) {
        saveAndCloseFnRef.current = fn;
        return () => { if (saveAndCloseFnRef.current === fn) saveAndCloseFnRef.current = null; };
      },
      hasUnsaved() { return dirty.current.size > 0; },
      dirtyCount() { return dirty.current.size; },
      isSaving() { return flushPromise.current !== null; },
      subscribe(fn) {
        listenersRef.current.add(fn);
        return () => { listenersRef.current.delete(fn); };
      },
      async flushAll() {
        if (flushPromise.current) return flushPromise.current;
        const work = (async () => {
        transport.current.begin();
        const queued = [...opsQueueRef.current];
        const errors: Error[] = [];
        const callbacks = [
          ...Array.from(flushesRef.current.entries()).filter(([id]) => dirty.current.has(id)).map(([, fn]) => fn),
          ...queued.map(op => op.exec),
        ];
        const settled = Promise.allSettled(callbacks.map(fn => {
          try { return Promise.resolve(fn()).catch(e => { errors.push(e); throw e; }); }
          catch (e) { errors.push(e as Error); return Promise.reject(e); }
        }));
        await Promise.resolve();
        try { await transport.current.commit(errors[0]); }
        catch (e) { await settled; throw e; }
        const outcomes = await settled;
        const failed = outcomes.find(x => x.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
        for (const op of queued) {
          opsQueueRef.current = opsQueueRef.current.filter(x => x.id !== op.id);
          dirty.current.delete(op.id);
        }
        emit();
        })();
        flushPromise.current = work;
        emit();
        try { await work; }
        finally {
          transport.current.finish();
          flushPromise.current = null;
          emit();
        }
      },
      clearAll() {
        dirty.current.clear();
        opsQueueRef.current.length = 0;
        emit();
      },
      async performSaveAndExit() {
        try {
          if (saveAndCloseFnRef.current) { await Promise.resolve(saveAndCloseFnRef.current()); }
          else { await self.flushAll(); }
          self.clearAll();
          const nav = _pendingNav;
          _pendingNav = null;
          window.dispatchEvent(new CustomEvent("booking-detail:force-close"));
          if (nav) { setTimeout(nav, 80); }
        } catch (e: any) {
          window.alert(`Gabim gjatë ruajtjes: ${e?.message ?? "S'mund të ruhej."}`);
          throw e;
        }
      },
      performDiscardAndExit() {
        self.clearAll();
        const nav = _pendingNav;
        _pendingNav = null;
        window.dispatchEvent(new CustomEvent("booking-detail:force-close"));
        if (nav) { setTimeout(nav, 80); }
      },
      canClose() {
        if (dirty.current.size === 0) return true;
        const n = dirty.current.size;
        const cls = closeConfirmListenersRef.current;
        if (cls.size > 0) { cls.forEach(l => l(n)); }
        else {
          setTimeout(() => {
            const save = window.confirm(
              `Ke ${n} ndryshim${n === 1 ? "" : "e"} të paruajtur${n === 1 ? "" : "a"}.\n\nOK = Ruaj dhe Dil\nCancel = vendos më pas`
            );
            if (save) { void self.performSaveAndExit(); }
            else if (window.confirm("Dil PA RUAJTUR? Të gjitha ndryshimet do humbasin.")) { self.performDiscardAndExit(); }
          }, 0);
        }
        return false;
      },
      subscribeCloseConfirm(fn) {
        closeConfirmListenersRef.current.add(fn);
        return () => { closeConfirmListenersRef.current.delete(fn); };
      },
    };
    return self;
  }, [emit]);

  // Push synchronously during render so child useEffects (which run before
  // parent useEffects in React) can find this instance via _getActiveInstance().
  // pushedRef guards against double-push in React StrictMode's double-invoke.
  if (!pushedRef.current) {
    pushedRef.current = true;
    _pushActiveInstance(api);
  }

  useEffect(() => {
    _installNavGuard();

    // ── beforeunload (refresh / tab close) ──────────────────────
    const beforeunload = (e: BeforeUnloadEvent) => {
      if (api.hasUnsaved()) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeunload);

    return () => {
      window.removeEventListener("beforeunload", beforeunload);
      _uninstallNavGuard();
      _popActiveInstance(api);
    };
  }, [api]);

  return (
    <BookingDraftContext.Provider value={api}>
      {children}
    </BookingDraftContext.Provider>
  );
}

// ── Hooks for context consumers ────────────────────────────────────

export function useDirtyCount(): number {
  const api = useBookingDraft();
  const [n, setN] = useState(() => api.dirtyCount());
  useEffect(() => {
    setN(api.dirtyCount());
    return api.subscribe(() => setN(api.dirtyCount()));
  }, [api]);
  return n;
}

export function useBookingSaving(): boolean {
  const api = useBookingDraft();
  const [saving, setSaving] = useState(() => api.isSaving());
  useEffect(() => {
    setSaving(api.isSaving());
    return api.subscribe(() => setSaving(api.isSaving()));
  }, [api]);
  return saving;
}

/**
 * No-op: navigation guard is now managed by BookingDraftProvider itself.
 * Kept for backward compatibility with existing call sites.
 */
export function useBookingDetailNavGuard(): void {
  // Guard lifecycle (beforeunload + pushState/replaceState) is handled
  // inside BookingDraftProvider's useEffect. Nothing to do here.
}
