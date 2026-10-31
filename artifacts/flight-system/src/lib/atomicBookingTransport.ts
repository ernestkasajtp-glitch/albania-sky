export class AtomicBookingTransport {
  private pending: null | Array<{ path: string; method: string; body?: any; resolve: (r: Response) => void; reject: (e: Error) => void }> = null;
  private retry: { text: string; id: string } | null = null;
  private flushing = false;
  bookingId = 0;
  version = "";
  readonly base = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
  begin() { this.pending = []; this.flushing = true; }
  finish() { this.flushing = false; }
  request = (url: string, init: RequestInit = {}): Promise<Response> => {
    if (!this.pending) {
      if (this.flushing) return Promise.reject(new Error("Ndryshimi u përgatit tepër vonë; nuk u dërgua veçmas."));
      return fetch(url, init);
    }
    const path = new URL(url, window.location.origin).pathname.replace(/^\/api/, "");
    return new Promise((resolve, reject) => {
      this.pending!.push({ path, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined, resolve, reject });
    });
  };
  async commit(error?: Error) {
    const pending = this.pending!;
    try {
      if (error) throw error;
      if (!pending.length) return;
      if (!this.version) throw new Error("Rifresko rezervimin përpara ruajtjes.");
      const commands = pending.map(({ path, method, body }) => ({ path, method, body }));
      const text = JSON.stringify({ version: this.version, commands });
      if (this.retry?.text !== text) this.retry = { text, id: crypto.randomUUID() };
      const response = await fetch(`${this.base}/bookings/${this.bookingId}/save`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: this.retry.id, version: this.version, commands }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Ruajtja dështoi.");
      this.retry = null;
      if (result.booking?.saveVersion) this.version = result.booking.saveVersion;
      pending.forEach((p, i) => p.resolve(new Response(JSON.stringify(result.results[i] ?? {}), { status: 200 })));
    } catch (e) {
      pending.forEach(p => p.reject(e instanceof Error ? e : new Error(String(e))));
      throw e;
    } finally { this.pending = null; }
  }
}

export function draftMutation(request: AtomicBookingTransport["request"], resource: string) {
  return {
    mutate(input: { id: number; data: any }, options?: { onSuccess?: (value: any) => void; onError?: (error: any) => void }) {
      void request(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/../api/${resource}/${input.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data),
      }).then(async response => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error ?? "Ruajtja dështoi.");
        options?.onSuccess?.(value);
      }).catch(error => options?.onError?.(error));
    },
  };
}