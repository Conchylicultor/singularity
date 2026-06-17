import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Center, type CenterProps, type CenterAxis } from "./internal/center";

export default {
  description:
    "Centering layout primitive: <Center axis> centers its content on one or both axes via a grid place-items box.",
  contributions: [],
} satisfies PluginDefinition;
