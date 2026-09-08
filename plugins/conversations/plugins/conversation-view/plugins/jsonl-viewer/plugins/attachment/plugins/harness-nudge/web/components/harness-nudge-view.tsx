import { MdCampaign } from "react-icons/md";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

interface HarnessNudgePayload {
  type: string;
  text?: string;
}

/** Names which nudge this is. Unmapped subtypes fall back to the humanised
 *  subtype, so a nudge the harness adds still reads as a sentence rather than
 *  as an identifier. */
const NUDGE_LABEL: Record<string, string> = {
  batching_reminder_sent: "Batching reminder",
  silent_turn_reminder: "Check-in reminder",
};

function labelFor(subtype: string): string {
  const known = NUDGE_LABEL[subtype];
  if (known) return known;
  const words = subtype.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The harness slipping the agent a one-line coaching note mid-session — batch
 * your tool calls, say something so the user knows you're alive. It is not the
 * agent's turn and not the user's, and it is never the point of the
 * conversation, so it renders as a quiet line: which nudge, then the note
 * itself truncated to one line.
 *
 * Truncating loses nothing — the row's own raw-JSON action holds the full text
 * — and it is what keeps a nudge that fires ninety times from crowding out the
 * work around it.
 */
export function HarnessNudgeView({ event }: AttachmentRendererProps) {
  const att = event.attachment as HarnessNudgePayload;
  if (!att.text) {
    throw new Error(`${event.subtype} attachment carries no \`text\``);
  }

  return (
    <EventLine
      icon={<MdCampaign className="size-3.5" />}
      label={labelFor(event.subtype)}
    >
      <span className="truncate">{att.text}</span>
    </EventLine>
  );
}
