import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export function EventCounter() {
  const { convId } = conversationPane.useParams();
  const result = useResource(jsonlEventsResource, { id: convId });

  if (result.pending) return null;

  const count = result.data.length;
  if (count === 0) return null;
  return (
    <Text as="span" variant="caption" className="tabular-nums text-muted-foreground">{count}</Text>
  );
}
