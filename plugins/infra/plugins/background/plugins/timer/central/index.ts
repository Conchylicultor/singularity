import type { CentralPluginDefinition } from "@plugins/framework/plugins/central-core/core";
import { centralTimersBackgroundKind } from "./internal/define";

export { defineTimer } from "./internal/define";
export type { Timer, TimerSpec } from "../shared/timer";

export default {
  description:
    "defineTimer (central): the in-process interval for the machine-wide central runtime, which has no job queue — each tick a timer:<name> span, recorded in memory, a failing tick logged — and the `central-timer` background kind listing them in the central half of Background activity.",
  register: [centralTimersBackgroundKind],
} satisfies CentralPluginDefinition;
