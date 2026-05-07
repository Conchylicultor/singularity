import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useConversations, GonePageSchema } from "@plugins/conversations/web";
import { cn } from "@/lib/utils";
import type { ViewProps } from "@plugins/conversations/plugins/conversations-view/web";
import type { Conversation } from "@plugins/tasks-core/shared";
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

  // Merge active + system + recentGone sorted by createdAt desc.
  const liveItems = useMemo(() => {
    const all: Conversation[] = [...active, ...system, ...recentGone];
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [active, system, recentGone]);

  // Capture the pagination cursor once from the tail of recentGone.
  const cursorRef = useRef<string | null>(null);
  if (hasMoreGone && recentGone.length > 0 && cursorRef.current === null) {
    const tail = recentGone[recentGone.length - 1]!;
    cursorRef.current = (tail.endedAt ?? tail.createdAt).toISOString();
  }

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["conversations-gone-paginated", cursorRef.current],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        before: pageParam as string,
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/conversations/gone?${params}`);
      if (!res.ok) throw new Error("Failed to fetch gone conversations");
      return GonePageSchema.parse(await res.json());
    },
    initialPageParam: cursorRef.current ?? "",
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      const tail = lastPage.items[lastPage.items.length - 1];
      return (tail?.endedAt ?? tail?.createdAt)?.toISOString();
    },
    enabled: hasMoreGone && cursorRef.current !== null,
    staleTime: Infinity,
  });

  const liveIds = useMemo(
    () => new Set(liveItems.map((c) => c.id)),
    [liveItems],
  );

  const paginatedItems = useMemo(
    () =>
      (paginatedData?.pages ?? [])
        .flatMap((p) => p.items)
        .filter((c) => !liveIds.has(c.id)),
    [paginatedData, liveIds],
  );

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
      {hasMoreGone && <div ref={sentinelRef} className="h-1" />}
    </div>
  );
}
