import { mkdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { createFileWatcher, type FileWatcher } from "@plugins/infra/plugins/file-watcher/server";
import { worktreesDir } from "@plugins/infra/plugins/worktree/server";
import { worktreeOpsResource } from "./resource";

let watcher: FileWatcher | null = null;
let started = false;

// Only `<slug>/ops/{build,push,check}.json` are op markers. The same tree also
// holds build artifacts written repeatedly during every build
// (`build-profile.json`, `build-logs.json`, `release-logs-*.json`) and gateway
// `<slug>.json` registration files — all directly under `<slug>/`, so their
// parent dir is the slug, not `ops`. Filtering on the parent-dir basename keeps
// artifact churn from firing a full worktree re-scan + no-op push.
const isOpMarker = (p: string) => basename(dirname(p)) === "ops";

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
    // Notify only when a real op marker changed — never on build-artifact churn.
    onChange: (events) => {
      if (events.some((e) => isOpMarker(e.path))) worktreeOpsResource.notify();
    },
    // Fires unconditionally: a rare (30s) watcher-reliability backstop for events
    // parcel may drop, not a change poll.
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
