import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
export { LaunchControl, LaunchModelMenuContent, useLaunchConversation, type LaunchControlProps, type LaunchRequest } from "./components/launch-control";
export { LaunchAgentPopover, type LaunchAgentPopoverProps } from "./components/launch-agent-popover";

export default {
  description: "Reusable split [model dropdown | launch] control for creating conversations.",
  contributions: [],
} satisfies PluginDefinition;

