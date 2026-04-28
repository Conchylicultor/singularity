import { useState, useEffect, useRef, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MdClose, MdVisibility, MdVisibilityOff } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversations, GonePageSchema } from "@plugins/conversations/web";
import { LaunchButtons } from "@plugins/primitives/plugins/launch/web";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";

const SHOW_SYSTEM_KEY = "conversations-view:show-system";
type ConversationEntry = ReturnType<typeof useConversations>["active"][number];

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
  conversationPane.open({ convId: name });
}

function activeIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/c\/([^/]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

function statusDotClass(conv: ConversationEntry) {
  return cn(
    "mt-1.5 size-1.5 shrink-0 rounded-full",
    conv.status === "working"
      ? "bg-[oklch(0.58_0.1_240)]"
      : conv.status === "waiting"
        ? "bg-amber-500"
        : conv.status === "gone"
          ? "bg-muted-foreground/40"
          : "bg-muted-foreground/60",
  );
}

function ConversationContent({ conv }: { conv: ConversationEntry }) {
  const isSystem = conv.kind === "system";
  return (
    <div className="flex items-start gap-2 overflow-hidden">
      <span className={statusDotClass(conv)} />
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span
            className={cn(
              "truncate text-xs",
              conv.active ? "font-medium" : "text-muted-foreground",
            )}
          >
            {conv.title ?? "Starting..."}
          </span>
          {isSystem && (
            <span className="shrink-0 rounded-sm bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground/80">
              sys
            </span>
          )}
        </div>
        <span className="truncate text-[10px] tabular-nums text-muted-foreground">
          {isSystem && conv.spawnedBy
            ? `${conv.spawnedBy} · ${formatRelativeTime(conv.createdAt)}`
            : formatRelativeTime(conv.createdAt)}
        </span>
      </div>
    </div>
  );
}

export function ConversationList() {
  const { active, recentGone, hasMoreGone, system, isLoading } = useConversations();
  const [activeId, setActiveId] = useState<string | null>(() =>
    activeIdFromPath(window.location.pathname),
  );
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
    const tail = recentGone[recentGone.length - 1]!;
    cursorRef.current = (tail.endedAt ?? tail.createdAt).toISOString();
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

  // Group active conversations by attempt. Server sends newest-first, so the
  // first conversation encountered per attempt is the most recently started —
  // preserving that order for group priority. Within each group, sort
  // oldest-first so the original conversation is at the top with forks below.
  // System conversations share their parent attempt's id (see summary plugin),
  // so they group naturally as forks under the parent when showSystem is on.
  const attemptGroups = useMemo(() => {
    const merged = showSystem ? [...active, ...system] : active;
    const map = new Map<string, ConversationEntry[]>();
    for (const c of merged) {
      const group = map.get(c.attemptId) ?? [];
      group.push(c);
      map.set(c.attemptId, group);
    }
    return Array.from(map.values()).map((group) =>
      [...group].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    );
  }, [active, system, showSystem]);

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

  const closeConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/conversations/${id}/close`, { method: "POST" });
  };

  const navigate = (id: string) => {
    openConversation(id);
    setActiveId(id);
  };

  const rowTint = (conv: ConversationEntry) =>
    conv.kind === "system" ? "bg-muted/30" : undefined;

  const renderItem = (conv: ConversationEntry) => (
    <SidebarMenuItem key={conv.id}>
      <SidebarMenuButton
        className={cn("h-auto py-1.5", rowTint(conv))}
        isActive={conv.id === activeId}
        onClick={() => navigate(conv.id)}
      >
        <ConversationContent conv={conv} />
      </SidebarMenuButton>
      <SidebarMenuAction
        onClick={(e: React.MouseEvent) => closeConversation(conv.id, e)}
        className="opacity-0 group-hover/menu-item:opacity-100"
      >
        <MdClose className="size-3.5" />
      </SidebarMenuAction>
    </SidebarMenuItem>
  );

  const isEmpty = active.length === 0 && recentGone.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 px-2">
        <LaunchButtons variant="outline" size="sm" className="flex-1" />
        <button
          type="button"
          onClick={toggleShowSystem}
          title={showSystem ? "Hide system conversations" : "Show system conversations"}
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
      <SidebarMenu>
        {attemptGroups.map((group) => {
          const [root, ...forks] = group;
          if (!root) return null;
          if (forks.length === 0) return renderItem(root);
          return (
            <SidebarMenuItem key={root.attemptId}>
              <SidebarMenuButton
                className={cn("h-auto py-1.5", rowTint(root))}
                isActive={root.id === activeId}
                onClick={() => navigate(root.id)}
              >
                <ConversationContent conv={root} />
              </SidebarMenuButton>
              <SidebarMenuAction
                onClick={(e: React.MouseEvent) => closeConversation(root.id, e)}
                className="opacity-0 group-hover/menu-item:opacity-100"
              >
                <MdClose className="size-3.5" />
              </SidebarMenuAction>
              <SidebarMenuSub>
                {forks.map((fork) => (
                  <SidebarMenuSubItem key={fork.id} className="relative group/menu-item">
                    <SidebarMenuSubButton
                      className={cn("h-auto py-1", rowTint(fork))}
                      isActive={fork.id === activeId}
                      onClick={() => navigate(fork.id)}
                    >
                      <ConversationContent conv={fork} />
                    </SidebarMenuSubButton>
                    <SidebarMenuAction
                      onClick={(e: React.MouseEvent) => closeConversation(fork.id, e)}
                      className="opacity-0 group-hover/menu-item:opacity-100"
                    >
                      <MdClose className="size-3.5" />
                    </SidebarMenuAction>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
          );
        })}
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
