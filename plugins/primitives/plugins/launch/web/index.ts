import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
export {
  LaunchControl,
  LaunchModelMenuContent,
  useLaunchConversation,
  type LaunchControlProps,
  type LaunchRequest,
} from "./components/launch-control";
export {
  LaunchAgentPopover,
  LaunchAgentForm,
  type LaunchAgentPopoverProps,
  type LaunchAgentFormProps,
} from "./components/launch-agent-popover";

export default {
  description:
    "The standard launch-an-agent popover, and the split [model | launch] control under it.",
  contributions: [],
} satisfies PluginDefinition;
