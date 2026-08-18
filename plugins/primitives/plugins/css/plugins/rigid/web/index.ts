import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Rigid, rigidClass, type RigidProps } from "./internal/rigid";

export default {
  description:
    "Rigid-leaf layout primitive: <Rigid> / rigidClass() is the flex child that never shrinks (shrink-0). The missing half of <Fill>, kept a sibling the way <Clip> is to <Scroll>.",
  contributions: [],
} satisfies PluginDefinition;
