import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ActivityRing,
  type Activity,
  type ActivityRingProps,
  type ActivityState,
} from "./internal/activity-ring";

export default {
  description:
    "Activity ring around a status dot: <ActivityRing state> draws a spinning arc on a faint track while background work runs and a broken destructive ring when it failed; null renders the child alone with no reserved box. Sized from the ambient ControlSize's status-dot token, so it scales with the dot it wraps.",
  contributions: [],
} satisfies PluginDefinition;
