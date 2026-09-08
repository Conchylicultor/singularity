import { MdInfoOutline } from "react-icons/md";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

interface HookSystemMessagePayload {
  type: "hook_system_message";
  content?: string;
  hookName?: string;
  hookEvent?: string;
  toolUseID?: string;
}

/**
 * A hook printing an informational line — a tip, a reminder — rather than a
 * failure. It is the calm member of the hook family: `hook-success` records an
 * execution (exit code, duration, stderr) and `hook-error` shouts about one
 * that went wrong, but this carries nothing to inspect beyond the sentence
 * itself. So it is an `EventLine`, not a card, and it borrows nothing from the
 * destructive chrome next door — a tip that looks like an error trains the
 * reader to distrust the colour.
 *
 * The hook's name rides in the label (`Hook message · PostToolUse:Bash`), the
 * same `label · hook` grammar the two hook cards use, so the three read as
 * siblings. The message itself truncates: a reader who wants all of it opens
 * the row's raw JSON.
 */
export function HookMessageView({ event }: AttachmentRendererProps) {
  const att = event.attachment as HookSystemMessagePayload;
  const content = att.content?.trim();
  if (!content) {
    throw new Error("hook_system_message attachment carries no `content`");
  }
  const hook = att.hookName ?? att.hookEvent;

  return (
    <EventLine
      icon={<MdInfoOutline className="size-3.5" />}
      label={hook ? `Hook message · ${hook}` : "Hook message"}
    >
      <span className="truncate">{content}</span>
    </EventLine>
  );
}
