import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BootSnapshot } from "@plugins/infra/plugins/boot-snapshot/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { turnSummaryConfig } from "../shared/config";
import { turnSummariesResource } from "../shared/schemas";
import { TurnSummaryCard } from "./components/turn-summary-card";

export default {
  description:
    "Inline card above the prompt input showing a Haiku-generated summary of the latest assistant turn, with caveats and suggested actions.",
  contributions: [
    Conversation.AbovePromptInput({ id: "turn-summary", component: TurnSummaryCard }),
    ConfigV2.WebRegister({ descriptor: turnSummaryConfig }),
    BootSnapshot.Hydrate({ descriptor: turnSummariesResource }),
  ],
} satisfies PluginDefinition;
