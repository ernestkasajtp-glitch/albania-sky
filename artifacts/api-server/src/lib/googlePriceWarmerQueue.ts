// Serialize Google-price writers without letting a long candidate refresh
// monopolize the queue. Ownership changes only at explicit safe boundaries.
export class GooglePriceWarmerQueue {
  private owner = 0;
  private nextToken = 1;
  private waiters: Array<{ token: number; resolve: (token: number) => void }> = [];

  acquire(): Promise<number> {
    const token = this.nextToken++;
    if (this.owner === 0 && this.waiters.length === 0) {
      this.owner = token;
      return Promise.resolve(token);
    }
    return new Promise(resolve => this.waiters.push({ token, resolve }));
  }

  owns(token: number): boolean {
    return token !== 0 && this.owner === token;
  }

  release(token: number): void {
    if (!this.owns(token)) return;
    const next = this.waiters.shift();
    this.owner = next?.token ?? 0;
    if (next) next.resolve(next.token);
  }

  yield(token: number): Promise<number> {
    if (!this.owns(token)) throw new Error("Cannot yield a Google warmer without ownership");
    if (!this.waiters.length) return Promise.resolve(token);
    // Enqueue the same lease BEFORE handoff. The caller cannot resume until it
    // owns that lease again, and its existing finally can still release it.
    return new Promise(resolve => {
      this.waiters.push({ token, resolve });
      this.release(token);
    });
  }
}
