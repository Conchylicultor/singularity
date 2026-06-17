import { cn, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "@plugins/primitives/plugins/ui-kit/web";
import { useMemo } from "react";
import { useConversations } from "@plugins/conversations/web";
import { ScrollSentinel } from "@plugins/primitives/plugins/cursor-pagination/web";
import type { ViewProps } from "@plugins/conversations/plugins/conversations-view/web";
import { useGoneConversationsPagination } from "@plugins/conversations/plugins/conversations-view/web";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { MdClose } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

export function HistoryView({
  activeId,
  onNavigate,
  onCloseConversation,
}: ViewProps) {
  const conv = useConversations();
  const active = useMemo(() => (conv.pending ? [] : conv.active), [conv]);
  const recentGone = useMemo(() => (conv.pending ? [] : conv.recentGone), [conv]);
  const hasMoreGone = conv.pending ? false : conv.hasMoreGone;
  const system = useMemo(() => (conv.pending ? [] : conv.system), [conv]);

  const liveItems = useMemo(() => {
    const all: Conversation[] = [...active, ...system, ...recentGone];
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [active, system, recentGone]);

  const liveIds = useMemo(
    () => new Set(liveItems.map((c) => c.id)),
    [liveItems],
  );

  const {
    items: paginatedItems,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  } = useGoneConversationsPagination({ recentGone, hasMoreGone, liveIds });

  const isEmpty = liveItems.length === 0 && paginatedItems.length === 0;

  const renderRow = (conv: Conversation) => (
    <SidebarMenuItem key={conv.id}>
      <SidebarMenuButton
        className={cn(
          "h-auto py-sm",
          conv.kind === "system" && "bg-muted/30",
        )}
        isActive={conv.id === activeId}
        onClick={() => onNavigate(conv.id)}
      >
        <ConversationItem conv={conv} />
      </SidebarMenuButton>
      <SidebarMenuAction
        onClick={(e: React.MouseEvent) => onCloseConversation(conv.id, e)}
        className="opacity-0 group-hover/menu-item:opacity-100"
        aria-label="Close conversation"
      >
        <MdClose className="size-3.5" />
      </SidebarMenuAction>
    </SidebarMenuItem>
  );

  return (
    <Stack gap="xs">
      {isEmpty && !conv.pending ? (
        <Text as="div" variant="caption" className="px-lg py-sm text-muted-foreground">
          No conversations
        </Text>
      ) : (
        <SidebarMenu>
          {liveItems.map(renderRow)}
          {paginatedItems.map(renderRow)}
        </SidebarMenu>
      )}
      {isFetchingNextPage && (
        <Loading variant="spinner" label="Loading…" />
      )}
      <ScrollSentinel sentinelRef={sentinelRef} show={hasNextPage} />
    </Stack>
  );
}
