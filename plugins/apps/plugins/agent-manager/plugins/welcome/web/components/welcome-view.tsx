import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { MdArrowForward } from "react-icons/md";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useConversations } from "@plugins/conversations/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

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
    <div className="flex h-full items-center justify-center p-2xl">
      <Stack align="center" gap="2xl" className="w-full max-w-sm">
        {/* Branding */}
        <Stack align="center" gap="sm">
          <img src="/icon.svg" alt="Singularity" className="size-24" />
          <Text as="span" variant="heading" className="tracking-tight">
            Singularity
          </Text>
        </Stack>

        {/* Stats */}
        {!conv.pending && totalCount > 0 && (
          <Stack direction="row" gap="md" className="w-full">
            {[
              { label: "Total", value: totalCount },
              { label: "Active", value: activeCount },
              { label: "Working", value: workingCount },
            ].map((stat) => (
              <Card
                key={stat.label}
                className="flex-1 rounded-lg p-md text-center"
              >
                <Text as="div" variant="title" className="text-foreground">
                  {stat.value}
                </Text>
                <div className="text-2xs text-muted-foreground">
                  {stat.label}
                </div>
              </Card>
            ))}
          </Stack>
        )}

        {/* New Conversation */}
        <LaunchControl fullWidth openMode="root" />

        {/* Recent Conversations */}
        {!conv.pending && recentConversations.length > 0 && (
          <div className="w-full">
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- single-edge offset below the section header above the recents card */}
            <div className="flex items-center justify-between mb-2">
              <Text as="span" variant="label" className="text-muted-foreground">
                Recent conversations
              </Text>
            </div>
            <Card className="flex flex-col rounded-lg overflow-hidden divide-y p-none">
              {recentConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className="flex items-center gap-md px-md py-sm text-left hover:bg-accent transition-colors"
                  onClick={() => openConversation(conversation.id)}
                >
                  <StatusDot
                    colorClass={conversation.active ? "bg-info" : "bg-muted-foreground/40"}
                  />
                  <Stack gap="2xs" className="overflow-hidden flex-1">
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
                  </Stack>
                  <MdArrowForward className="size-3.5 text-muted-foreground/50 shrink-0" />
                </button>
              ))}
            </Card>
          </div>
        )}
      </Stack>
    </div>
  );
}
