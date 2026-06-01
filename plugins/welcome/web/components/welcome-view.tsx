import { MdArrowForward } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useConversations } from "@plugins/conversations/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { cn } from "@/lib/utils";

export function WelcomeView() {
  const { active, recentGone, totalGoneCount, isLoading } = useConversations();
  const conversations = [...active, ...recentGone];

  const activeCount = active.length;
  const workingCount = active.filter((c) => c.status === "working").length;
  const totalCount = activeCount + totalGoneCount;

  const openPane = useOpenPane();
  const openConversation = (name: string) => {
    openPane(conversationPane, { convId: name }, { mode: "root" });
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
        {!isLoading && totalCount > 0 && (
          <div className="flex w-full gap-3">
            {[
              { label: "Total", value: totalCount },
              { label: "Active", value: activeCount },
              { label: "Working", value: workingCount },
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
        <LaunchControl className="w-full" openMode="root" />

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
                  <StatusDot
                    colorClass={conversation.active ? "bg-[oklch(0.58_0.1_240)]" : "bg-muted-foreground/40"}
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
                    <RelativeTime date={conversation.createdAt} className="text-[10px] text-muted-foreground" />
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
