import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  OpGantt,
  opFillClass,
  waitFillClass,
  type OpGanttProps,
  type OpData,
  type OpEntry,
  type WorktreeGroup,
} from "./components/op-gantt";

export default {
  description:
    "Reusable op (build / push / check) Gantt: one kind-colored bar per op with each wait painted as an overlay segment at its true in-span offset.",
  contributions: [],
} satisfies PluginDefinition;
