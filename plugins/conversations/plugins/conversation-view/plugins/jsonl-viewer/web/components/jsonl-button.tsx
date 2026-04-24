import { useEffect, useRef } from "react";
import { MdDataObject } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { usePaneMatch } from "@plugins/pane/web";
import { Button } from "@/components/ui/button";
import { convJsonlPane } from "../panes";

export function JsonlButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const match = usePaneMatch();
  const isOpen =
    match?.chain.some((e) => e.pane === convJsonlPane._internal) ?? false;

  // Auto-open the JSONL pane when landing on a conversation with no sub-pane.
  // Runs at most once per conversation id — if the user closes it, we don't
  // re-open on re-render.
  const leafPane = match?.chain[match.chain.length - 1]?.pane;
  const leafIsConv = leafPane === conversationPane._internal;
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoOpenedRef.current === conversation.id) return;
    if (!leafIsConv) return;
    autoOpenedRef.current = conversation.id;
    convJsonlPane.open({ convId: conversation.id });
  }, [conversation.id, leafIsConv]);

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="JSONL transcript"
      aria-label="JSONL transcript"
      aria-pressed={isOpen}
      onClick={() =>
        isOpen
          ? convJsonlPane.close()
          : convJsonlPane.open({ convId: conversation.id })
      }
      className="gap-1.5"
    >
      <MdDataObject className="size-4" />
    </Button>
  );
}
