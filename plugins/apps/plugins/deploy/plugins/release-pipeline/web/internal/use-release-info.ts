import { useEffect, useMemo, useRef } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  PLATFORM_TAGS,
  releaseCandidateEndpoint,
  releaseLatestRunEndpoint,
  releaseRunsRevisionResource,
  type PlatformTag,
  type ReleaseCandidateResponse,
  type ReleaseRun,
} from "@plugins/release/core";
import {
  resolveReleaseState,
  type ReleaseState,
} from "../../core";

/**
 * Everything the pipeline and the row chip know about one deployment's release
 * candidate. `state` is null while EITHER half is still loading — a half-loaded
 * snapshot must never render as a state, since "no bundle" and "not asked yet"
 * would look identical.
 */
export interface ReleaseInfo {
  state: ReleaseState | null;
  candidate: ReleaseCandidateResponse | null;
  /** Newest run of this composition in this namespace, any platform or kind. */
  latestRun: ReleaseRun | null;
  pending: boolean;
}

/** Module-level so the selector reference is stable across every mount. */
const selectRev = (d: { rev: string }): string => d.rev;

/**
 * Refetch when the release engine says something changed.
 *
 * `release.history-revision` is a cheap scalar tick the server pushes on every
 * new run and every status flip — the same signal the Studio history DataView
 * refreshes on. The first settled `rev` is *recorded, not acted on*: the query
 * has already fetched on mount, and refetching it again would double every
 * mount for no new information.
 */
function useRevisionRefetch(refetch: () => unknown): void {
  // A sanctioned point read: `select` narrows both the subscription and the
  // re-render to the one scalar this hook reacts to, and `null` while pending
  // means "no revision yet" — the effect below acts on a CHANGE, never on an
  // absence, so loading is not collapsed into a value.
  const tick = useResource(releaseRunsRevisionResource, undefined, {
    select: selectRev,
  });
  const rev = tick.pending ? null : tick.data;
  const seenRev = useRef<string | null>(null);

  useEffect(() => {
    if (rev === null) return;
    if (seenRev.current === null || seenRev.current === rev) {
      seenRev.current = rev;
      return;
    }
    seenRev.current = rev;
    // Fire-and-forget by design: the query owns its own error state, and this is
    // a freshness nudge, not a request anything awaits.
    void refetch();
  }, [rev, refetch]);
}

/**
 * The two questions behind every release affordance in this app, asked together:
 *
 * - **the filesystem**: is there a shippable bundle for this (composition,
 *   platform), and if not, why not — `GET /api/release/candidate`, whose
 *   `resolution` is the exact value `ship` itself acts on;
 * - **the DB**: is a build of this composition running or did the last one fail
 *   — `GET /api/release/latest`, the newest run whatever its state. The
 *   candidate endpoint cannot answer this: its `run` is the *resolved bundle's*
 *   run, so it is blind to a build in flight and to one that just failed.
 *
 * A `null` platform means the server has no verified platform yet: there is no
 * question to ask (a candidate is *for* a platform), so both queries stay
 * disabled and everything reads pending-free as "we cannot know".
 */
export function useReleaseInfo(
  composition: string,
  platform: PlatformTag | null,
): ReleaseInfo {
  const enabled = platform !== null;

  const candidateQuery = useEndpoint(
    releaseCandidateEndpoint,
    {},
    {
      // A disabled query never runs, so the placeholder tag only shapes a key
      // that is never used. Types make a platform-less candidate query
      // unaskable, which is the point.
      query: { composition, platform: platform ?? PLATFORM_TAGS[0] },
      enabled,
    },
  );

  // The newest run of this composition, whatever its state. Its own GET, not
  // the history DataView's POST borrowed with an invented `dataViewId` — that
  // endpoint is a server-delegated DataView source whose augmentors key off the
  // surface id, so an off-label id works only until one matches it.
  //
  // Not enabled-gated on `platform`: "is a build running / did it fail" is a
  // question about the composition, which is answerable with no platform at all.
  // It is gated anyway, so both halves settle together — `pending` below treats
  // them as one snapshot, and a lone early answer would paint a half-state.
  const latestRunQuery = useEndpoint(
    releaseLatestRunEndpoint,
    {},
    { query: { composition }, enabled },
  );

  useRevisionRefetch(candidateQuery.refetch);
  useRevisionRefetch(latestRunQuery.refetch);

  const candidate = candidateQuery.data ?? null;
  const latestRun = latestRunQuery.data?.run ?? null;
  const pending =
    enabled && (candidateQuery.data === undefined || latestRunQuery.data === undefined);

  return useMemo(
    () => ({
      candidate,
      latestRun,
      pending,
      state: candidate && !pending ? resolveReleaseState({ candidate, latestRun }) : null,
    }),
    [candidate, latestRun, pending],
  );
}
