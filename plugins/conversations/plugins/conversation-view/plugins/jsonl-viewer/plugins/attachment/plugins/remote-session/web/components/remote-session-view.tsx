import { MdCloudSync } from "react-icons/md";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

/** The harness announcing that this conversation is now followed from
 *  claude.ai. `commit` / `pr` carry the attribution trailers the agent must
 *  paste from here on, and `sendUserFileHint` says files can be handed over
 *  remotely — both are instructions TO the agent, not facts for the reader. */
interface RemoteSessionPayload {
  type: "remote_session_change";
  url?: string;
  commit?: string;
  pr?: string;
  sendUserFileHint?: boolean;
}

/** The tail of the session URL (`…/session_01Dry…`) — the only part that
 *  distinguishes one remote session from another. Falls back to the whole URL
 *  when it has no path to take a tail from. */
function sessionIdFrom(url: string): string {
  const tail = url.split("?")[0]!.replace(/\/+$/, "").split("/").pop();
  return tail && tail.length > 0 ? tail : url;
}

/**
 * The session became remotely followed. That is one fact and it fits on one
 * line, so it is an `EventLine` rather than a card.
 *
 * The row shows the session id as a link out to claude.ai — the id is what
 * names this session, the surrounding URL is boilerplate. The commit and PR
 * trailers the payload also carries are the agent's own bookkeeping: a reader
 * scrolling the transcript gains nothing from seeing them, and the row's
 * raw-JSON action already has them for anyone who does.
 */
export function RemoteSessionView({ event }: AttachmentRendererProps) {
  const att = event.attachment as RemoteSessionPayload;
  if (!att.url) {
    throw new Error("remote_session_change attachment carries no `url`");
  }

  return (
    <EventLine
      icon={<MdCloudSync className="size-3.5" />}
      label="Remote session"
    >
      <a
        className="truncate font-mono text-primary underline"
        href={att.url}
        target="_blank"
        rel="noreferrer"
      >
        {sessionIdFrom(att.url)}
      </a>
    </EventLine>
  );
}
