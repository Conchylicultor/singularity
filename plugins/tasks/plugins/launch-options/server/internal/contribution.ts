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

/**
 * The server half of ONE launch option — every way this option is written onto
 * a task. Both verbs live on a single entry so an option stays one registration
 * in one plugin folder, and so a verb added later has an obvious home.
 */
export interface TaskLaunchServerEntry<V> {
  /** The same core token the web control declares — the entry's id and schema. */
  def: LaunchOptionDef<V>;
  /** Writes one already-parsed drafted value onto a freshly created task. */
  apply: (ctx: TaskLaunchContext, value: V) => Promise<void>;
  /**
   * Copies this option from a spawning task onto a task it spawned (the
   * task-filing MCP tools). Positional `(from, to)` so a plugin's own
   * `inherit<Option>` mutation registers as a direct function reference.
   *
   * OMITTING THIS IS THE DECLARATION that the option is not inherited — the
   * absence is the opt-out, exactly as an absent `useTaskBinding` marks a web
   * control draft-only. See auto-start, whose apply *arms* a launch: inheriting
   * it would start an agent for every task an agent files.
   *
   * Takes no {@link TaskLaunchContext}: `cause` exists to thread provenance
   * into what an apply enqueues, and an inheritable option enqueues nothing.
   */
  inherit?: (fromTaskId: string, toTaskId: string) => Promise<void>;
}

const ServerToken = defineServerContribution<TaskLaunchServerEntry<unknown>>(
  "taskLaunchServer",
  { docLabel: (c) => c.def.id },
);

/** Erases `V` for storage; see the web slot's `contributeOption` for the why. */
function contributeServer<V>(entry: TaskLaunchServerEntry<V>) {
  return ServerToken(entry as unknown as TaskLaunchServerEntry<unknown>);
}

/**
 * Server half of the launch-option registry: how an option is written onto a
 * task, both when drafted and when inherited. Consumers read only the aggregate
 * — a drafted value whose id has no registered entry is a 400, never a silently
 * dropped setting.
 */
export const TaskLaunchServer = Object.assign(contributeServer, ServerToken);
