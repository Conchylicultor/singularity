import { useState, useEffect, useCallback } from "react";
import { MdAdd, MdRefresh, MdClose } from "react-icons/md";
import { Shell } from "@plugins/shell/web/commands";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web/views";
import type { Conversation } from "@plugins/conversations/shared/types";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

function formatRelativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
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

export function ConversationList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations");
      setConversations(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createConversation = async () => {
    const res = await fetch("/api/conversations", { method: "POST" });
    const conversation: Conversation = await res.json();
    await refresh();
    openConversation(conversation.name);
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
        {conversations.map((conversation) => (
          <SidebarMenuItem key={conversation.name}>
            <SidebarMenuButton
              className="h-auto py-1.5"
              onClick={() => openConversation(conversation.name)}
            >
              <div className="flex items-start gap-2 overflow-hidden">
                <span className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  conversation.idle ? "bg-muted-foreground/40" : "bg-primary"
                )} />
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  <span
                    className={cn(
                      "truncate text-xs",
                      conversation.idle ? "text-muted-foreground" : "font-medium",
                    )}
                  >
                    {conversation.task || "Idle"}
                  </span>
                  <span className="truncate text-[10px] tabular-nums text-muted-foreground">
                    {formatRelativeTime(conversation.createdAt)}
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
            <SidebarMenuAction
              onClick={(e) => deleteConversation(conversation.name, e)}
              className="opacity-0 group-hover/menu-item:opacity-100"
            >
              <MdClose className="size-3.5" />
            </SidebarMenuAction>
          </SidebarMenuItem>
        ))}
        {conversations.length === 0 && !loading && (
          <div className="px-4 py-2 text-xs text-muted-foreground">
            No conversations
          </div>
        )}
      </SidebarMenu>
    </div>
  );
}
