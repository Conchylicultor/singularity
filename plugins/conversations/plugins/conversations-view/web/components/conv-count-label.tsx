import { useConversations } from "@plugins/conversations/web";
import { Text } from "@plugins/primitives/plugins/text/web";

export function ConvCountLabel() {
  const conv = useConversations();
  if (conv.pending) return null;
  const activeCount = conv.active.length;
  const totalCount = activeCount + conv.totalGoneCount;

  return (
    <Text variant="caption" className="ml-1 text-sidebar-foreground/50 opacity-0 transition-opacity group-hover/label:opacity-100">
      {activeCount}/{totalCount}
    </Text>
  );
}
