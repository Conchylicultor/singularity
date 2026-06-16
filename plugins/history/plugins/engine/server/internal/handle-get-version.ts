import { and, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { getVersion } from "../../core/endpoints";
import type { VersionWithSnapshot } from "../../core/schemas";
import { _entityVersions } from "./tables";

// A single version with its opaque snapshot. 404s if the version doesn't exist
// for this (source, entity).
export const handleGetVersion = implement(getVersion, async ({ params }) => {
  const [row] = await db
    .select()
    .from(_entityVersions)
    .where(
      and(
        eq(_entityVersions.id, params.versionId),
        eq(_entityVersions.sourceId, params.sourceId),
        eq(_entityVersions.entityId, params.entityId),
      ),
    )
    .limit(1);

  if (!row) throw new HttpError(404, "Version not found");

  return {
    id: row.id,
    sourceId: row.sourceId,
    entityId: row.entityId,
    label: row.label,
    author: row.author,
    pinned: row.pinned,
    createdAt: row.createdAt,
    snapshot: row.snapshot,
  } satisfies VersionWithSnapshot;
});
