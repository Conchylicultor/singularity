import { resolve } from "node:path";
import {
  defineFileWatcher,
  type FileChangeEvent,
} from "@plugins/infra/plugins/file-watcher/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { runGit } from "@plugins/primitives/plugins/commit-list/server";
import { fileExplorerGitStatus, type GitStatus } from "../../shared/resources";
import {
  indexGitStatus,
  relativeTo,
  type GitStatusIndex,
} from "../../shared/status-index";
import { assertCheckoutRoot } from "./checkout";
import { gitStatusMemo } from "./status";

/** Open only while a browser shows a folder of the checkout (see below). */
export const gitStatusWatcher = defineFileWatcher({
  name: "file-explorer.git-status",
  description:
    "While the file explorer shows a folder inside a git checkout, watches the checkout and its git dir so a save, a stage or a commit updates its git badges at once.",
  debounceMs: 300,
  ceilingMs: 3000,
  // Relative to each watched dir. Object writes always come with an index or
  // ref change, and other worktrees' git dirs are theirs.
  ignore: [
    "**/node_modules/**",
    ".git/objects/**",
    ".git/logs/**",
    ".git/worktrees/**",
  ],
});

/**
 * The last status served per root, indexed — so a change inside a folder git
 * ignores (a build writing `.cache/`, another worktree under `.claude/`) is
 * dropped before it costs a recompute.
 */
const lastIndex = new Map<string, GitStatusIndex>();

/**
 * Whether a change can move the status. Inside the checkout, an ignored path
 * cannot (its own appearance aside, which a later change reconciles); in the
 * git dir, everything can.
 */
function matters(root: string, event: FileChangeEvent): boolean {
  const rel = relativeTo(root, event.path);
  if (rel === null || rel === ".git" || rel.startsWith(".git/")) return true;
  return !(lastIndex.get(root)?.isIgnored(rel) ?? false);
}

/** The git dirs to watch beside `root`: a linked worktree keeps them elsewhere. */
async function gitDirsOutside(root: string): Promise<string[]> {
  const out = await runGit(
    ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
    root,
  );
  const [gitDir = "", commonDir = ""] = out.split("\n");
  return [gitDir, resolve(commonDir, "refs")].filter(
    (dir) => dir !== "" && relativeTo(root, dir) === null,
  );
}

async function loadGitStatus({ root }: { root: string }): Promise<GitStatus> {
  await assertCheckoutRoot(root);
  const status = await gitStatusMemo.get(root);
  lastIndex.set(root, indexGitStatus(status));
  return status;
}

/**
 * A checkout's git status, pushed. The truth is the working tree and the git
 * dir, written by any process (an editor, an agent, `git commit`), so the push
 * comes from a watcher on both for as long as anyone is subscribed — never a
 * poll. External, and bounded by what changed in the checkout.
 */
export const gitStatusServed = serveValue(fileExplorerGitStatus, {
  source: "external",
  loader: loadGitStatus,
  revalidate: async ({ root }) => {
    await assertCheckoutRoot(root);
    return gitStatusMemo.signature(root);
  },
  whileSubscribed: async ({ root }, notify) => {
    await assertCheckoutRoot(root);
    const watcher = await gitStatusWatcher.start({
      dirs: [root, ...(await gitDirsOutside(root))],
      label: root,
      onChange: (events) => {
        if (events.some((e) => matters(root, e))) notify();
      },
    });
    return () => {
      lastIndex.delete(root);
      gitStatusMemo.evict(root);
      void runTracked("file-explorer-git:watcher-stop", () => watcher.stop());
    };
  },
});
