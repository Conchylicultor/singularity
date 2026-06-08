export interface EndpointErrorInfo {
  // The endpoint route, e.g. "POST /api/tasks/chain". Already bundles method + path.
  route: string;
  status: number;
  // The parsed error response body (JSON object, string, or null).
  body: unknown;
}

type Reporter = (info: EndpointErrorInfo) => void;

// Set by a domain plugin (e.g. `crashes`) at mount time. The endpoints
// primitive fires this for EVERY non-ok response and never inspects the
// shape — the registered reporter decides which errors are worth recording.
// Mirrors `registerBoundaryReporter` so the primitive stays domain-agnostic
// and never depends on the crashes feature plugin.
let reporter: Reporter | null = null;

export function registerEndpointErrorReporter(fn: Reporter | null): void {
  reporter = fn;
}

export function reportEndpointError(info: EndpointErrorInfo): void {
  try {
    reporter?.(info);
    // eslint-disable-next-line promise-safety/no-bare-catch -- reporter is a user-supplied callback on the error path; any error it throws must be suppressed to prevent cascading failures during error handling
  } catch {
    // Reporting must never throw — we're already on the error path.
    return undefined;
  }
}
