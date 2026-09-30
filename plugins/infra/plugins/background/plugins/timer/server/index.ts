import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { timersBackgroundKind } from "./internal/define";

export { defineTimer } from "./internal/define";
export type { ServerTimerSpec } from "./internal/define";
export type { Timer, TimerSpec } from "../shared/timer";

export default {
  description:
    "defineTimer (server): the one sanctioned in-process interval for a worktree backend — each tick a timer:<name> span, recorded in memory (last run, failures, a recent ring), a failing tick rethrown for the reports plugin to file — and the `timer` background kind that lists every registered timer under Timers in Debug → Background activity. Allowed only at the call sites its lint rule lists, each with a reason: work on a schedule is a job.",
  register: [timersBackgroundKind],
} satisfies ServerPluginDefinition;
