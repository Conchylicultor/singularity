import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import {
  useConversations,
  GonePageSchema,
} from "@plugins/conversations/web";
import { cn } from "@/lib/utils";
import type { ViewProps } from "@plugins/conversations/plugins/conversations-view/web";
import { GroupedConversationList } from "./grouped-conversation-list";

const SHOW_SYSTEM_KEY = "conversations-view:show-system";
const PAGE_SIZE = 20;

export function GroupedView({
  activeId,
  onNavigate,
  onCloseConversation,
}: ViewProps) {
  const { active, recentGone, hasMoreGone, system, isLoading } =
    useConversations();

  const [showSystem, setShowSystem] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHOW_SYSTEM_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleShowSystem = () => {
    setShowSystem((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHOW_SYSTEM_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  // Capture initial cursor once; never update after first assignment to keep
  // the infinite query page chain stable even as recentGone updates in real-time.
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
    () => new Set([...active, ...recentGone].map((c) => c.id)),
    [active, recentGone],
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

  const isEmpty = active.length === 0 && recentGone.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-end px-2 pb-1">
        <button
          type="button"
          onClick={toggleShowSystem}
          title={
            showSystem ? "Hide system conversations" : "Show system conversations"
          }
          aria-pressed={showSystem}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent",
            showSystem ? "text-foreground" : "text-muted-foreground/60",
          )}
        >
          {showSystem ? (
            <MdVisibility className="size-4" />
          ) : (
            <MdVisibilityOff className="size-4" />
          )}
        </button>
      </div>
      <GroupedConversationList
        active={active}
        system={system}
        showSystem={showSystem}
        recentGone={recentGone}
        paginatedItems={paginatedItems}
        activeId={activeId}
        onNavigate={onNavigate}
        onCloseConversation={onCloseConversation}
      />
      {isFetchingNextPage && (
        <div className="px-4 py-2 text-xs text-muted-foreground">Loading...</div>
      )}
      {hasMoreGone && <div ref={sentinelRef} className="h-1" />}
      {isEmpty && !isLoading && (
        <div className="px-4 py-2 text-xs text-muted-foreground">
          No conversations
        </div>
      )}
    </div>
  );
}
