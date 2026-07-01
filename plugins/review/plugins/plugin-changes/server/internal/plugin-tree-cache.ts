import {
  buildPluginTree,
  type PluginTree,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { createGitStateMemo } from "@plugins/infra/plugins/git-read-cache/server";
import { withHeavyReadSlot } from "@plugins/infra/plugins/host-read-pool/server";
import { lastKnownMainSha } from "@plugins/infra/plugins/git-watcher/server";
import { runGit } from "@plugins/primitives/plugins/commit-list/server";
import { currentGeneration } from "@plugins/conversations/plugins/conversation-view/plugins/code/server";

// buildPluginTree is a build-time primitive: a fully synchronous recursive
// readdirSync walk over hundreds of plugin dirs plus per-node facet extraction
// (several facets walk every .ts file in the repo). It blocks the event loop
// for tens of seconds. computePluginChanges only needs the two trees, so each
// side is memoized independently here on a cheap, ungated signature — an
// unchanged side is a pure cache hit that does zero work and takes no heavy
// slot. The signatureFn stays ungated; the computeFn owns withHeavyReadSlot, so
// hits skip the gate entirely (cf. commits-graph compute-graph.ts).

// MAIN tree: keyed by the (constant) mainPluginsDir → a single cache entry,
// shared across every conversation on this backend, with backend-wide
// single-flight. Signature = main's HEAD sha, so the main tree is rebuilt only
// when main actually advances — never on a worktree file save. When a main
// advance fans out via refHeadResource to N active reviews, they all coalesce
// onto ONE rebuild.
const mainTreeMemo = createGitStateMemo<PluginTree>({
  name: "review.plugin-changes.main-tree",
});

export function getMainPluginTree(mainPluginsDir: string): Promise<PluginTree> {
  return mainTreeMemo.get(
    mainPluginsDir,
    async () =>
      lastKnownMainSha() ??
      (await runGit(["rev-parse", "main"], mainPluginsDir))?.trim() ??
      "",
    () =>
      withHeavyReadSlot(() =>
        buildPluginTree(mainPluginsDir, { skipBarrelImport: true, facets: true }),
      ),
  );
}

// WORKTREE tree: keyed by worktreePath. Signature = the edited-files generation
// counter — monotonic, bumped on every completed worktree recompute, and never
// bumped by a bare ref advance (the @parcel watcher fires on worktree
// filesystem events only). So a refHead fan-out (only main moved) is a pure hit
// here, while any real worktree edit bumps the generation → miss → rebuild.
// Faithful and never stale: a stale tree would require a worktree file change
// that did NOT bump the generation, which cannot happen.
const worktreeTreeMemo = createGitStateMemo<PluginTree>({
  name: "review.plugin-changes.worktree-tree",
});

export function getWorktreePluginTree(
  worktreePath: string,
  worktreePluginsDir: string,
): Promise<PluginTree> {
  return worktreeTreeMemo.get(
    worktreePath,
    () => Promise.resolve(String(currentGeneration(worktreePath))),
    () =>
      withHeavyReadSlot(() =>
        buildPluginTree(worktreePluginsDir, { skipBarrelImport: true, facets: true }),
      ),
  );
}
