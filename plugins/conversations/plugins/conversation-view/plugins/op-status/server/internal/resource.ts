import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  resolveActiveWorktreeOps,
  type WorktreeOp,
} from "@plugins/infra/plugins/worktree/server";
import {
  WorktreeOpsPayloadSchema,
  type WorktreeOpsPayload,
} from "../../shared";

// Per-slug precedence when a worktree somehow has more than one live marker.
// A real worktree runs one op at a time, so this is a safety tiebreak: a push
// (global-lock-contended, highest stakes) outranks a check, which outranks a
// build.
const OP_RANK: Record<WorktreeOp, number> = { push: 2, check: 1, build: 0 };

export const worktreeOpsResource = defineExternalResource<WorktreeOpsPayload>({
  key: "worktree-ops",
  mode: "push",
  schema: WorktreeOpsPayloadSchema,
  // Phases are DERIVED from the real push-lock ownership (holder file + kernel
  // flock), not echoed from each marker's self-asserted phase — see
  // resolveActiveWorktreeOps. This is what makes "two pushing at once" and
  // "all waiting, none running" impossible to display.
  loader: () => {
    const out: WorktreeOpsPayload = {};
    for (const info of resolveActiveWorktreeOps()) {
      // At most one op per worktree slug; highest-precedence op wins if several
      // somehow run at once (push > check > build).
      const existing = out[info.slug];
      if (!existing || OP_RANK[info.op] > OP_RANK[existing.op]) {
        out[info.slug] = info;
      }
    }
    return out;
  },
});
