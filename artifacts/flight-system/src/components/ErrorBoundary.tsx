import { Component, type ReactNode } from "react";

const RELOAD_FLAG = "fms_chunk_reload_ts";
const RELOAD_GUARD_MS = 10_000;

/**
 * Detects errors thrown when a dynamically-imported chunk (e.g. the lazy
 * FlightSidePanel) can no longer be fetched. This happens after a deploy:
 * the server deletes the old hashed chunk and the still-open browser tab,
 * holding the previous index.html, tries to load a file that no longer
 * exists → 404 / module-load failure.
 */
function isChunkLoadError(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message ?? "";
  const name = (error as { name?: string } | null)?.name ?? "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /'text\/html' is not a valid JavaScript MIME type/i.test(msg)
  );
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary. Without it, any render-time throw (including a
 * stale-chunk import failure) unmounts the whole React tree and the user
 * sees a blank white page. On a chunk error we reload once to pull the
 * freshly-deployed assets; a short time-based guard prevents reload loops.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error): void {
    if (!isChunkLoadError(error)) return;
    let last = 0;
    try { last = Number(window.sessionStorage.getItem(RELOAD_FLAG) || 0); } catch { /* ignore */ }
    if (Date.now() - last < RELOAD_GUARD_MS) return; // already tried — avoid loop
    try { window.sessionStorage.setItem(RELOAD_FLAG, String(Date.now())); } catch { /* ignore */ }
    window.location.reload();
  }

  private handleReload = (): void => {
    try { window.sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const chunkErr = isChunkLoadError(this.state.error);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-white">
        <h2 className="text-xl font-bold text-gray-800">
          {chunkErr ? "Po rifreskohet faqja…" : "Diçka shkoi keq"}
        </h2>
        <p className="text-sm text-gray-500 max-w-sm">
          {chunkErr
            ? "U publikua një version i ri i sistemit. Po e rifreskojmë faqen automatikisht."
            : "Ndodhi një gabim i papritur. Provoni të rifreskoni faqen."}
        </p>
        <button
          onClick={this.handleReload}
          className="px-4 py-2 rounded-lg bg-[#FF3C00] text-white text-sm font-semibold hover:opacity-90"
        >
          Rifresko Faqen
        </button>
      </div>
    );
  }
}
