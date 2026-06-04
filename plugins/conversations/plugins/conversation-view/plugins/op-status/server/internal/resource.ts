import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { listActiveWorktreeOps } from "@plugins/infra/plugins/worktree/server";
import {
  WorktreeOpsPayloadSchema,
  type WorktreeOpsPayload,
} from "../../shared";

export const worktreeOpsResource = defineResource<WorktreeOpsPayload>({
  key: "worktree-ops",
  mode: "push",
  schema: WorktreeOpsPayloadSchema,
  loader: () => {
    const out: WorktreeOpsPayload = {};
    for (const info of listActiveWorktreeOps()) {
      // At most one op per worktree slug; push wins over build if both run.
      const existing = out[info.slug];
      if (!existing || (existing.op !== "push" && info.op === "push")) {
        out[info.slug] = info;
      }
    }
    return out;
  },
});
