import { MdDataObject } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import {
  ConversationCommands as Conversation,
  useRightPane,
} from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { jsonlRightPane, JSONL_PANE_ID } from "../views";

export function JsonlButton({
  conversation: _conversation,
}: {
  conversation: ConversationRecord;
}) {
  const current = useRightPane();
  const isOpen = current?.id === JSONL_PANE_ID;
  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="JSONL transcript"
      aria-label="JSONL transcript"
      aria-pressed={isOpen}
      onClick={() =>
        Conversation.OpenRightPane(isOpen ? null : jsonlRightPane())
      }
      className="gap-1.5"
    >
      <MdDataObject className="size-4" />
    </Button>
  );
}
