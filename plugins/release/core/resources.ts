import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// WHY a run was cut. `candidate` is packed and built for a named platform — a
// bundle `ship` can pick; `staged` is a `--dev` run that claims no
// `latest-<platform>` pointer and is previewable only. A closed set private to
// the release engine, so it is also the `release_runs.kind` column's decoder
// (see server/internal/tables.ts) — an outsider is a bug, not a value to widen
// for.
export const ReleaseRunKindSchema = z.enum(["staged", "candidate"]);

// Where a run stands. Same closed-set policy as `ReleaseRunKindSchema`, and it
// likewise decodes the `release_runs.status` column.
export const ReleaseRunStatusSchema = z.enum([
  "running",
  "succeeded",
  "failed",
]);

// One release run as seen by the client. Mirrors the `release_runs` table EXCEPT
// `pid` — that is an internal liveness marker (see tables.ts), never part of the
// public resource payload.
export const ReleaseRunSchema = z.object({
  id: z.string(),
  composition: z.string(),
  target: z.string(),
  namespace: z.string(),
  // Stamped from the request's `ReleaseIntent` at claim time. Never null:
  // pre-existing rows read `staged` through the column default, which is what
  // they were.
  kind: ReleaseRunKindSchema,
  status: ReleaseRunStatusSchema,
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date().nullable(),
  exitCode: z.number().int().nullable(),
  platform: z.string().nullable(),
  artifactPath: z.string().nullable(),
  port: z.number().int().nullable(),
  // Provenance of the source tree this run was cut from. Null on runs that never
  // wrote a manifest, and on rows predating provenance. `commitDirty` forces
  // `Staleness.unknown` — the sha names the parent commit, not the bytes.
  commitSha: z.string().nullable(),
  commitDirty: z.boolean().nullable(),
  error: z.string().nullable(),
});

export type ReleaseRun = z.infer<typeof ReleaseRunSchema>;

// Per-id detail resource: one release run resolved by id, regardless of age.
// Exact shape of `taskDetailResource` — parameterized (not keyed), NOT
// bootCritical (the run-detail pane lives deep in Studio, not first paint). The
// server half (`server/internal/release-run-resource.ts`) is `mode:"push"` with
// no `identityTable`, so a status flip on that run re-pushes automatically. It
// replaces scanning the old ambient 50-row window to resolve a run by id.
export const releaseRunResource = resourceDescriptor<
  ReleaseRun | null,
  { id: string }
>("release.run", ReleaseRunSchema.nullable(), null);

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
