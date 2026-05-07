import type { PluginDefinition } from "@core";

export { TooltipProvider } from "@/components/ui/tooltip";
export { Kbd, type KbdProps } from "./components/kbd";
export { WithTooltip, type WithTooltipProps } from "./components/with-tooltip";

export default {
  id: "tooltip",
  name: "Tooltip",
  description:
    "WithTooltip wrapper, TooltipProvider, and <Kbd> keyboard shortcut badge.",
  contributions: [],
} satisfies PluginDefinition;
