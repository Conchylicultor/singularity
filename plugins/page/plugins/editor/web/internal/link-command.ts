import { createCommand, type LexicalCommand } from "lexical";

/**
 * Editor-level "open the link popover for the current selection" command. The
 * ⌘K shortcut (owned by `FormatShortcutsPlugin`, always mounted) dispatches it;
 * the link toolbar button (mounted only when a range selection shows the bar)
 * listens and opens its popover. Decoupling via a command means the always-on
 * shortcut and the selection-scoped button never import each other.
 */
export const OPEN_LINK_POPOVER_COMMAND: LexicalCommand<void> = createCommand(
  "OPEN_LINK_POPOVER_COMMAND",
);
