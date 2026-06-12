import { useEffect, useMemo, useRef, useState } from "react";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { terminalPane } from "@plugins/primitives/plugins/terminal/web";
import { convTerminalPane } from "../panes";

const TMUX = "tmux";

export function TerminalPaneBody() {
  const { convId: inputConvId } = convTerminalPane.useInput();
  const routeEntry = conversationPane.useRouteEntry();
  const convId = inputConvId ?? routeEntry?.params.convId;
  const conversation = useConversationById(convId ?? null);
  if (!conversation) return null;
  return <TerminalPaneInner convId={conversation.id} status={conversation.status} />;
}

function TerminalPaneInner({
  convId,
  status,
}: {
  convId: string;
  status: string;
}) {
  const TerminalComponent = useMemo(
    () =>
      terminalPane({
        command: [TMUX, "-u", "attach", "-t", convId],
        title: convId,
      }).component,
    [convId],
  );

  // After Resume re-spawns the tmux session, the existing PTY (which exited
  // when the original session died) has to be replaced — bump a key whenever
  // the conversation transitions from gone to live so the TerminalComponent
  // remounts and reattaches.
  const [reattachKey, setReattachKey] = useState(0);
  const wasDisconnected = status === "gone" || status === "done";
  const wasDisconnectedRef = useRef(wasDisconnected);
  useEffect(() => {
    if (wasDisconnectedRef.current && !wasDisconnected) {
      setReattachKey((k) => k + 1);
    }
    wasDisconnectedRef.current = wasDisconnected;
  }, [wasDisconnected]);

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <TerminalComponent key={reattachKey} />
    </div>
  );
}
