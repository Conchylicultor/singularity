import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { convTerminalPane } from "../panes";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const terminalIcon = symbol("terminal");

/**
 * "Open terminal" affordance contributed into the jsonl-viewer's
 * `PendingPromptAction` slot: when a conversation is blocked waiting for input
 * in its terminal, jump straight to the terminal pane. Lives here because
 * terminal-pane owns `convTerminalPane`; the indicator (in jsonl-viewer) can't
 * import it without a cycle.
 */
export function OpenTerminalButton() {
  const { isOpen, toggle } = convTerminalPane.useToggle({});

  if (isOpen) return null;

  return (
    <Button variant="outline" onClick={toggle}>
      <Icon icon={terminalIcon} className="icon-auto" aria-hidden />
      Open terminal
    </Button>
  );
}
