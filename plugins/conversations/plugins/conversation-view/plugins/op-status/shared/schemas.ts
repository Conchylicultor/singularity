import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";
import { OP_KIND_IDS } from "@plugins/infra/plugins/worktree/core";

export const WorktreeOpSchema = z.object({
  slug: z.string(),
  // The marker's kind — the one `OP_KINDS` vocabulary, so a kind added there is
  // accepted on the wire here with no second list to update.
  op: z.enum(OP_KIND_IDS),
  startedAt: z.string(),
  phase: z.enum(["waiting-for-lock", "running"]),
  // The instant this op's running phase began (its lock was granted). null while
  // waiting. Builds/checks stamp it into the marker on the grant; pushes derive
  // it from the holder file. Lets the banner clock work separately from the time
  // spent queued for the lock.
  runningAt: z.string().nullable(),
});
export type WorktreeOp = z.infer<typeof WorktreeOpSchema>;

// Map of worktree slug → its in-flight op. At most one op per worktree (push
// wins over build when both somehow run at once).
export const WorktreeOpsPayloadSchema = z.record(z.string(), WorktreeOpSchema);
export type WorktreeOpsPayload = z.infer<typeof WorktreeOpsPayloadSchema>;

// Every worktree's in-flight op, as ONE value: its truth is the op-marker
// files on disk, not Postgres, so the server serves it from the external arm
// (the marker watcher calls `notify()`). Bounded by the live worktrees, so no
// `unbounded` reason. `preload: "boot"`: the boot snapshot hydrates it, so the
// banner and the sidebar chips paint settled on the first frame. No
// placeholder — before a value lands the read is `pending`, never an empty map
// claiming "nothing is running".
export const worktreeOps = liveValue("worktree-ops", {
  schema: WorktreeOpsPayloadSchema,
  preload: "boot",
});
