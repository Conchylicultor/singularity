import { MdDataObject } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
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
