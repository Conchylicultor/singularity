/**
 * The one reconnect delay every transport in this plugin uses: 500 ms doubling
 * to a 5 s cap, each delay jittered by a fresh 0.5–1.5× factor.
 *
 * The jitter is load-bearing. A backend restart drops every tab's connection
 * in the same instant; a fixed schedule would wake them all in the same
 * millisecond and re-herd the backend on every cycle. A fresh random spread
 * per call de-synchronizes them.
 *
 * Spelled out here rather than composed from `packages/retry`: this module runs
 * inside the SharedWorker bundle (via `socket-owner.ts`), and a worker can only
 * bundle files its artifact's address hashes — its own plugin's — since import
 * maps do not reach workers. The web-artifacts inline audit fails the build on
 * any other first-party import.
 */
export function RECONNECT_DELAY(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 5000);
  return base * (0.5 + Math.random());
}

/**
 * The reconnect half of a reconnecting transport: the attempt counter, the one
 * pending retry timer, and the delay schedule. A transport calls `schedule` when
 * its connection drops, `reset` when one opens, and `cancel` when it is torn
 * down, so no transport holds its own counter, timer or backoff formula.
 */
export class ReconnectSchedule {
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** True until the first drop since the last `reset` — "connecting", not "reconnecting". */
  get isFirstAttempt(): boolean {
    return this.attempt === 0;
  }

  /**
   * Run `reconnect` after the next backoff delay, replacing any pending retry.
   * Returns the attempt number just scheduled (1 for the first retry).
   */
  schedule(reconnect: () => void): number {
    this.cancel();
    const delay = RECONNECT_DELAY(this.attempt);
    this.attempt++;
    this.timer = setTimeout(() => {
      this.timer = null;
      reconnect();
    }, delay);
    return this.attempt;
  }

  /** A connection opened: the next drop starts again from the shortest delay. */
  reset(): void {
    this.attempt = 0;
  }

  /** Drop the pending retry, if any. The attempt count is kept. */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
