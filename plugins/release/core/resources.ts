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

// Per-id detail resource: one release run resolved by id, regardless of age.
// Exact shape of `taskDetailResource` — parameterized (not keyed), NOT
// bootCritical (the run-detail pane lives deep in Studio, not first paint). The
// server half (`server/internal/release-run-resource.ts`) is `mode:"push"` with
// no `identityTable`, so a status flip on that run re-pushes automatically. It
// replaces scanning the old ambient 50-row window to resolve a run by id.
export const releaseRunResource = resourceDescriptor<ReleaseRun | null, { id: string }>(
  "release.run",
  ReleaseRunSchema.nullable(),
  null,
);

// Scalar invalidation tick: a cheap `{ rev }` hash the server pushes only when a
// real change lands (new run / status flip). The composition-scoped release-history
// DataView keeps it OUT of its query key and instead refetches the loaded window in
// place when `rev` changes. Browser-safe descriptor; the server half (loader + push
// mode) is built from it via `defineResource`. Not bootCritical (mirrors
// `conversationsRevisionResource` — the section lives deep in a detail pane).
export const releaseRunsRevisionResource = resourceDescriptor<{ rev: string }>(
  "release.history-revision",
  z.object({ rev: z.string() }),
  { rev: "" },
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
