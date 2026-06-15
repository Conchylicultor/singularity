import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { RefHeadSchema } from "../../shared/types";
import { readSha } from "./read-sha";

type Params = { refName: string };

export const refHeadResource = defineResource<{ sha: string | null }, Params>({
  key: "git-watcher.refHead",
  mode: "push",
  schema: RefHeadSchema,
  // A rebase rewrites refs/heads/main many times in quick succession; the
  // watcher notifies per distinct sha, cascading to mainAheadCount +
  // commitDelta/commitsGraph (git subprocesses) in every worktree. A fixed-window
  // trailing debounce collapses a rebase's rewrites into one flush per worktree —
  // the cross-worktree storm relief. Source is push (not keyed), so debouncing it
  // is safe. See research/2026-06-15-global-live-state-cascade-contention.md (Change 2B).
  debounceMs: 300,
  loader: async ({ refName }) => ({ sha: await readSha(refName) }),
});
