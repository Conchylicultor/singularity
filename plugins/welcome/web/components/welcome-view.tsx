import { MdArrowForward } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useConversations } from "@plugins/conversations/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { cn } from "@/lib/utils";

export function WelcomeView() {
  const conv = useConversations();
  const active = conv.pending ? [] : conv.active;
  const recentGone = conv.pending ? [] : conv.recentGone;
  const totalGoneCount = conv.pending ? 0 : conv.totalGoneCount;
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
          <Text as="span" variant="heading" className="tracking-tight">
            Singularity
          </Text>
        </div>

        {/* Stats */}
        {!conv.pending && totalCount > 0 && (
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
                <Text as="div" variant="title" className="text-foreground">
                  {stat.value}
                </Text>
                <div className="text-2xs text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* New Conversation */}
        <LaunchControl className="w-full" openMode="root" />

        {/* Recent Conversations */}
        {!conv.pending && recentConversations.length > 0 && (
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <Text as="span" variant="label" className="text-muted-foreground">
                Recent conversations
              </Text>
            </div>
            <div className="flex flex-col rounded-lg border bg-card overflow-hidden divide-y">
              {recentConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className="flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                  onClick={() => openConversation(conversation.id)}
                >
                  <StatusDot
                    colorClass={conversation.active ? "bg-info" : "bg-muted-foreground/40"}
                  />
                  <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                    <span
                      className={cn(
                        "truncate text-caption",
                        !conversation.active
                          ? "text-muted-foreground"
                          : "font-medium text-foreground",
                      )}
                    >
                      {conversation.title ?? "Starting..."}
                    </span>
                    <RelativeTime date={conversation.createdAt} className="text-3xs text-muted-foreground" />
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
