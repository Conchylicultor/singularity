import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { Text } from "@plugins/primitives/plugins/text/web";

export function EventCounter() {
  const { convId } = conversationPane.useParams();
  const result = useResource(jsonlEventsResource, { id: convId });
  const count = useMemo(
    () => (result.pending ? 0 : result.data.length),
    [result],
  );
  if (count === 0) return null;
  return (
    <Text as="span" variant="caption" className="tabular-nums text-muted-foreground">{count}</Text>
  );
}
