import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const DirEntrySchema = z.object({
  name: z.string(),
  isDirectory: z.boolean(),
});

/**
 * Browse a host directory.
 *
 * With no `path`, resolves to the user's home directory — the natural starting
 * point for picking a folder. Returns the resolved absolute `path`, its
 * `parent` (null at the filesystem root), whether the path `exists` and
 * `isDirectory` (which together drive the validity indicator), and the
 * directory's immediate sub-`entries` (directories first) for drill-down.
 *
 * A path that does not exist is a legitimate result (`exists: false`), not an
 * error — the UI renders it as an invalid-path indicator. Permission errors
 * surface as 403; anything unexpected propagates (fail loudly).
 */
export const browseHostDir = defineEndpoint({
  route: "GET /api/primitives/folder-picker/browse",
  query: z.object({ path: z.string().optional() }),
  response: z.object({
    path: z.string(),
    parent: z.string().nullable(),
    exists: z.boolean(),
    isDirectory: z.boolean(),
    entries: z.array(DirEntrySchema),
  }),
});
