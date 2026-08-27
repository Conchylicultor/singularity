import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import {
  compareToHead,
  resolveBundle,
} from "@plugins/release/plugins/bundles/server";
import type { ReleaseCandidateResponse } from "../../core";
import { releaseCandidateEndpoint } from "../../core";
import { _releaseRuns } from "./tables";
import { RELEASE_RUN_WIRE_COLUMNS } from "./wire-columns";

/**
 * What `ship` would pick for `(composition, platform)`, and where it came from.
 *
 * The split inside this handler is the whole design statement: **the filesystem
 * says whether a shippable bundle exists and matches** (`resolveBundle`, the
 * exact same call `./singularity deploy ship` makes, returning the exact value
 * it acts on) — **the DB says where it came from** (the `release_runs` row).
 * Nothing here re-derives shippability, and a consumer must not either: it
 * renders `bundleRefusalMessage(resolution.refusal)` verbatim.
 *
 * `resolveBundle` deliberately THROWS on a corrupt `RELEASE.json` rather than
 * returning a refusal, and that throw is allowed to reach the client as a 500: a
 * broken artifact is not a refusal a user can act on.
 */
export const handleReleaseCandidate = implement(
  releaseCandidateEndpoint,
  async ({ query }): Promise<ReleaseCandidateResponse> => {
    const resolution = resolveBundle({
      composition: query.composition,
      platform: query.platform,
    });

    if (!resolution.ok) {
      // No bundle ⇒ nothing whose source state could be compared. Reported as
      // `unknown` with the true reason rather than as a null field: staleness is
      // a question about a bundle, and "there isn't one" is an answer, not an
      // absence. The refusal beside it says which of the nine ways it is.
      return {
        resolution,
        run: null,
        staleness: {
          kind: "unknown",
          reason: "there is no shippable bundle to compare — see the refusal",
        },
      };
    }

    // The MANIFEST's provenance, not the row's. They agree by construction (the
    // row copies it off the manifest at completion), but the manifest is the one
    // that always exists: a hand-run `./singularity release` writes a manifest
    // and no row at all.
    const staleness = await compareToHead(resolution.manifest, REPO_ROOT);

    // By PK, unscoped by namespace on purpose: the run id came out of THIS
    // namespace's release dir, so it identifies the run on its own. Missing is
    // expected, not an error — standalone CLI releases are deliberately absent
    // from `release_runs` (the filesystem is their registry).
    const [row] = await db
      .select(RELEASE_RUN_WIRE_COLUMNS)
      .from(_releaseRuns)
      .where(eq(_releaseRuns.id, resolution.runId))
      .limit(1);

    return {
      resolution,
      run: row ?? null,
      staleness,
    };
  },
);
