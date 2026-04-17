import type { PluginDefinition } from "@core";

const launchPlugin: PluginDefinition = {
  id: "launch",
  name: "Launch",
  description: "Reusable Sonnet/Opus launch buttons for creating conversations.",
  contributions: [],
};

export default launchPlugin;

export { LaunchButtons, type LaunchButtonsProps, type LaunchRequest } from "./components/launch-buttons";
