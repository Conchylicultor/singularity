import { useConversations } from "@plugins/conversations/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export function ConvCountLabel() {
  const conv = useConversations();
  if (conv.pending) return null;
  const activeCount = conv.active.length;
  const totalCount = activeCount + conv.totalGoneCount;

  return (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- inline left offset separating this count label from the preceding sidebar header text; no flex parent here to own a gap
    <Text variant="caption" className="ml-1 text-sidebar-foreground/50 opacity-0 transition-opacity group-hover/label:opacity-100">
      {activeCount}/{totalCount}
    </Text>
  );
}
