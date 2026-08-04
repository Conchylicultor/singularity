import { and, desc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import type { ReleaseLatestRunResponse, ReleaseRun } from "../../core";
import { releaseLatestRunEndpoint } from "../../core";
import { _releaseRuns } from "./tables";
import { RELEASE_RUN_WIRE_COLUMNS } from "./wire-columns";

/**
 * The newest run of one composition in this namespace — running, failed or
 * succeeded alike.
 *
 * No status filter, on purpose: "a build of this composition is in flight" and
 * "the last one failed" are the two facts nothing else can answer.
 * `releaseCandidateEndpoint`'s `run` is the *resolved bundle's* run, so it is
 * blind to both by construction.
 *
 * Namespace-scoped because a worktree DB forks main's rows; without it every
 * worktree would report main's runs as its own. `ORDER BY started_at DESC LIMIT
 * 1` over `(namespace, composition)` is exactly the
 * `release_runs_ns_comp_started_idx` prefix — a single index seek, no scan.
 */
export const handleLatestRun = implement(
  releaseLatestRunEndpoint,
  async ({ query }): Promise<ReleaseLatestRunResponse> => {
    const [row] = await db
      .select(RELEASE_RUN_WIRE_COLUMNS)
      .from(_releaseRuns)
      .where(
        and(
          eq(_releaseRuns.namespace, currentWorktreeName()),
          eq(_releaseRuns.composition, query.composition),
        ),
      )
      .orderBy(desc(_releaseRuns.startedAt))
      .limit(1);
    // `null` is an answer, not a failure: a composition that has never been
    // released in this namespace has no newest run. Returned INSIDE the response
    // object so it stays a 200 — see ReleaseLatestRunResponseSchema.
    return { run: (row as unknown as ReleaseRun | undefined) ?? null };
  },
);
