import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { attemptWorkServerResource } from "./internal/resource";

export { attemptWorkServerResource } from "./internal/resource";
export {
  getAttemptWork,
  readLandedShas,
  attemptWorkSignature,
  evictAttemptWork,
} from "./internal/work";
// The pending-side git reads, shared with commits-graph (which measures the same
// branch for its chip and pane). One home, so "ahead of main" is one question with
// one answer.
export {
  readBranch,
  readMergeBase,
  readDeltaCounts,
  refExists,
  probeHeadMain,
  probeRefMain,
  readPendingInWorktree,
  readPendingFromBranchRef,
  readLanded,
} from "./internal/measure";
export { deltaEtag, attemptWorkEtag } from "./internal/etag";

export default {
  description:
    "The attempt-work authority: where an attempt stands relative to `main`, measured from git (branch counts + Singularity-Conversation trailers on main) rather than from the lagging pushes ledger, as one live resource plus a direct read for the server-side exit-drop guard.",
  contributions: [Resource.Declare(attemptWorkServerResource)],
} satisfies ServerPluginDefinition;
