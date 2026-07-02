import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// One release run as seen by the client. Mirrors the `release_runs` table EXCEPT
// `pid` — that is an internal liveness marker (see tables.ts), never part of the
// public resource payload.
export const ReleaseRunSchema = z.object({
  id: z.string(),
  composition: z.string(),
  target: z.string(),
  namespace: z.string(),
  status: z.enum(["running", "succeeded", "failed"]),
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date().nullable(),
  exitCode: z.number().int().nullable(),
  platform: z.string().nullable(),
  artifactPath: z.string().nullable(),
  port: z.number().int().nullable(),
  error: z.string().nullable(),
});

export type ReleaseRun = z.infer<typeof ReleaseRunSchema>;

export const releaseHistoryResource = resourceDescriptor<ReleaseRun[]>(
  "release.history",
  z.array(ReleaseRunSchema),
  [],
  { bootCritical: true },
);

// In-memory preview state, keyed by runId. Truth lives in the server's preview
// manager (an in-memory Map), not Postgres, so the server side is an external
// resource with a callable `notify()`.
export const PreviewSchema = z.object({
  runId: z.string(),
  status: z.enum(["running", "stopped"]),
  port: z.number().int(),
  url: z.string(),
});

export type Preview = z.infer<typeof PreviewSchema>;

export const previewStateResource = resourceDescriptor<Record<string, Preview>>(
  "release.previews",
  z.record(z.string(), PreviewSchema),
  {},
  { bootCritical: true },
);
