export interface SlowResourceInfo {
  key: string;
  params: unknown;
  durationMs: number;
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
