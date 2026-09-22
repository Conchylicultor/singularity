import { MdCallSplit, MdHistory, MdUndo } from "react-icons/md";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { RowActionButton } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/row-actions/web";
import { setConversationPromptDraft } from "@plugins/conversations/plugins/conversation-view/plugins/prompt-input/web";
import { useGoBackToMessage } from "../hooks/use-go-back";

/**
 * On each of the user's own messages: go back to just before it, either in this
 * conversation ("Rewind to here") or in a new one ("Fork from here"). The
 * message's text lands in the prompt editor either way, ready to be rewritten.
 */
export function RewindAction({ event }: { event: JsonlEvent }) {
  const { convId } = conversationPane.useParams();
  const { available, busy, run } = useGoBackToMessage({
    convId,
    uuid: event.kind === "user-text" ? event.uuid : undefined,
    onBack: setConversationPromptDraft,
  });

  if (!available) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <RowActionButton title="Go back to this message">
            <MdHistory className="size-3" />
          </RowActionButton>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={busy} onClick={() => void run("rewind")}>
          <MdUndo />
          Rewind to here
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onClick={() => void run("fork")}>
          <MdCallSplit />
          Fork from here
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
