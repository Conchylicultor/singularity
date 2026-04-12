import { useState, useEffect, useCallback } from "react";
import { MdAdd, MdRefresh, MdArrowForward } from "react-icons/md";
import { Shell } from "@plugins/shell/web/commands";
import { conversationPane } from "@plugins/conversation/web/views";
import type { ClaudeSession } from "@plugins/claude-sessions/shared/types";
import { cn } from "@/lib/utils";
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

export function WelcomeView() {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [loading, setLoading] = useState(true);

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

  const activeCount = sessions.filter((s) => !s.idle).length;
  const idleCount = sessions.filter((s) => s.idle).length;

  const createSession = async () => {
    const res = await fetch("/api/claude-sessions", { method: "POST" });
    const session: ClaudeSession = await res.json();
    Shell.OpenPane(conversationPane({ session_id: session.name }));
  };

  const openSession = (name: string) => {
    Shell.OpenPane(conversationPane({ session_id: name }));
  };

  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        {/* Branding */}
        <div className="flex flex-col items-center gap-2">
          <img src="/icon.svg" alt="Singularity" className="size-12" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-lg font-semibold tracking-tight">
              Singularity
            </span>
            <span className="text-xs text-muted-foreground">Agent Manager</span>
          </div>
        </div>

        {/* Stats */}
        {!loading && sessions.length > 0 && (
          <div className="flex w-full gap-3">
            {[
              { label: "Total", value: sessions.length },
              { label: "Active", value: activeCount },
              { label: "Idle", value: idleCount },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex-1 rounded-lg border bg-card p-3 text-center"
              >
                <div className="text-2xl font-semibold text-foreground">
                  {stat.value}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* New Session */}
        <Button className="w-full gap-2" onClick={createSession}>
          <MdAdd className="size-4" />
          New Session
        </Button>

        {/* Recent Sessions */}
        {!loading && recentSessions.length > 0 && (
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Recent sessions
              </span>
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
            <div className="flex flex-col rounded-lg border bg-card overflow-hidden divide-y">
              {recentSessions.map((session) => (
                <button
                  key={session.name}
                  className="flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                  onClick={() => openSession(session.name)}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      session.idle
                        ? "bg-muted-foreground/40"
                        : "bg-primary",
                    )}
                  />
                  <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                    <span
                      className={cn(
                        "truncate text-xs",
                        session.idle
                          ? "text-muted-foreground"
                          : "font-medium text-foreground",
                      )}
                    >
                      {session.task || "Idle"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(session.createdAt)}
                    </span>
                  </div>
                  <MdArrowForward className="size-3.5 text-muted-foreground/50 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
