import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { TERMINAL_MENU_WAITING_FOR } from "@plugins/conversations/plugins/terminal-menu/core";
import { TerminalMenuCard } from "./components/terminal-menu-card";
import { MenuRelay } from "./slots";

export { MenuRelay } from "./slots";
export type { MenuVariantProps } from "./variant-props";

export default {
  description:
    "Answers the numbered menu open in a conversation's terminal from the web: owns the transcript's `\"menu\"` pending prompt — a card with the menu's title and one button per option, plus Cancel — and the MenuRelay.Variant slot, through which a plugin gives a menu it knows its own look.",
  slots: MenuRelay,
  contributions: [
    JsonlViewer.PendingPrompt({
      match: TERMINAL_MENU_WAITING_FOR,
      component: TerminalMenuCard,
    }),
  ],
} satisfies PluginDefinition;
