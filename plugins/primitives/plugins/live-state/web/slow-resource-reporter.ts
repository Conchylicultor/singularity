export interface SlowResourceInfo {
  key: string;
  params: unknown;
  durationMs: number;
  /**
   * Root-cause attribution, NOT a suppression signal. True when the
   * notifications transport was not yet ready at the moment this resource
   * mounted — so its mount→first-data settle is dominated by transport bring-up
   * (cold-start), not the resource's own compute cost. The signal still fires
   * with its full duration; this only says WHY it was slow.
   */
  transportColdStart: boolean;
  /**
   * Milliseconds of the settle window spent waiting for the transport to FIRST
   * become ready (0 if the transport was already ready when the resource
   * mounted). This is the portion of `durationMs` chargeable to transport
   * bring-up rather than the resource.
   */
  transportWaitMs: number;
}

type Reporter = (info: SlowResourceInfo) => void;

// Set by a domain plugin (e.g. `reports`/slow-ops) at mount time. `useResource`
// measures every resource's mount→settle duration and hands it to the reporter
// — live-state stays threshold-agnostic and never decides what "slow" means.
// The consumer gates on its own threshold (pre-hydrated resources settle at
// ~0ms and are correctly ignored downstream). This is the generic seam; the
// primitive only reports the duration.
let reporter: Reporter | null = null;

export function registerSlowResourceReporter(fn: Reporter | null): void {
  reporter = fn;
}

export function reportSlowResource(info: SlowResourceInfo): void {
  reporter?.(info);
}
