import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { yieldClass, type YieldAxis } from "./internal/yield";

export default {
  description:
    "Yielding-cell layout primitive: yieldClass(axis) is the flex child that falls below its own content width (min-w-0) but never takes slack. The half of <Fill> that gives, without the half that grows.",
  contributions: [],
} satisfies PluginDefinition;
