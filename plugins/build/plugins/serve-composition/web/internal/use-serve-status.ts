import { useEffect, useMemo, useRef } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { buildHistoryResource, type BuildRun } from "@plugins/build/core";
import {
  asNamespace,
  namespaceHost,
} from "@plugins/infra/plugins/namespace/core";
import { serveStatusEndpoint } from "../../shared/endpoints";

/**
 * What a surface may claim about a composition's live serve. A discriminated
 * result, so "we have not been told yet" and "nothing is served" can never be
 * rendered as the same thing — the whole point of the read: `serve` is an
 * intent, and a link built from an intent points at a namespace that 502s.
 */
export type ServeStatus =
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      /**
       * Where this composition is — or would be — served from the backend that
       * answered. Resolved SERVER-side (`namespaceFor(id, its own checkout)`):
       * a composition served from a worktree lives at
       * `<id>.<checkout>.localhost:9000`, and the browser cannot work that out
       * from the namespace it is talking to.
       */
      namespace: string;
      /** `<namespace>.localhost:9000` — the display form of the same fact. */
      host: string;
      /** The full origin, as the server named it. */
      url: string;
      live:
        | { served: false }
        | { served: true; commit: string | null; builtAt: string };
      /**
       * Whether the automatic serve modes are acted on by the backend that
       * answered — a fact about THAT BACKEND, not about this composition. They
       * run on main only, so a worktree's panel must say so rather than offer
       * "On every push" and never act on it.
       */
      autoTriggersHere: boolean;
    };

/**
 * A signature of the newest terminal build that could have changed this
 * composition's marker: any run whose targets include it.
 *
 * It used to additionally watch main's run, because a serve deactivated by the
 * compose-serve sweep wrote no child row of its own — watching only the child
 * would have missed the sweep. Both are gone: a serve is now its own build, so
 * the runs that touch this composition are exactly the ones that name it.
 *
 * Derived from the whole result rather than through a `select`, because the
 * selector would have to close over `composition` and an unstable selector
 * re-subscribes on every render. `build.history` pushes only when a build starts
 * or ends, so folding the list here is not a hot path.
 */
function buildSignature(
  result: ResourceResult<BuildRun[]>,
  composition: string,
): string | null {
  // `null` is genuine absence the caller must handle, not an empty default: the
  // effect below acts on a CHANGE of signature, so "no signature yet" can never
  // be mistaken for "nothing has built".
  if (result.pending) return null;

  let newestAt = -1;
  let newestId = "";
  for (const run of result.data) {
    if (!run.targets.includes(composition)) continue;
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
 * Where is `composition` served from this backend's checkout, and is anything
 * actually there right now?
 *
 * The truth is the `composition.json` marker on the shared filesystem, read
 * through `GET /api/build/serve/status`. Freshness is push-based, not polled:
 * the query refetches when a build that could have written that marker reaches
 * terminal, which is exactly what `build.history` announces.
 *
 * `composition` is the manifest item's **id**, never its display name.
 */
export function useServeStatus(composition: string): ServeStatus {
  const query = useEndpoint(
    serveStatusEndpoint,
    {},
    { query: { composition } },
  );

  const runsResult = useResource(buildHistoryResource);
  const signature = buildSignature(runsResult, composition);

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
    const { namespace, url, liveness, autoTriggersHere } = data;
    return {
      kind: "ready",
      namespace,
      // The one cast, at the wire boundary, on a value the SERVER resolved —
      // not a namespace this hook composed. `namespaceHost` is what turns it
      // into the string a chip shows; the origin comes back as `url`.
      host: namespaceHost(asNamespace(namespace)),
      url,
      autoTriggersHere,
      live: liveness.served
        ? {
            served: true,
            commit: liveness.commit,
            builtAt: liveness.builtAt,
          }
        : { served: false },
    };
  }, [data, error]);
}
