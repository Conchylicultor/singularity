import { useMemo } from "react";
import { useConversations, GonePageSchema } from "@plugins/conversations/web";
import {
  useCursorPagination,
  ScrollSentinel,
} from "@plugins/primitives/plugins/cursor-pagination/web";
import { cn } from "@/lib/utils";
import type { ViewProps } from "@plugins/conversations/plugins/conversations-view/web";
import type { Conversation } from "@plugins/tasks-core/core";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import { MdClose } from "react-icons/md";

const PAGE_SIZE = 20;

export function HistoryView({
  activeId,
  onNavigate,
  onCloseConversation,
}: ViewProps) {
  const { active, recentGone, hasMoreGone, system, isLoading } =
    useConversations();

  const liveItems = useMemo(() => {
    const all: Conversation[] = [...active, ...system, ...recentGone];
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [active, system, recentGone]);

  const cursor =
    hasMoreGone && recentGone.length > 0
      ? (
          recentGone[recentGone.length - 1]!.endedAt ??
          recentGone[recentGone.length - 1]!.createdAt
        ).toISOString()
      : null;

  const liveIds = useMemo(
    () => new Set(liveItems.map((c) => c.id)),
    [liveItems],
  );

  const {
    items: paginatedItems,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  } = useCursorPagination({
    queryKey: ["conversations-gone-paginated"],
    fetchPage: async (before, limit) => {
      const params = new URLSearchParams({
        before,
        limit: String(limit),
      });
      const res = await fetch(`/api/conversations/gone?${params}`);
      if (!res.ok) throw new Error("Failed to fetch gone conversations");
      return GonePageSchema.parse(await res.json());
    },
    cursor,
    enabled: hasMoreGone,
    pageSize: PAGE_SIZE,
    getCursor: (c) => (c.endedAt ?? c.createdAt).toISOString(),
    liveIds,
    getId: (c) => c.id,
  });

  const isEmpty = liveItems.length === 0 && paginatedItems.length === 0;

  const renderRow = (conv: Conversation) => (
    <SidebarMenuItem key={conv.id}>
      <SidebarMenuButton
        className={cn(
          "h-auto py-2",
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
    <div className="flex flex-col gap-1">
      {isEmpty && !isLoading ? (
        <div className="px-4 py-2 text-xs text-muted-foreground">
          No conversations
        </div>
      ) : (
        <SidebarMenu>
          {liveItems.map(renderRow)}
          {paginatedItems.map(renderRow)}
        </SidebarMenu>
      )}
      {isFetchingNextPage && (
        <div className="px-4 py-2 text-xs text-muted-foreground">
          Loading...
        </div>
      )}
      <ScrollSentinel sentinelRef={sentinelRef} show={hasNextPage} />
    </div>
  );
}
