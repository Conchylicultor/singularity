# Slow Ops → Cluster: progressive streaming + determinate progress

## Problem

`GET /api/slow-ops/cluster` fans out across every worktree Postgres fork
(`listDatabases()` → `openShortLivedClient` → `SELECT … FROM slow_ops`, bounded
to 6 concurrent). It uses `implement()` (one-shot JSON) and `Promise.all`, so the
response is withheld until **all** worktrees settle — 20s+ in a many-worktree
environment. The client (`ClusterView`) calls `useEndpoint` (fetch-on-mount,
blocks on `res.json()`), so for the entire wait it shows a bare `<Loading/>`:
no progress, no partial results, no idea how many worktrees are being scanned.

## Design

Stream per-worktree results as NDJSON; render the aggregate + timeline
progressively as worktrees arrive; show a **determinate** "scanning X / N" bar.

### 1. Promote NDJSON streaming to a shared primitive

There is already an NDJSON streaming pattern, but it is **plugin-private** inside
`worktree-cleanup` (`shared/ndjson.ts` = `ndjsonResponse`, `web/internal/read-ndjson.ts`
= `readNdjson`). A second consumer (this work) makes duplication the wrong call.
Promote it to `plugins/infra/plugins/ndjson-stream/`:

- `server/index.ts` → `ndjsonResponse(produce)` — wraps a frame-emitting producer
  in an `application/x-ndjson` `ReadableStream` `Response`. Universal Web APIs only.
- `web/index.ts` → `readNdjson(route, url, init?)` — async generator yielding one
  parsed JSON frame per line; guards `res.ok`, reports via `EndpointError`.

Migrate **both** consumers (worktree-cleanup + slow-ops cluster) to import from
the primitive; delete the worktree-cleanup private copies.

`readNdjson` uses raw `fetch` (streaming can't go through `fetchEndpoint`'s
single-JSON-response model), which the `no-raw-web-fetch` lint rule forbids
except for an allowlist in `plugins/infra/plugins/endpoints/lint/index.ts`. Move
the existing `worktree-cleanup/.../read-ndjson.ts` allowlist entry to the new
primitive's `web/**` (it is now the sanctioned streaming-reader primitive). This
is the rule's documented extension point — the only edit to a load-bearing plugin.

### 2. Stream the cluster fan-out

Frame protocol:
- `{ total: number }` — emitted first (after `listDatabases()`), the denominator.
- `{ worktree: ClusterWorktree }` — one per worktree, as each `fetchWorktree` resolves.
- `{ end: true }` — terminal sentinel (client detects a truncated stream).
- `{ error: string }` — auto-framed by `ndjsonResponse` on producer throw.

`shared/endpoints.ts`: drop the `response:` schema from `getSlowOpsCluster` (now
streamed); keep `ClusterWorktreeSchema` / `ClusterWorktree` exported — the client
validates each `worktree` frame with it.

`server/internal/handle-cluster.ts`: `handleSlowOpsCluster` becomes a raw
`(): Response => ndjsonResponse(async (emit) => { … })`. Emit `{ total }`, then
fan out with the same `createSemaphore(6)`, emitting `{ worktree }` as each
resolves, then `{ end: true }`. `fetchWorktree`/`toSlowOp` unchanged. (JS is
single-threaded so concurrent `emit()` calls are safe.)

### 3. Progressive UX

`web/internal/use-cluster-stream.ts` — a hook owning an `AbortController`, the
accumulating `worktrees[]`, `total`, and `status` (`streaming|done|error`).
`reload()` aborts any in-flight stream, resets, and consumes `readNdjson`,
parsing each `worktree` frame with `ClusterWorktreeSchema`. Throws on a missing
terminal sentinel. Aborts on unmount. Returns
`{ worktrees, total, status, error, reload }`.

`web/components/cluster-view.tsx`:
- Replace `useEndpoint`/`useEndpointMutation` with `useClusterStream()`.
- Aggregate/timeline/failed derive from the accumulating `worktrees` — they grow
  live as frames arrive.
- Header shows a determinate `<ScanProgress received total />` bar while
  `status === "streaming"`, then the existing "N merged · M failed" summary.
- Render the two `DataView`s as soon as there is ≥1 worktree (no all-or-nothing
  `<Loading/>` gate). Before the first frame, show the progress bar (0 / total or
  indeterminate until `total` arrives).
- Refresh button → `reload`, busy while streaming.

`ScanProgress`: small local presentational component (no determinate `Progress`
primitive exists in ui-kit) — token-colored track + fill, `rounded-full`, width
driven by `received/total` percentage, with a "Scanning worktrees… X / N" label.

## Out of scope / follow-ups

- A reusable determinate `Progress` primitive in ui-kit (only an inline bar here).
- A typed `useNdjsonStream` React hook in the primitive (consumers still own
  accumulation; their needs differ — batched flush vs. progress denominator).
