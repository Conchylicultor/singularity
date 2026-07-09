import type { EditedFile } from "../../core/protocol";
import { editedFilesMemo } from "./edited-files-cache";

// The READ path — the `loader` half of the signed memo whose other half,
// `editedFilesMemo.signature`, is the resource's `revalidate`. Both come from one
// declaration (edited-files-cache.ts), so the ETag and the value are provably the
// same authority over the same inputs; they cannot drift.
//
// `get` probes the cheap, ungated content signature on every call:
//   - HIT (git state unchanged since the cached value — e.g. a fresh conversation
//     subscribing to an already-watched worktree, or the watcher primed it):
//     returns the cached list with NO git diff and NO heavy slot.
//   - MISS (any commit, main advance, or working-tree save): computes once via the
//     memo's embedded per-worktree single-flight.
//
// Concurrent identical reads collapse onto one git batch via that inflight: the
// edited-files loader, the watcher's first-subscribe load, and the plugin-changes
// endpoint all call this for the same worktree, often at the same instant during a
// review. See research/2026-06-15-global-live-state-cascade-contention.md
// (Change 5), research/2026-06-16-global-host-wide-cpu-admission-flock-broker.md,
// and research/2026-07-09-global-etag-value-coproduction.md.
export function getEditedFiles(worktreePath: string): Promise<EditedFile[]> {
  return editedFilesMemo.get(worktreePath);
}
