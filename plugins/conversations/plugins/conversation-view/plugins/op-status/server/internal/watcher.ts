import { mkdirSync } from "node:fs";
import { createFileWatcher, type FileWatcher } from "@plugins/infra/plugins/file-watcher/server";
import { worktreesDir } from "@plugins/infra/plugins/worktree/server";
import { worktreeOpsResource } from "./resource";

let watcher: FileWatcher | null = null;
let started = false;

// Watch the op-marker tree (~/.singularity/worktrees/<slug>/ops/<op>.json) and
// push a resource update on every change. Markers are written/cleared by the
// build/push CLI processes (a separate process from the server), so a watcher
// is the push-based way to surface them — mirrors @plugins/infra/git-watcher.
export async function startOpWatcher(): Promise<void> {
  if (started) return;
  started = true;

  const root = worktreesDir();
  // Subscribe never fails on a missing dir: ensure it exists at boot.
  mkdirSync(root, { recursive: true });

  watcher = await createFileWatcher({
    dirs: [root],
    extensions: [".json"],
    onChange: () => worktreeOpsResource.notify(),
    onReconcile: () => worktreeOpsResource.notify(),
  });
}

export async function stopOpWatcher(): Promise<void> {
  if (!started) return;
  started = false;
  if (watcher) {
    await watcher.stop();
    watcher = null;
  }
}
