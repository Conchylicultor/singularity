import type {
  PlatformTag,
  ReleaseCandidate,
  ReleaseRun,
} from "@plugins/release/core";

/**
 * What `ship` would pick for this deployment right now, as one word.
 *
 * The states answer exactly one question — **what would Ship do?** — which is
 * what fixes their priority order and what keeps a build failure out of them
 * (see {@link resolveReleaseState}).
 *
 * Phase 3 inserts `rehearsal-failed` and `rehearsed` between `stale` and
 * `built`; that is the only extension point, and adding them is a member here
 * plus a branch in the resolver's chain, both compile-checked.
 */
export type ReleaseState =
  /** A release of this composition is running right now. */
  | "building"
  /** The last build failed AND there is no bundle at all to fall back on. */
  | "failed"
  /** Nothing has ever been built for this platform. */
  | "none"
  /** A bundle exists, but for a different platform than this server reports. */
  | "platform-mismatch"
  /** Shippable, but built from a commit that is no longer HEAD. */
  | "stale"
  /** Shippable, and built from a source state we cannot fault. */
  | "built";

export const RELEASE_STATE_OPTIONS: { value: ReleaseState; label: string }[] = [
  { value: "building", label: "Building" },
  { value: "failed", label: "Build failed" },
  { value: "none", label: "Not built" },
  { value: "platform-mismatch", label: "Wrong platform" },
  { value: "stale", label: "Stale" },
  { value: "built", label: "Built" },
];

const LABELS: Record<ReleaseState, string> = Object.fromEntries(
  RELEASE_STATE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ReleaseState, string>;

export function releaseStateLabel(state: ReleaseState): string {
  return LABELS[state];
}

export interface ReleaseStateInput {
  /** The `release.candidate` value for this (composition, platform). */
  candidate: ReleaseCandidate;
  /**
   * The newest `release_runs` row for this composition in this namespace,
   * whatever its platform or kind — the engine's in-flight uniqueness is
   * `(namespace, composition)`, so a staged Studio run really does block a
   * candidate build here, and really is "a build of this composition".
   */
  latestRun: ReleaseRun | null;
}

/**
 * The one derivation of a deployment's release state, shared by the row chip and
 * the pipeline steps so they can never disagree.
 *
 * **A build that failed while a good bundle still exists does not read
 * `failed`.** The field states what Ship would pick, and Ship would still pick
 * the older bundle — so the failure belongs to the Build step, unsummarised, in
 * the place that can show the log. This is the same rule `RunFailureNotice`
 * follows for a refused deploy.
 */
export function resolveReleaseState({
  candidate,
  latestRun,
}: ReleaseStateInput): ReleaseState {
  if (latestRun?.status === "running") return "building";

  const { resolution, staleness } = candidate;

  if (!resolution.ok) {
    // Only here — with nothing to ship — does a failed build become the state.
    if (latestRun?.status === "failed") return "failed";
    return resolution.refusal.kind === "platform-mismatch"
      ? "platform-mismatch"
      : "none";
  }

  // `unknown` (a dirty build, an absent sha, a sha this repo never saw) is NOT
  // stale: unprovable is not the same as out of date, and claiming otherwise
  // would make the honest answer look like a defect.
  return staleness.kind === "behind" || staleness.kind === "diverged"
    ? "stale"
    : "built";
}

/**
 * Whether the candidate is PROVABLY older than the newest run — the two reads
 * are separate streams nothing orders on the server, so the newest run can
 * land before the candidate it produced. Holding `loading` then is what stops
 * a just-finished build from flashing "Not built" (or the previous bundle).
 *
 * Only a provable lag holds, never a merely possible one, so the gate cannot
 * stay shut: the run must be a succeeded `candidate` of this platform's web
 * target — the only kind that claims the `latest-<platform>` pointer this
 * value resolves — and EITHER
 *
 * - the candidate resolved a different run, built before the newest one
 *   started (that run's bundle replaces it), OR
 * - the candidate found no pointer at all, observed before the newest run
 *   finished (the server observes afresh on every candidate close, so this
 *   ends when that observation lands — whatever it finds).
 *
 * Anything else — another platform, a staged run, a failed one, a hand-run CLI
 * release with no row, a refusal that is not about a missing pointer — is
 * rendered as it stands.
 */
export function candidatePredatesLatest(
  candidate: ReleaseCandidate,
  latest: ReleaseRun | null,
  platform: PlatformTag,
): boolean {
  if (
    latest === null ||
    latest.status !== "succeeded" ||
    latest.kind !== "candidate" ||
    latest.platform !== platform ||
    latest.target !== "web"
  ) {
    return false;
  }
  const { resolution } = candidate;
  if (resolution.ok) {
    return (
      resolution.runId !== latest.id &&
      Date.parse(resolution.manifest.builtAt) < latest.startedAt.getTime()
    );
  }
  const refusal = resolution.refusal.kind;
  return (
    (refusal === "no-releases" || refusal === "no-pointer") &&
    latest.finishedAt !== null &&
    candidate.observedAt.getTime() < latest.finishedAt.getTime()
  );
}
