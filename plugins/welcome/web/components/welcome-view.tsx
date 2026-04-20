import { MdArrowForward } from "react-icons/md";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversations } from "@plugins/conversations/web";
import { LaunchButtons } from "@plugins/launch/web";
import { cn } from "@/lib/utils";

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

export function WelcomeView() {
  const { conversations, isLoading } = useConversations();

  const activeCount = conversations.filter((c) => c.active).length;
  const idleCount = conversations.length - activeCount;

  const openConversation = (name: string) => {
    Shell.OpenPane(conversationPane({ session_id: name }));
  };

  const recentConversations = conversations.slice(0, 5);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        {/* Branding */}
        <div className="flex flex-col items-center gap-2">
          <img src="/icon.svg" alt="Singularity" className="size-24" />
          <span className="text-lg font-semibold tracking-tight">
            Singularity
          </span>
        </div>

        {/* Stats */}
        {!isLoading && conversations.length > 0 && (
          <div className="flex w-full gap-3">
            {[
              { label: "Total", value: conversations.length },
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

        {/* New Conversation */}
        <LaunchButtons className="w-full" />

        {/* Recent Conversations */}
        {!isLoading && recentConversations.length > 0 && (
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Recent conversations
              </span>
            </div>
            <div className="flex flex-col rounded-lg border bg-card overflow-hidden divide-y">
              {recentConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className="flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                  onClick={() => openConversation(conversation.id)}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      !conversation.active
                        ? "bg-muted-foreground/40"
                        : "bg-primary",
                    )}
                  />
                  <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                    <span
                      className={cn(
                        "truncate text-xs",
                        !conversation.active
                          ? "text-muted-foreground"
                          : "font-medium text-foreground",
                      )}
                    >
                      {conversation.title ?? "Starting..."}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(conversation.createdAt)}
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
