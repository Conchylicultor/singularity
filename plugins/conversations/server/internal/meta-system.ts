import path from "node:path";
import {
  createAttempt,
  ensureMetaTask,
  getAttempt,
} from "@plugins/tasks-core/server";

// Sentinel rows for system conversations (kind = "system") that aren't tied
// to a specific user conversation — e.g. yak-shaving's batch rebuild job. One
// task + one attempt total, regardless of how many system conversations run.
//
// Per-target classifiers (yak-shaving classify-conversation) should reuse the
// target conversation's own attemptId instead of these sentinels — they need
// to read the target's worktree anyway.
export const SYSTEM_META_TASK_ID = "task-meta-system";
export const SYSTEM_BATCH_ATTEMPT_ID = "attempt-system-batch";
const TITLE = "System";

export async function ensureSystemMeta(): Promise<void> {
  await ensureMetaTask(SYSTEM_META_TASK_ID, TITLE);
  const existing = await getAttempt(SYSTEM_BATCH_ATTEMPT_ID);
  if (existing) return;
  // Sentinel attempt anchors batch system conversations to a worktree path.
  // Server is launched from `<worktree>/server`, so the worktree root is one
  // level up. System conversations read state via the API/DB, not by
  // inspecting a fresh tree — no `git worktree add` is needed.
  const worktreePath = path.resolve(process.cwd(), "..");
  await createAttempt({
    id: SYSTEM_BATCH_ATTEMPT_ID,
    taskId: SYSTEM_META_TASK_ID,
    worktreePath,
  });
}
