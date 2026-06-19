import type { EditedFile } from "../../core/protocol";
import { createGitStateMemo } from "@plugins/infra/plugins/git-read-cache/server";

// ONE module-level memo + generation map, shared between the loader (READER,
// get-edited-files.ts) and the @parcel watcher (WRITER, watch-edited-files.ts).
//
// edited-files has NO SHA-based incrementality: an uncommitted file save changes
// the working-tree diff WITHOUT moving HEAD/main/merge-base, so a git-SHA
// signature would serve STALE data. The signature is instead a MONOTONIC
// GENERATION COUNTER per worktree, bumped by the watcher on every completed
// recompute. The watcher write-throughs its freshly computed list at the new
// generation; the loader reads at the current generation — a hit between file
// changes does zero git work and acquires no heavy slot. This gives coalescing +
// skip-in-flight only (never incremental skip beyond what the watcher does), and
// is never stale: any real change → watcher recompute → generation bump →
// write-through → next read hits the new generation.
//
// See research/2026-06-19-global-incremental-git-loaders.md (Stage 4).
const memo = createGitStateMemo<EditedFile[]>({ name: "edited-files" });
const generation = new Map<string, number>(); // worktreePath -> completed-compute count

export function currentGeneration(worktreePath: string): number {
  return generation.get(worktreePath) ?? 0;
}

function bumpGeneration(worktreePath: string): number {
  const next = currentGeneration(worktreePath) + 1;
  generation.set(worktreePath, next);
  return next;
}

export const editedFilesMemo = memo;

/**
 * Write-through prime from the watcher (the authoritative writer): bump the
 * generation and store the freshly computed list under it, so the next
 * `getEditedFiles` read is a pure cache hit at the new generation.
 */
export function primeEditedFiles(worktreePath: string, files: EditedFile[]): void {
  memo.set(worktreePath, String(bumpGeneration(worktreePath)), files);
}

export function evictEditedFiles(worktreePath: string): void {
  memo.evict(worktreePath);
  generation.delete(worktreePath);
}
