import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigDetail } from "@plugins/config_v2/plugins/settings/web";
import { PromoteDefaultAction } from "./components/promote-default-action";

export default {
  description:
    "Generic 'Set as default for everyone' action in the config settings detail pane: stages the descriptor's current user-layer document as a committed git default (review-pane apply lands it). Contributed into ConfigDetail.Action, so config_v2/settings stays ignorant of staging.",
  contributions: [
    ConfigDetail.Action({
      id: "promote-default",
      component: PromoteDefaultAction,
    }),
  ],
} satisfies PluginDefinition;
