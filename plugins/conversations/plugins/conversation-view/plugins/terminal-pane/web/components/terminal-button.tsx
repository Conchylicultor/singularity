import { useEffect, useRef } from "react";
import { MdTerminal } from "react-icons/md";
import { usePaneMatch, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { convTerminalPane } from "../panes";

export function TerminalButton() {
  const { conversation } = conversationPane.useData();
  const match = usePaneMatch();
  const openPane = useOpenPane();
  const isOpen =
    match?.chain.some((e) => e.pane === convTerminalPane._internal) ?? false;

  // Auto-open the terminal pane when landing on a conversation with no
  // sub-pane. Runs at most once per conversation id — if the user closes
  // it, we don't re-open on re-render.
  const leafPane = match?.chain[match.chain.length - 1]?.pane;
  const leafIsConv = leafPane === conversationPane._internal;
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoOpenedRef.current === conversation.id) return;
    if (!leafIsConv) return;
    autoOpenedRef.current = conversation.id;
    openPane(convTerminalPane, { convId: conversation.id });
  }, [conversation.id, leafIsConv, openPane]);

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Terminal"
      aria-label="Terminal"
      aria-pressed={isOpen}
      onClick={() =>
        isOpen
          ? convTerminalPane.close()
          : openPane(convTerminalPane, { convId: conversation.id })
      }
      className="gap-1.5"
    >
      <MdTerminal className="size-4" />
    </Button>
  );
}
