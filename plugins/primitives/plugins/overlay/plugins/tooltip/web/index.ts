import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Kbd, type KbdProps } from "./components/kbd";
export { WithTooltip, type WithTooltipProps } from "./components/with-tooltip";

export default {
  description: "WithTooltip wrapper and <Kbd> keyboard shortcut badge.",
  contributions: [],
} satisfies PluginDefinition;
