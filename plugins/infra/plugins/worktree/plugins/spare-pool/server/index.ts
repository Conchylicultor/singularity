import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { spareRefillJob, spareRefillWarmup } from "./internal/refill-job";

export { spareRefillJob } from "./internal/refill-job";

export default {
  description:
    "Spare worktree pool: the worktree.spare-refill job (enqueued after every launch's checkout, at main's boot, and daily) keeps one locked, detached checkout of main ready under .claude/worktrees/spare-*, so setupWorktree claims it with a rename and a branch switch instead of a cold git worktree add.",
  register: [spareRefillJob, spareRefillWarmup],
} satisfies ServerPluginDefinition;
