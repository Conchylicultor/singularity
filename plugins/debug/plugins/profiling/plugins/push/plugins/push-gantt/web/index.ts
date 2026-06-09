import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  PushGantt,
  type PushGanttProps,
  type PushData,
  type PushEntry,
  type BuildEntry,
  type WorktreeGroup,
} from "./components/push-gantt";

export default {
  description: "Reusable push/build Gantt chart component.",
  contributions: [],
} satisfies PluginDefinition;
