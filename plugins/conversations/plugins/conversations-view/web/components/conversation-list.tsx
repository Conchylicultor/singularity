import { useState, useEffect, useRef, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MdClose } from "react-icons/md";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversations, GonePageSchema } from "@plugins/conversations/web";
import { LaunchButtons } from "@plugins/launch/web";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import type { ConversationEntry } from "@plugins/conversations/shared/resources";

const PAGE_SIZE = 20;

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function openConversation(name: string) {
  Shell.OpenPane(conversationPane({ session_id: name }));
}

function activeIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/c\/([^/]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function ConversationList() {
  const { active, recentGone, hasMoreGone, isLoading } = useConversations();
  const [activeId, setActiveId] = useState<string | null>(() =>
    activeIdFromPath(window.location.pathname),
  );

  useEffect(() => {
    const sync = () => setActiveId(activeIdFromPath(window.location.pathname));
    window.addEventListener("popstate", sync);
    window.addEventListener("shell:navigate", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("shell:navigate", sync);
    };
  }, []);

  // Capture initial cursor once; never update after first assignment to keep
  // the infinite query page chain stable even as recentGone updates in real-time.
  const cursorRef = useRef<string | null>(null);
  if (hasMoreGone && recentGone.length > 0 && cursorRef.current === null) {
    cursorRef.current = recentGone[recentGone.length - 1]!.createdAt.toISOString();
  }

  const { data: paginatedData, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
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
      getNextPageParam: (lastPage) =>
        lastPage.hasMore
          ? lastPage.items[lastPage.items.length - 1]?.createdAt.toISOString()
          : undefined,
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

  const closeConversation = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/conversations/${name}/close`, { method: "POST" });
  };

  const renderItem = (conversation: ConversationEntry) => {
    const working = conversation.status === "working";
    const waiting = conversation.status === "waiting";
    const gone = conversation.status === "gone";
    const label = conversation.title ?? "Starting...";
    return (
      <SidebarMenuItem key={conversation.id}>
        <SidebarMenuButton
          className="h-auto py-1.5"
          isActive={conversation.id === activeId}
          onClick={() => {
            openConversation(conversation.id);
            setActiveId(conversation.id);
          }}
        >
          <div className="flex items-start gap-2 overflow-hidden">
            <span className={cn(
              "mt-1.5 size-1.5 shrink-0 rounded-full",
              working
                ? "bg-primary"
                : waiting
                  ? "bg-amber-500"
                  : gone
                    ? "bg-muted-foreground/40"
                    : "bg-muted-foreground/60",
            )} />
            <div className="flex flex-col gap-0.5 overflow-hidden">
              <span
                className={cn(
                  "truncate text-xs",
                  conversation.active ? "font-medium" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              <span className="truncate text-[10px] tabular-nums text-muted-foreground">
                {formatRelativeTime(conversation.createdAt)}
              </span>
            </div>
          </div>
        </SidebarMenuButton>
        <SidebarMenuAction
          onClick={(e: React.MouseEvent) => closeConversation(conversation.id, e)}
          className="opacity-0 group-hover/menu-item:opacity-100"
        >
          <MdClose className="size-3.5" />
        </SidebarMenuAction>
      </SidebarMenuItem>
    );
  };

  const isEmpty = active.length === 0 && recentGone.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <LaunchButtons variant="outline" size="sm" className="px-2" />
      <SidebarMenu>
        {active.map(renderItem)}
        {recentGone.map(renderItem)}
        {paginatedItems.map(renderItem)}
        {isFetchingNextPage && (
          <div className="px-4 py-2 text-xs text-muted-foreground">Loading...</div>
        )}
        {hasMoreGone && <div ref={sentinelRef} className="h-1" />}
        {isEmpty && !isLoading && (
          <div className="px-4 py-2 text-xs text-muted-foreground">
            No conversations
          </div>
        )}
      </SidebarMenu>
    </div>
  );
}
