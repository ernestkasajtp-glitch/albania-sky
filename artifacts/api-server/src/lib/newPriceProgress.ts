/** Observability only; never owns a timer, queue lease or price write. */
export class NewPriceProgress {
  state = {
    running: false, phase: "idle" as "idle" | "waiting" | "checking" | "completed" | "failed",
    total: 0, done: 0, refreshed: 0,
    startedAt: null as string | null, finishedAt: null as string | null,
  };
  constructor(private changed: () => void = () => {}) {}
  start() {
    Object.assign(this.state, { running: true, phase: "waiting", total: 0, done: 0, refreshed: 0,
      startedAt: new Date().toISOString(), finishedAt: null });
    this.changed();
  }
  phase(phase: "waiting" | "checking") { this.state.phase = phase; this.changed(); }
  publish() { this.changed(); }
  finish(failed = false) {
    Object.assign(this.state, { running: false, phase: failed ? "failed" : "completed", finishedAt: new Date().toISOString() });
    this.changed();
  }
  snapshot() { return { ...this.state }; }
}
