import type { ResourceReadiness } from "@plugins/primitives/plugins/live-state/core";

/**
 * What the body renders in place of the active view, if anything — the one
 * precedence both data paths share:
 *
 *   server error > failed read > loading > the view.
 *
 * The in-memory path's read state is `readiness`; without one the rows are
 * taken as ready (a static list). A failed read never reaches the view, whose
 * empty rows would claim "nothing here" (`emptyState`).
 */
export type BodyState =
  | { kind: "server-error"; error: Error }
  | { kind: "error"; error: Extract<ResourceReadiness, { status: "error" }> }
  | { kind: "loading" }
  | { kind: "view" };

export function resolveBodyState(input: {
  server: { loading: boolean; error: Error | null } | null;
  readiness: ResourceReadiness | undefined;
}): BodyState {
  const { server, readiness } = input;
  if (server) {
    if (server.error) return { kind: "server-error", error: server.error };
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
