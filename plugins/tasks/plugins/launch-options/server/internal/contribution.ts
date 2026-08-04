import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { LaunchOptionDef } from "../../core/internal/define";

/**
 * What an apply gets besides the value. Deliberately NOT the task's
 * dependencies: every consumer that gates on them re-queries live rows, so a
 * snapshot passed down here would only be a second, staler truth.
 */
export interface TaskLaunchContext {
  taskId: string;
  /** Provenance threaded into whatever the apply enqueues (`user-launch`, …). */
  cause: string;
}

export interface TaskLaunchApplyEntry<V> {
  /** The same core token the web control declares — the apply's id and schema. */
  def: LaunchOptionDef<V>;
  /** Writes one already-parsed value onto a freshly created task. */
  apply: (ctx: TaskLaunchContext, value: V) => Promise<void>;
}

const ApplyToken = defineServerContribution<TaskLaunchApplyEntry<unknown>>(
  "taskLaunchApply",
  { docLabel: (c) => c.def.id },
);

/** Erases `V` for storage; see the web slot's `contributeOption` for the why. */
function contributeApply<V>(entry: TaskLaunchApplyEntry<V>) {
  return ApplyToken(entry as unknown as TaskLaunchApplyEntry<unknown>);
}

/**
 * Server half of the launch-option registry: how a drafted value is written
 * onto the task the chain endpoint just created. Consumers read only the
 * aggregate — a value whose id has no registered apply is a 400, never a
 * silently dropped setting.
 */
export const TaskLaunchApply = Object.assign(contributeApply, ApplyToken);
