export class SftpTimeoutError extends Error {
  constructor(public readonly operation: string, timeoutMs: number) {
    super(`Offline SFTP: ${operation} pa përgjigje pas ${timeoutMs / 1000} sekondash`);
    this.name = "SftpTimeoutError";
  }
}

/** A deadline must terminate the transport, not merely abandon its promise. */
export function createSftpDeadline(
  destroy: () => void,
  log: (details: { operation: string; durationMs: number; state: string }) => void,
) {
  let aborted: SftpTimeoutError | undefined;
  return async function run<T>(operation: string, action: () => Promise<T>, timeoutMs = 60_000): Promise<T> {
    if (aborted) throw aborted;
    const started = Date.now();
    log({ operation, durationMs: 0, state: "started" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(action),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            aborted = new SftpTimeoutError(operation, timeoutMs);
            // ssh2.destroy synchronously destroys its network socket. No subsequent
            // operation is allowed on this client, even if an old callback arrives.
            try { destroy(); } finally { reject(aborted); }
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      log({ operation, durationMs: Date.now() - started, state: aborted ? "timeout" : "finished" });
    }
  };
}
