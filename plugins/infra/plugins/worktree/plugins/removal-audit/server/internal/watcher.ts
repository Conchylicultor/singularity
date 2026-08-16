import { readdir } from "node:fs/promises";
import {
  createFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { recordReport } from "@plugins/reports/server";
import {
  ensureMainWorktreeRoot,
  gitWorktreesDir,
  recentInAppRemovals,
} from "@plugins/infra/plugins/worktree/server";
import {
  CORRELATION_WINDOW_MS,
  classifyDisappearance,
  diffVanished,
} from "./classify";
import { publishDisappearance } from "./channel";
import { captureCandidateProcesses } from "./process-snapshot";
import type { ExternalRemovalPayload } from "./removal-kind";

// The high-churn subtrees, same list the per-worktree edited-files watcher uses.
// We can ignore aggressively because the events are only a TRIGGER: detection is
// the readdir diff below. What we depend on is the final `rmdir` of the
// top-level checkout dir, whose path is a direct child of the watched root and
// therefore matches none of these globs.
const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/.cache/**",
  "**/coverage/**",
];

let watcher: FileWatcher | null = null;
let watchedDir: string | null = null;
let known: Set<string> | null = null;
// Sweeps are serialized: two overlapping readdir diffs would race on `known` and
// could report a disappearance twice or lose one entirely. A flag pair rather
// than a promise chain — a rejected chain would short-circuit every future
// sweep, silently disarming the watcher for the rest of the process's life.
let sweeping = false;
let rerun = false;

async function readCheckoutNames(dir: string): Promise<Set<string>> {
  const entries = await readdir(dir, { withFileTypes: true });
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
}

async function reportExternalRemoval(name: string, dir: string): Promise<void> {
  const probe = await captureCandidateProcesses([name, dir]);
  const payload: ExternalRemovalPayload = {
    name,
    path: `${dir}/${name}`,
    candidates: probe.ok ? probe.candidates : null,
    probeError: probe.ok ? null : probe.reason,
  };
  // The forensic detail goes to the channel...
  publishDisappearance({
    ...payload,
    attribution: "external",
    phase: "candidates",
  });
  // ...and the FACT goes to the reports engine, so it reaches Debug → Reports
  // and the notification bell. A durable line in a JSONL nobody opens is exactly
  // how 22 deleted checkouts went unnoticed for a week. Deduped per worktree
  // name, so a burst collapses onto one task whose count grows.
  await recordReport({
    kind: "worktree-removed-externally",
    source: "server-caught",
    message: `Worktree checkout ${name} was deleted by something outside the app`,
    data: payload,
  });
}

async function sweep(): Promise<void> {
  const dir = watchedDir;
  const before = known;
  if (!dir || !before) return;

  let after: Set<string>;
  try {
    after = await readCheckoutNames(dir);
  } catch (err) {
    // A failed readdir must NEVER be mistaken for evidence — degrading to an
    // empty set here would report every checkout on the box as vanished. Same
    // rule `worktreeListPaths` states for a failed `git worktree list`.
    console.error(
      "[worktree-removal-audit] readdir failed; skipping sweep",
      err,
    );
    return;
  }

  const vanished = diffVanished(before, after);
  known = after;
  if (vanished.length === 0) return;

  const recent = recentInAppRemovals(CORRELATION_WINDOW_MS);
  for (const name of vanished) {
    const verdict = classifyDisappearance(name, recent);
    if (verdict.attribution === "in-app") {
      publishDisappearance({
        name,
        attribution: "in-app",
        claimedByPid: verdict.claimedBy?.pid ?? null,
        claimedByBranch: verdict.claimedBy?.branch ?? null,
        claimedByStartedAt: verdict.claimedBy?.startedAt ?? null,
      });
      continue;
    }
    // Nothing this backend did explains it. Publish the FACT first: the probe
    // and the report can both block, and losing the "a checkout vanished
    // unattributed" record because one of them hung is the exact failure this
    // channel exists to prevent.
    publishDisappearance({
      name,
      attribution: "external",
      path: `${dir}/${name}`,
    });
    await reportExternalRemoval(name, dir);
  }
}

function scheduleSweep(): void {
  if (sweeping) {
    // An event arrived mid-sweep: the diff already in flight read the directory
    // before that change, so one more pass is owed once it finishes.
    rerun = true;
    return;
  }
  sweeping = true;
  // Fire-and-forget with no `.catch`: sweep handles its own expected failures,
  // so anything escaping is unexpected and SHOULD surface as an unhandled
  // rejection (the process hooks file it) rather than be swallowed here. The
  // `finally` still clears the flag, so a one-off throw cannot disarm the
  // watcher for the rest of the process's life.
  void runTracked("worktree-removal-audit:sweep", () =>
    sweep().finally(() => {
      sweeping = false;
      if (rerun) {
        rerun = false;
        scheduleSweep();
      }
    }),
  );
}

/**
 * Start auditing the worktrees parent dir for checkouts that disappear.
 *
 * Main-only: `<repo>/.claude/worktrees` is host-global, so every worktree
 * backend would otherwise watch the same directory and file the same report N
 * times — the same reason the reaper is main-gated.
 */
export async function startWorktreeRemovalAudit(): Promise<void> {
  if (!isMain()) return;
  if (watcher) return;

  const dir = gitWorktreesDir(await ensureMainWorktreeRoot());
  let seed: Set<string>;
  try {
    seed = await readCheckoutNames(dir);
  } catch (err) {
    // Without a baseline no diff is trustworthy, so stay unstarted rather than
    // arm a watcher that would report phantom disappearances.
    console.error("[worktree-removal-audit] cannot seed from", dir, err);
    return;
  }
  watchedDir = dir;
  known = seed;

  watcher = await createFileWatcher({
    dirs: [dir],
    name: "worktree-removal-audit",
    ignore: IGNORE,
    onChange: () => scheduleSweep(),
    // The primitive's own reconcile timer as a backstop for a missed event,
    // exactly as git-watcher relies on it for packed-refs movement. A missed
    // filesystem event would otherwise mean a permanently missed deletion.
    onReconcile: () => scheduleSweep(),
  });
}

export async function stopWorktreeRemovalAudit(): Promise<void> {
  if (!watcher) return;
  await watcher.stop();
  watcher = null;
  watchedDir = null;
  known = null;
}
