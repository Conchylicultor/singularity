import { MdTerminal } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { convTerminalPane } from "../panes";

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
      <MdTerminal className="icon-auto" aria-hidden />
      Open terminal
    </Button>
  );
}
