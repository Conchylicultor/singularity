import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _buildRuns } from "@plugins/build/plugins/run-ledger/server";
import type { IdReferent } from "@plugins/ids/server";
import { buildRunTitle } from "../../core";
import { buildRunIdKind } from "@plugins/build/plugins/run-ledger/core";

/** A `build-<id>`'s title (`Build <short commit>`), for text a model reads. */
export async function resolveBuildRunReferent(id: string): Promise<IdReferent> {
  const [run] = await db
    .select({ commitHash: _buildRuns.commitHash })
    .from(_buildRuns)
    .where(eq(_buildRuns.id, buildRunIdKind.key(id)))
    .limit(1);
  return run ? { found: true, title: buildRunTitle(run) } : { found: false };
}
