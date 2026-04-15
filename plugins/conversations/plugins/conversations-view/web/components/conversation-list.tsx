import { useState, useEffect } from "react";
import { MdAdd, MdClose } from "react-icons/md";
import { Shell } from "@plugins/shell/web/commands";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web/views";
import { ConversationSchema } from "@plugins/conversations/shared/types";
import { useConversations } from "@plugins/conversations/web/use-conversations";
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
  const { conversations, isLoading } = useConversations();
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

  const createConversation = async () => {
    const res = await fetch("/api/conversations", { method: "POST" });
    const conversation = ConversationSchema.parse(await res.json());
    openConversation(conversation.id);
    setActiveId(conversation.id);
  };

  const deleteConversation = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/conversations?name=${name}`, { method: "DELETE" });
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
      </div>
      <SidebarMenu>
        {conversations.map((conversation) => {
          const working = conversation.status === "working";
          const needsAttention = conversation.status === "needs_attention";
          const label = conversation.title ?? "Starting...";
          return (
            <SidebarMenuItem
              key={conversation.id}
              style={{ order: conversation.active ? 0 : 1 }}
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
                onClick={(e: React.MouseEvent) => deleteConversation(conversation.id, e)}
                className="opacity-0 group-hover/menu-item:opacity-100"
              >
                <MdClose className="size-3.5" />
              </SidebarMenuAction>
            </SidebarMenuItem>
          );
        })}
        {conversations.length === 0 && !isLoading && (
          <div className="px-4 py-2 text-xs text-muted-foreground">
            No conversations
          </div>
        )}
      </SidebarMenu>
    </div>
  );
}
