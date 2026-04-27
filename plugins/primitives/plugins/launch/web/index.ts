import type { PluginDefinition } from "@core";
export { LaunchButtons, type LaunchButtonsProps, type LaunchRequest } from "./components/launch-buttons";

export default {
  id: "launch",
  name: "Launch",
  description: "Reusable Sonnet/Opus launch buttons for creating conversations.",
  contributions: [],
} satisfies PluginDefinition;

