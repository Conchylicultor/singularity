# Remove `push_and_exit_jobs` DB table, replace with in-memory Map

## Context

The push-and-exit plugin used to have a durable watcher job (`push-and-exit-job.ts`) that polled for turn completion. That was removed in `eda31b52`, but the DB table it justified (`push_and_exit_jobs`) was left behind. Today the table is purely an ephemeral signaling channel — rows are created on POST, updated to a terminal state by MCP tools, and DELETEd by the UI moments later. No durability is needed. An in-memory `Map<string, JobState>` is simpler, eliminates the orphan-recovery problem, and follows the existing `fork-errors.ts` precedent.

## Changes

### 1. Delete `tables.ts`

Remove `server/internal/tables.ts` entirely. This unregisters the Drizzle schema so `./singularity build` auto-generates a DROP TABLE migration.

### 2. Rewrite `state.ts` — in-memory Map

Replace the DB-backed resource with a module-level `Map<string, JobState>`. Remove all drizzle/DB imports. Expose focused helpers (`setStatus`, `hasRunning`, `clearJob`, `startJob`) that mutate the Map and call `notify()`. Remove the dead `readStatus` function (no callers since the watcher job was removed).

### 3. Simplify `handle-start.ts`

Replace the DB SELECT guard + INSERT/upsert with `hasRunning()` + `startJob()` from `state.ts`. Add a try/catch around `sendTurn` to call `setStatus(id, "error", ...)` on failure (fixes a pre-existing bug where a failed sendTurn left a stale `running` entry).

### 4. Simplify `handle-cancel.ts`

Replace DB DELETE with `clearJob()` from `state.ts`.

### 5. Simplify `server/index.ts`

Remove `onReady` boot recovery (empty Map on start = button resets naturally — better UX than the old error toast). Remove DB/table imports.

### 6. Migration

`./singularity build` generates a `DROP TABLE "push_and_exit_jobs"` migration. Commit it alongside the code changes.

## Files unchanged

- `mcp-tools.ts` — calls `setStatus()` whose signature is unchanged
- `exit-clean-finalize-job.ts` — no table dependency
- `prompt.ts`, `shared/`, `web/` — no DB awareness

## Boot recovery

**Before:** `onReady` marks orphaned `running` rows as `error` → UI shows an unhelpful error toast.
**After:** Map is empty on start → UI sees no job → button resets to idle. User can just click Push & Exit again. Strictly better UX.

## Verification

1. `./singularity build` passes, generates DROP TABLE migration
2. Push & Exit → "Pushing..." → Claude pushes → toast / flag dialog works
3. Push & Exit then Stop → button reverts to idle
4. Server restart mid-push → button resets, no stuck state
5. Double-click guard → second POST returns 409
