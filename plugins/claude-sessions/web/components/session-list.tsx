import { useState, useEffect, useCallback } from "react";
import { MdAdd, MdRefresh, MdClose } from "react-icons/md";
import { Shell } from "@plugins/shell/web/commands";
import { conversationPane } from "@plugins/conversation/web/views";
import type { ClaudeSession } from "../../shared/types";
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

function openSession(name: string) {
  Shell.OpenPane(conversationPane({ session_id: name }));
}

export function SessionList() {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/claude-sessions");
      setSessions(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createSession = async () => {
    const res = await fetch("/api/claude-sessions", { method: "POST" });
    const session: ClaudeSession = await res.json();
    await refresh();
    openSession(session.name);
  };

  const deleteSession = async (
    name: string,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    await fetch(`/api/claude-sessions?name=${name}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 px-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 justify-start gap-2 text-xs"
          onClick={createSession}
        >
          <MdAdd className="size-4" />
          New session
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={refresh}
          disabled={loading}
        >
          <MdRefresh
            className={cn("size-3.5", loading && "animate-spin")}
          />
        </Button>
      </div>
      <SidebarMenu>
        {sessions.map((session) => (
          <SidebarMenuItem key={session.name}>
            <SidebarMenuButton
              className="h-auto py-1.5"
              onClick={() => openSession(session.name)}
            >
              <div className="flex items-start gap-2 overflow-hidden">
                <span className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  session.idle ? "bg-muted-foreground/40" : "bg-primary"
                )} />
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  <span
                    className={cn(
                      "truncate text-xs",
                      session.idle ? "text-muted-foreground" : "font-medium",
                    )}
                  >
                    {session.task || "Idle"}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {formatRelativeTime(session.createdAt)}
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
            <SidebarMenuAction
              onClick={(e) => deleteSession(session.name, e)}
              className="opacity-0 group-hover/menu-item:opacity-100"
            >
              <MdClose className="size-3.5" />
            </SidebarMenuAction>
          </SidebarMenuItem>
        ))}
        {sessions.length === 0 && !loading && (
          <div className="px-4 py-2 text-xs text-muted-foreground">
            No sessions
          </div>
        )}
      </SidebarMenu>
    </div>
  );
}
