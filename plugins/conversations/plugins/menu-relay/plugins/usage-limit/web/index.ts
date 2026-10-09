import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MenuRelay } from "@plugins/conversations/plugins/menu-relay/web";
import { UsageLimitMenu } from "./components/usage-limit-menu";
import { isUsageLimitMenu } from "./internal/limit-menu";

export default {
  description:
    "Claude Code's usage-limit menu, drawn by the terminal-menu card: when the limit resets (with a countdown) and Wait & continue automatically / Stop / Use usage credits buttons that answer it.",
  contributions: [
    MenuRelay.Variant({
      match: ({ menu }) => isUsageLimitMenu(menu),
      component: UsageLimitMenu,
    }),
  ],
} satisfies PluginDefinition;
