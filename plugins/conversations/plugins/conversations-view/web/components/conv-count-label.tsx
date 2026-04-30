import { useConversations } from "@plugins/conversations/web";

export function ConvCountLabel() {
  const { active, totalGoneCount } = useConversations();
  const activeCount = active.length;
  const totalCount = activeCount + totalGoneCount;

  return (
    <span className="ml-1 text-xs text-sidebar-foreground/50 opacity-0 transition-opacity group-hover/label:opacity-100">
      {activeCount}/{totalCount}
    </span>
  );
}
