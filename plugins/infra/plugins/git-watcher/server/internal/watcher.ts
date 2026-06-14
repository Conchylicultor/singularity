import { createFileWatcher, type FileWatcher } from "@plugins/infra/plugins/file-watcher/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { currentBranchRef } from "./current-branch-ref";
import { gitCommonDir } from "./git-common-dir";
import { readSha } from "./read-sha";
import { refAdvanced } from "./tables-ref-advanced";
import { refHeadResource } from "./ref-head-resource";

// Refs whose movement we surface via refHeadResource. Always `refs/heads/main`
// (the refAdvanced trigger event keys off it) plus, in a worktree, that
// worktree's own branch — the ref a local commit / rebase / sync-to-head
// advances. Together these are the only refs whose movement changes a
// commits-graph ahead/behind delta. Computed once at startup.
async function computeTrackedRefs(): Promise<string[]> {
  const refs = ["refs/heads/main"];
  if (!isMain()) {
    const branch = await currentBranchRef();
    if (branch && !refs.includes(branch)) refs.push(branch);
  }
  return refs;
}

const lastKnownSha = new Map<string, string | null>();
let watcher: FileWatcher | null = null;
let started = false;

export async function startGitWatcher(): Promise<void> {
  if (started) return;
  started = true;

  let commonDir: string;
  try {
    commonDir = await gitCommonDir();
  } catch (err) {
    console.error("[git-watcher] cannot resolve git common dir", err);
    return;
  }

  // Seed lastKnownSha without emitting — the watcher's contract is "fire on
  // advance from a known baseline." Consumers run their own startup catch-up
  // for "did anything change while I was down."
  for (const ref of await computeTrackedRefs()) {
    try {
      lastKnownSha.set(ref, await readSha(ref));
    } catch (err) {
      console.error(`[git-watcher] initial readSha(${ref}) failed`, err);
      lastKnownSha.set(ref, null);
    }
  }

  // Watch refs/heads/ (loose refs) and the .git root (packed-refs +
  // HEAD-style files). We filter at recompute time by re-reading every
  // tracked ref via `git rev-parse`.
  watcher = await createFileWatcher({
    dirs: [`${commonDir}/refs/heads`, commonDir],
    onChange: () => { void recompute(); },
    onReconcile: () => { void recompute(); },
  });
}

export async function stopGitWatcher(): Promise<void> {
  if (!started) return;
  started = false;
  if (watcher) { await watcher.stop(); watcher = null; }
}

async function recompute(): Promise<void> {
  for (const refName of lastKnownSha.keys()) {
    let sha: string | null;
    try {
      sha = await readSha(refName);
    } catch (err) {
      console.error(`[git-watcher] readSha(${refName}) failed`, err);
      continue;
    }
    const previousSha = lastKnownSha.get(refName) ?? null;
    if (sha === previousSha) continue;
    lastKnownSha.set(refName, sha);
    refHeadResource.notify({ refName });
    if (sha && isMain()) {
      try {
        await refAdvanced.emit({ refName, sha, previousSha });
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch (err) {
        console.error(`[git-watcher] emit refAdvanced(${refName}) failed`, err);
      }
    }
  }
}
