import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { launchPromptsConfig } from "../shared/config";
import { LaunchPromptsButton } from "./components/launch-prompts-button";

export default {
  description:
    "Pre-configured prompts that launch a new background conversation in the same worktree.",
  contributions: [
    Conversation.PromptBar({ id: "launch-prompts", component: LaunchPromptsButton, section: "Launch", sectionOrder: 2 }),
    ConfigV2.WebRegister({ descriptor: launchPromptsConfig }),
  ],
} satisfies PluginDefinition;
