import type { ResourceReadiness } from "@plugins/primitives/plugins/live-state/core";

/**
 * What the body renders in place of the active view, if anything — the one
 * precedence both data paths share:
 *
 *   server error > failed read > loading > the view.
 *
 * A server-ordered origin's `error` is the query it could not form or page
 * (`server-error`); its `readError` is the read itself failing with nothing to
 * show — the same `error` arm the in-memory path's `readiness` fails with, so
 * a live list and a resource-backed one render a failure alike (Retry, and
 * the reload a stale tab needs). Without a `readiness` the in-memory rows are
 * taken as ready (a static list). A failed read never reaches the view, whose
 * empty rows would claim "nothing here" (`emptyState`).
 */
export type BodyState =
  | { kind: "server-error"; error: Error }
  | { kind: "error"; error: Extract<ResourceReadiness, { status: "error" }> }
  | { kind: "loading" }
  | { kind: "view" };

export function resolveBodyState(input: {
  server: {
    loading: boolean;
    error: Error | null;
    readError: Extract<ResourceReadiness, { status: "error" }> | null;
  } | null;
  readiness: ResourceReadiness | undefined;
}): BodyState {
  const { server, readiness } = input;
  if (server) {
    if (server.error) return { kind: "server-error", error: server.error };
    if (server.readError) return { kind: "error", error: server.readError };
    return server.loading ? { kind: "loading" } : { kind: "view" };
  }
  switch (readiness?.status) {
    case "error":
      return { kind: "error", error: readiness };
    case "loading":
      return { kind: "loading" };
    case "ready":
    case undefined:
      return { kind: "view" };
  }
}
