import { MdGroups } from "react-icons/md";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

interface TeamContextPayload {
  type: "team_context";
  agentName?: string;
  teamName?: string;
}

/**
 * The harness telling the agent it is a teammate rather than the session lead:
 * this is who you are, and this is the team you are in. That pair is the whole
 * of what a reader takes from the row — it reframes every message after it —
 * so the agent's own name is the one emphasized value and the team follows,
 * muted.
 *
 * The config and task-list paths, the composite `agentId` and
 * `hasTaskListTools` are plumbing for the agent, not facts for a reader. They
 * stay in the row's raw-JSON action.
 */
export function TeamContextView({ event }: AttachmentRendererProps) {
  const att = event.attachment as TeamContextPayload;
  if (!att.agentName) {
    throw new Error("team_context attachment carries no `agentName`");
  }

  return (
    <EventLine icon={<MdGroups className="size-3.5" />} label="Team">
      <span className="truncate text-foreground">{att.agentName}</span>
      {att.teamName && <span className="truncate">in {att.teamName}</span>}
    </EventLine>
  );
}
