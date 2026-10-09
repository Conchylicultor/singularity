import type { Standing } from "@plugins/tasks/plugins/attempt-work/core";

/**
 * When closing a conversation may drop its task, by who asked for the close.
 *
 * - `"unless-landed"` — the user picked Drop & Close from the exit menu. Only
 *   work already in `main` makes the task "complete"; committed-but-unmerged
 *   work (a push that never finished) is still not landed, so the task drops.
 *   Dropping only flips the task's status — the branch and its commits stay.
 * - `"only-if-no-work"` — the agent-driven `exit_clean` close. No human chose to
 *   drop, so any work at stake (pending or landed) keeps the task `attempted`.
 */
export type DropPolicy = "unless-landed" | "only-if-no-work";

/** Whether a close under `policy` drops a task whose attempt stands at `standing`. */
export function dropsTask(standing: Standing, policy: DropPolicy): boolean {
  switch (policy) {
    case "unless-landed":
      return standing !== "landed";
    case "only-if-no-work":
      return standing === "none";
  }
}
