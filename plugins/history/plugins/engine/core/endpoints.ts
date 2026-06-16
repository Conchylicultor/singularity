import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { VersionSchema, VersionWithSnapshotSchema } from "./schemas";

// Version metadata for one entity, newest first. No snapshot blobs — the
// timeline is cheap to list. `sourceId`/`entityId` come from the path.
export const listVersions = defineEndpoint({
  route: "GET /api/history/:sourceId/:entityId/versions",
  response: z.array(VersionSchema),
});

// A single version, including its opaque per-source snapshot payload.
export const getVersion = defineEndpoint({
  route: "GET /api/history/:sourceId/:entityId/versions/:versionId",
  response: VersionWithSnapshotSchema,
});

// Reversible replace: snapshot current state as a "Before restore" undo point,
// then hand the chosen version's snapshot to the source's `restore`.
export const restoreVersion = defineEndpoint({
  route: "POST /api/history/:sourceId/:entityId/versions/:versionId/restore",
  response: z.object({ ok: z.literal(true) }),
});
