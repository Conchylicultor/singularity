# Chord trainer — song index, v3: load on first use

Revises [`2026-09-16-apps-chord-trainer-song-index-v2.md`](2026-09-16-apps-chord-trainer-song-index-v2.md)
(data lifecycle). **Everything in v2 still holds except §2, "Loading: at boot, on
every instance"**, which this replaces. v1
([`2026-09-16-apps-chord-trainer-song-index.md`](2026-09-16-apps-chord-trainer-song-index.md))
is unchanged.

**App id: `chord`** (decided 2026-09-17). v1, v2 and this doc were updated in
place: `plugins/apps/plugins/chord/`, tables `chord_*`, endpoints `/api/chord/*`,
data dir `chord/sheetsage`. The doc file names keep "chord-trainer" so existing
links still work.

## Context

v2 loaded the index at every boot, on every instance. So an instance that never
opens the chord trainer still downloads 116 MB, builds a 7 MB snapshot and fills
~100 MB of tables. The user decided (2026-09-17) that the data is fetched **on
first use of the app**, not at boot.

## Design

### Two pieces of state, kept apart

| State | Where | Copied to worktrees / backed up |
|---|---|---|
| **"This instance uses the chord trainer"**: `requestedAt` | `chord_index_request`, one row | **Kept** (small, not rebuildable: it is the user's choice) |
| **"The index is loaded"**: snapshot sha, scope, derivation version | `chord_index_state` (as v2) | Excluded, with the index tables it describes |

The first says the user wants the data. The second says the data is there.
Keeping them in different tables is what lets a restore or a fork know to
reload without the user opening the app again.

### Opening the app

The app shell calls `POST /api/chord/index/ensure` when it mounts. It
is idempotent:

1. Write the request row if missing.
2. If the state row is missing or stale, enqueue `song-index.load` (singleton
   job, v2's steps unchanged: snapshot, scoped load, API documents, state row).

The shell shows the index status from a small live-state resource,
`chord.index-status`, pushed by the load job as it moves through its
phases:

```ts
type IndexStatus =
  | { kind: "not-requested" }
  | { kind: "loading"; phase: "downloading" | "building-snapshot" | "loading"; done?: number; total?: number }
  | { kind: "ready" }
  | { kind: "failed"; error: string };   // with a Retry button that calls ensure again
```

A first open on a new machine shows "Downloading songs (116 MB)…", then
"Preparing…", then "Loading songs 12,000 / 26,175". It takes minutes, once per
machine. A worktree reuses the machine's snapshot and loads its sample in
seconds. Until `ready`, `findLoopWindows` returns the typed "index loading"
state, never an empty list (v2).

Reading the status has no side effect. Only `ensure` starts work, so a Studio
or debug surface that reads the resource never triggers a download.

### At boot

Boot starts the load **only if the request row exists** and the state row is
missing or stale. That covers the cases where the user already chose the app:

- **A version bump** (`INDEX_DERIVATION_VERSION`): the index is rebuilt from the
  snapshot before the user comes back.
- **A restore from backup:** the request row is restored, the index tables are
  empty, so it reloads (from the backed-up snapshot if the download fails).
- **A new worktree** of an instance that uses the app: the request row is copied,
  so the worktree loads its sample at boot, as v2 had it. A worktree forked from
  an instance that never opened the app loads nothing until it is opened there.

An instance whose request row is missing does nothing at boot: no download, no
tables filled, no snapshot backed up.

### Backups

As v2. The snapshot backup source contributes nothing while no snapshot exists,
so an instance that never used the app backs up nothing extra.

## Changes to v2's steps

- Step 5 (`song-index/server`): replace "boot check and load job" with the
  request table, the `ensure` endpoint, the status resource and the conditional
  boot check.
- The app-shell step: call `ensure` on mount and render the status (loading
  phases, failure with Retry).

## Verification (replaces v2's items 1–3)

1. A fresh instance boots: no download, no snapshot, empty tables, no request row.
2. Open the chord trainer: the request row appears, the status goes through its
   three phases to `ready`, and 26,175 sections load. Reloading the page mid-load
   does not start a second job.
3. Restart the server: nothing reloads (state row matches).
4. Bump `INDEX_DERIVATION_VERSION` and restart: the index rebuilds at boot from
   the snapshot, with no download.
5. A new worktree forked after step 2 loads its sample at boot. One forked from a
   fresh instance loads nothing until the app is opened there.
6. Cut the network before the first open: the status shows `failed` with the
   download error; Retry works once the network is back.

## Still open

A brand-new install with no backup depends on the Sheet Sage files staying on
GitHub. Hosting the 7 MB snapshot ourselves would remove that dependency. To be
decided before release.
