import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  resolveActiveWorktreeOps,
  type WorktreeOp,
} from "@plugins/infra/plugins/worktree/server";
import {
  worktreeOpsResource as worktreeOpsDescriptor,
  type WorktreeOpsPayload,
} from "../../shared";

// Per-slug precedence when a worktree somehow has more than one live marker.
// A real worktree runs one op at a time, so this is a safety tiebreak: a push
// (global-lock-contended, highest stakes) outranks a check, which outranks a
// build. A test or an e2e run contends for the host grant only — never for a
// worktree-shared lock — so it yields the single display slot to the ops that
// do. `Record<WorktreeOp, …>` keeps this complete: a kind without a rank is a
// type error.
const OP_RANK: Record<WorktreeOp, number> = {
  push: 4,
  check: 3,
  build: 2,
  test: 1,
  e2e: 1,
};

export const worktreeOpsResource = defineExternalResource(
  worktreeOpsDescriptor,
  {
    mode: "push",
    // Phases are DERIVED from the real push-lock ownership (holder file + kernel
    // flock), not echoed from each marker's self-asserted phase — see
    // resolveActiveWorktreeOps. This is what makes "two pushing at once" and
    // "all waiting, none running" impossible to display.
    loader: async () => {
      const out: WorktreeOpsPayload = {};
      for (const info of await resolveActiveWorktreeOps()) {
        // At most one op per worktree slug; highest-precedence op wins if several
        // somehow run at once (push > check > build > test, e2e).
        const existing = out[info.slug];
        if (!existing || OP_RANK[info.op] > OP_RANK[existing.op]) {
          out[info.slug] = info;
        }
      }
      return out;
    },
  },
);
