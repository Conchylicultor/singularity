import { useState } from "react";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { ConfigPopoverHeader } from "@plugins/config_v2/plugins/config-link/web";
import { prepromptsConfig } from "@plugins/conversations/plugins/preprompts/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationPreprompt } from "../internal/hooks";
import { PrepromptIcon } from "./preprompt-icon";

// Header chip surfacing the preprompt the conversation's task was launched
// with. Sourced entirely from the conversation's recorded snapshot — clicking
// reveals the full instruction text in a scrollable popover.
export function PrepromptChip() {
  const { convId } = conversationPane.useParams();
  const record = useConversationPreprompt(convId);
  const [open, setOpen] = useState(false);
  if (!record) return null;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Badge
          as="button"
          className="hover:opacity-80"
          aria-label={`Preprompt: ${record.title}`}
          icon={<PrepromptIcon record={record} />}
        >
          <span className="max-w-32 truncate">{record.title}</span>
        </Badge>
      }
      contentClassName="w-80 p-2"
    >
      <ConfigPopoverHeader
        label="Preprompt instructions"
        descriptor={prepromptsConfig}
      />
      <div
        className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-1 text-xs text-muted-foreground"
        aria-label="Preprompt instructions"
      >
        {record.text}
      </div>
    </InlinePopover>
  );
}
