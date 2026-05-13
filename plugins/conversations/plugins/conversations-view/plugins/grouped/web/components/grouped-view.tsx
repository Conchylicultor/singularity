import { useMemo, useState } from "react";
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import {
  useConversations,
  GonePageSchema,
} from "@plugins/conversations/web";
import {
  useCursorPagination,
  ScrollSentinel,
} from "@plugins/primitives/plugins/cursor-pagination/web";
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
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {}
      return next;
    });
  };

  const cursor =
    hasMoreGone && recentGone.length > 0
      ? (
          recentGone[recentGone.length - 1]!.endedAt ??
          recentGone[recentGone.length - 1]!.createdAt
        ).toISOString()
      : null;

  const liveIds = useMemo(
    () => new Set([...active, ...recentGone].map((c) => c.id)),
    [active, recentGone],
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
      <ScrollSentinel sentinelRef={sentinelRef} show={hasNextPage} />
      {isEmpty && !isLoading && (
        <div className="px-4 py-2 text-xs text-muted-foreground">
          No conversations
        </div>
      )}
    </div>
  );
}
