import { useEffect, useMemo, useRef } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { buildHistoryResource, type BuildRun } from "@plugins/build/core";
import {
  asNamespace,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";
import { serveStatusEndpoint } from "../../shared/endpoints";

/**
 * What a surface may claim about a composition's live serve. A discriminated
 * result, so "we have not been told yet" and "nothing is served" can never be
 * rendered as the same thing — the whole point of the read: `autoBuild` is an
 * intent, and a link built from an intent points at a namespace that 502s.
 */
export type ServeStatus =
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      /** This backend is main, so a serve build can actually be started here. */
      canServe: boolean;
      live:
        | { served: false }
        | { served: true; url: string; commit: string | null; builtAt: string };
    };

/**
 * The namespace's live URL — the gateway routes it by subdomain.
 *
 * `namespace` is a composition id. Compose-serve only ever runs on the main
 * checkout, where the checkout suffix elides and the namespace IS the id — so
 * the cast holds today. Phase 4 (serving a composition from a worktree) is what
 * makes namespace and composition id a genuine pair.
 */
function serveUrl(namespace: string): string {
  return namespaceUrl(asNamespace(namespace));
}

/**
 * A signature of the newest terminal build that could have changed this
 * namespace's marker: the composition's own compose-serve child run, or the
 * main run that hosts it (a serve that is swept writes no child row at all, so
 * watching only the child would miss a deactivation).
 *
 * Derived from the whole result rather than through a `select`, because the
 * selector would have to close over `namespace` and an unstable selector
 * re-subscribes on every render. `build.history` pushes only when a build starts
 * or ends, so folding the list here is not a hot path.
 */
function buildSignature(
  result: ResourceResult<BuildRun[]>,
  namespace: string,
): string | null {
  // `null` is genuine absence the caller must handle, not an empty default: the
  // effect below acts on a CHANGE of signature, so "no signature yet" can never
  // be mistaken for "nothing has built".
  if (result.pending) return null;

  let newestAt = -1;
  let newestId = "";
  for (const run of result.data) {
    if (run.target !== namespace && run.target !== "main") continue;
    if (run.finishedAt === null) continue;
    const at = run.finishedAt.getTime();
    if (at > newestAt) {
      newestAt = at;
      newestId = run.id;
    }
  }
  return `${newestAt}:${newestId}`;
}

/**
 * Is `namespace` actually being served right now, and can this backend start
 * serving it?
 *
 * The truth is the `composition.json` marker on the shared filesystem, read
 * through `GET /api/build/serve/status`. Freshness is push-based, not polled:
 * the query refetches when a build that could have written or swept that marker
 * reaches terminal, which is exactly what `build.history` announces.
 *
 * `namespace` is the manifest item's **id** (what `compose-serve` owns), never
 * its display name.
 */
export function useServeStatus(namespace: string): ServeStatus {
  const query = useEndpoint(
    serveStatusEndpoint,
    {},
    { query: { composition: namespace } },
  );

  const runsResult = useResource(buildHistoryResource);
  const signature = buildSignature(runsResult, namespace);

  // The first settled signature is RECORDED, not acted on: the query already
  // fetched on mount, and refetching it there would double every mount for no
  // new information.
  const seen = useRef<string | null>(null);
  const { refetch } = query;
  useEffect(() => {
    if (signature === null) return;
    if (seen.current === null || seen.current === signature) {
      seen.current = signature;
      return;
    }
    seen.current = signature;
    // Fire-and-forget by design: the query owns its own error state, and this is
    // a freshness nudge, not a request anything awaits.
    void refetch();
  }, [signature, refetch]);

  const { data, error } = query;
  return useMemo<ServeStatus>(() => {
    if (data === undefined) {
      return error
        ? { kind: "error", message: error.message }
        : { kind: "pending" };
    }
    const { canServe, liveness } = data;
    return {
      kind: "ready",
      canServe,
      live: liveness.served
        ? {
            served: true,
            url: serveUrl(namespace),
            commit: liveness.commit,
            builtAt: liveness.builtAt,
          }
        : { served: false },
    };
  }, [data, error, namespace]);
}
