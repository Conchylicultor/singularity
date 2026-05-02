export interface BoundaryErrorReport {
  error: Error;
  componentStack: string | null;
  slot: string | null;
  label: string | null;
}

type Reporter = (
  r: BoundaryErrorReport,
) => Promise<unknown> | unknown | void;

// Set by a domain plugin (e.g. `crashes`) at mount time. The boundary
// stores whatever the reporter returns as opaque `context` and threads
// it to ErrorBoundary.Action contributions. The boundary primitive never
// looks at the shape — that's the contract between the reporter-owner
// and action contributors.
let reporter: Reporter | null = null;

export function registerBoundaryReporter(fn: Reporter | null): void {
  reporter = fn;
}

export function callReporter(
  report: BoundaryErrorReport,
): Promise<unknown> | unknown | void {
  try {
    return reporter?.(report);
  } catch {
    return undefined;
  }
}
