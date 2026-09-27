import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { liveCollection, liveValue } from "@plugins/network/plugins/live/core";

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

// The `release_runs` rows, read by id: a lookup-only collection (no default
// window yet), so it mints `release.runs:rows` alone. The run-detail pane's
// sections each read their run with `useLiveRow(releaseRuns, runId)` — any run,
// regardless of age — and `found: false` is "no such run". The `:rows` point
// routing sends a status flip to that run's readers alone.
//
// Plural on purpose: a composition-scoped window (`default` / `sortable` /
// `filterable` by composition) can later join this SAME declaration and retire
// the `queryReleaseHistory` keyset endpoint and the revision tick below.
//
// NOT preloaded (a lookup-only collection cannot be; the run-detail pane lives
// deep in Studio, not first paint). The server projects exactly this schema's
// keys, so `pid` — absent here — never reaches the wire.
export const releaseRuns = liveCollection("release.runs", {
  row: ReleaseRunSchema,
  id: "id",
});

// Scalar invalidation tick: a cheap `{ rev }` hash the server pushes only when a
// real change lands (new run / status flip). The composition-scoped release-history
// DataView keeps it OUT of its query key and instead refetches the loaded window in
// place when `rev` changes. Browser-safe descriptor; the server half (loader + push
// mode) is built from it via `defineResource`. Not preloaded (mirrors
// `conversationsRevisionResource` — the section lives deep in a detail pane).
export const releaseRunsRevisionResource = resourceDescriptor<{ rev: string }>(
  "release.history-revision",
  z.object({ rev: z.string() }),
  { rev: "" },
);

// One running (or stopping) preview of a release run's artifact.
export const PreviewSchema = z.object({
  runId: z.string(),
  status: z.enum(["running", "stopped"]),
  port: z.number().int(),
  url: z.string(),
});

export type Preview = z.infer<typeof PreviewSchema>;

// In-memory preview state, keyed by runId. Truth lives in the server's preview
// manager (an in-memory Map), not Postgres, so the server serves it from the
// external arm (`releasePreviewsServed.notify()` on every start / stop / reap).
// Bounded by the live preview processes, so no `unbounded` reason. No
// placeholder: before the first value lands the read is `pending`, never an
// empty record claiming "no previews".
//
// `preload: "boot"` is parity with the resource it replaces; its one reader is
// a Studio pane, which is why `web/internal/register.ts` pulls this module into
// the eager web import graph.
export const releasePreviews = liveValue("release.previews", {
  schema: z.record(z.string(), PreviewSchema),
  preload: "boot",
});
