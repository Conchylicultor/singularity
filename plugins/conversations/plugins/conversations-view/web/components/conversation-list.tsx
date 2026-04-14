import { useState, useEffect, useCallback } from "react";
import { MdAdd, MdRefresh, MdClose } from "react-icons/md";
import { subscribeWsStatus } from "@core";
import { Shell } from "@plugins/shell/web/commands";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web/views";
import { z } from "zod";
import {
  ConversationSchema,
  type Conversation,
  type RuntimeLive,
} from "@plugins/conversations/shared/types";
import { useConversationStream } from "@plugins/conversations/web/stream";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [live, setLive] = useState<Record<string, RuntimeLive>>({});
  const [loading, setLoading] = useState(false);
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations");
      setConversations(z.array(ConversationSchema).parse(await res.json()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useConversationStream(useCallback((parsed) => {
    if (parsed.type === "title") {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === parsed.id ? { ...c, title: parsed.title } : c,
        ),
      );
    } else if (parsed.type === "status") {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === parsed.id ? { ...c, status: parsed.status } : c,
        ),
      );
    } else if (parsed.type === "created") {
      const conv = ConversationSchema.parse(parsed.conversation);
      setConversations((prev) =>
        prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev],
      );
    } else if (parsed.type === "deleted") {
      setConversations((prev) => prev.filter((c) => c.id !== parsed.id));
    } else if (parsed.type === "working") {
      setLive((prev) => ({
        ...prev,
        [parsed.id]: { working: parsed.working },
      }));
    } else if (parsed.type === "gone") {
      setLive((prev) => {
        const next = { ...prev };
        delete next[parsed.id];
        return next;
      });
    }
  }, []));

  // After the SSE reconnects (e.g. server restart), DB-backed list state may
  // have drifted. Re-fetch once we see open-after-reconnecting.
  useEffect(() => {
    let wasReconnecting = false;
    return subscribeWsStatus(({ url, status }) => {
      if (url !== "/api/conversations/stream") return;
      if (status === "reconnecting") wasReconnecting = true;
      else if (status === "open" && wasReconnecting) {
        wasReconnecting = false;
        refresh();
      }
    });
  }, [refresh]);

  const createConversation = async () => {
    const res = await fetch("/api/conversations", { method: "POST" });
    const conversation = ConversationSchema.parse(await res.json());
    openConversation(conversation.id);
    setActiveId(conversation.id);
  };

  const deleteConversation = async (
    name: string,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    await fetch(`/api/conversations?name=${name}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 px-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-2"
          onClick={createConversation}
        >
          <MdAdd className="size-4" />
          New conversation
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={refresh}
          disabled={loading}
        >
          <MdRefresh
            className={cn("size-3.5", loading && "animate-spin")}
          />
        </Button>
      </div>
      <SidebarMenu>
        {conversations.map((conversation) => {
          const working = live[conversation.id]?.working ?? false;
          const needsAttention = conversation.status === "needs_attention";
          const muted = !working && !needsAttention;
          const label = conversation.title ?? "Starting...";
          return (
            <SidebarMenuItem
              key={conversation.id}
              style={{ order: working ? 0 : needsAttention ? 1 : 2 }}
            >
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
                      : needsAttention
                        ? "bg-amber-500"
                        : "bg-muted-foreground/40",
                  )} />
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <span
                      className={cn(
                        "truncate text-xs",
                        muted ? "text-muted-foreground" : "font-medium",
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
                onClick={(e) => deleteConversation(conversation.id, e)}
                className="opacity-0 group-hover/menu-item:opacity-100"
              >
                <MdClose className="size-3.5" />
              </SidebarMenuAction>
            </SidebarMenuItem>
          );
        })}
        {conversations.length === 0 && !loading && (
          <div className="px-4 py-2 text-xs text-muted-foreground">
            No conversations
          </div>
        )}
      </SidebarMenu>
    </div>
  );
}
