import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";

export function EventCounter() {
  const { conversation } = conversationPane.useData();
  const result = useResource(jsonlEventsResource, { id: conversation.id });
  const count = useMemo(
    () => (result.pending ? 0 : result.data.length),
    [result],
  );
  if (count === 0) return null;
  return (
    <span className="tabular-nums text-xs text-muted-foreground">{count}</span>
  );
}
