import { useEffect, useMemo, useRef, useState } from "react";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { terminalPane } from "@plugins/terminal/web";

const TMUX = "/opt/homebrew/bin/tmux";

export function TerminalPaneBody() {
  const { conversation } = conversationPane.useData();

  const TerminalComponent = useMemo(
    () =>
      terminalPane({
        command: [TMUX, "-u", "attach", "-t", conversation.id],
        title: conversation.id,
      }).component,
    [conversation.id],
  );

  // After Resume re-spawns the tmux session, the existing PTY (which exited
  // when the original session died) has to be replaced — bump a key whenever
  // the conversation transitions from gone to live so the TerminalComponent
  // remounts and reattaches.
  const [reattachKey, setReattachKey] = useState(0);
  const wasGoneRef = useRef(conversation.status === "gone");
  useEffect(() => {
    if (wasGoneRef.current && conversation.status !== "gone") {
      setReattachKey((k) => k + 1);
    }
    wasGoneRef.current = conversation.status === "gone";
  }, [conversation.status]);

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <TerminalComponent key={reattachKey} />
    </div>
  );
}
