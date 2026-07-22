import { createFileWatcher, type FileWatcher } from "@plugins/infra/plugins/file-watcher/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { currentWorktreeName, worktreeDataDir } from "@plugins/infra/plugins/paths/server";
import { hasLiveInflightBuild, reconcileOrphanBuilds } from "./run-build";

// A single boot-adopted watch per backend. `./singularity build` restarts the
// very backend that spawned it; the freshly-booted process adopts the still-live
// build here, so a second boot-path call while one watch is armed is a no-op.
let watcher: FileWatcher | null = null;

/**
 * After a mid-build restart, the CLI child survives but the backend that would
 * stamp `build_runs.finished_at` is dead. The new backend's boot reconcile leaves
 * the row open (the CLI pid is still alive), and today nothing closes it until the
 * next unrelated reconcile (next boot / next build claim) — an unbounded lag where
 * the UI shows a phantom running build and the inflight lock stays held.
 *
 * So on boot: if a live in-flight build exists (one that just restarted us), adopt
 * it — arm a short-lived file-watcher on this worktree's build-logs directory. The
 * instant the CLI writes `build-logs-<id>.json` (its atomic-once terminal push
 * signal), reconcile closes the row (<1s) and the watcher self-disposes. The
 * watcher's periodic `reconcileMs` is a bounded safety net for the rare
 * artifact-less hard-kill (build SIGKILLed before finalize): it only ticks while a
 * build is genuinely in-flight and stops the moment the row closes — not a poller.
 */
export async function watchInflightBuild(): Promise<void> {
  // Nothing to adopt: the boot reconcile already closed it, or none exists.
  if (watcher != null || !(await hasLiveInflightBuild())) return;

  const name = currentWorktreeName();

  // Reconcile, then dispose the watcher once no live in-flight build remains.
  async function settle(): Promise<void> {
    await reconcileOrphanBuilds();
    if (!(await hasLiveInflightBuild()) && watcher != null) {
      const w = watcher;
      watcher = null;
      await w.stop();
    }
  }

  watcher = await createFileWatcher({
    dirs: [worktreeDataDir(name)],
    extensions: [".json"],
    // Bounded safety net for an artifact-less hard-kill; stops the instant the
    // row closes, so it never outlives the build it adopted.
    reconcileMs: 60_000,
    name: "build:inflight",
    onChange: () => {
      void runTracked("watch:build:inflight", () => settle());
    },
    onReconcile: () => {
      void runTracked("watch:build:inflight:reconcile", () => settle());
    },
  });

  // Close the subscribe race: the artifact may have landed during
  // `parcel.subscribe` setup, which only reports events *after* subscription.
  // One more reconcile now catches (and disposes on) that missed write.
  await settle();
}
