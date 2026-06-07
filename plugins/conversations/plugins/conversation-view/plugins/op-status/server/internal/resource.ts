import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { resolveActiveWorktreeOps } from "@plugins/infra/plugins/worktree/server";
import {
  WorktreeOpsPayloadSchema,
  type WorktreeOpsPayload,
} from "../../shared";

export const worktreeOpsResource = defineResource<WorktreeOpsPayload>({
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
      // At most one op per worktree slug; push wins over build if both run.
      const existing = out[info.slug];
      if (!existing || (existing.op !== "push" && info.op === "push")) {
        out[info.slug] = info;
      }
    }
    return out;
  },
});
