import type { TerminalMenu } from "@plugins/conversations/plugins/terminal-menu/core";

/** What a menu variant is handed: the menu and the two ways to answer it. */
export interface MenuVariantProps {
  conversationId: string;
  menu: TerminalMenu;
  /** Pick option `n`. */
  choose: (n: number) => void;
  cancel: () => void;
  /** The option being sent, or "cancel", while an answer is in flight. */
  pending: number | "cancel" | null;
}
