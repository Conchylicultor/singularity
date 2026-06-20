import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdArrowForward } from "react-icons/md";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useConversations } from "@plugins/conversations/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";

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
    <Center className="h-full p-2xl">
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
          <Grid cols={3} gap="md" className="w-full">
            {[
              { label: "Total", value: totalCount },
              { label: "Active", value: activeCount },
              { label: "Working", value: workingCount },
            ].map((stat) => (
              <Card key={stat.label} className="rounded-lg p-md text-center">
                <Text as="div" variant="title" className="text-foreground">
                  {stat.value}
                </Text>
                <div className="text-2xs text-muted-foreground">
                  {stat.label}
                </div>
              </Card>
            ))}
          </Grid>
        )}

        {/* New Conversation */}
        <LaunchControl fullWidth openMode="root" />

        {/* Recent Conversations */}
        {!conv.pending && recentConversations.length > 0 && (
          <div className="w-full">
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="none"
              // eslint-disable-next-line spacing/no-adhoc-spacing -- single-edge offset below the section header above the recents card
              className="mb-2"
            >
              <Text as="span" variant="label" className="text-muted-foreground">
                Recent conversations
              </Text>
            </Stack>
            <Clip as={Card} className="rounded-lg p-none">
              <Stack gap="none" className="divide-y">
                {recentConversations.map((conversation) => (
                  <Frame
                    key={conversation.id}
                    as="button"
                    gap="md"
                    onClick={() => openConversation(conversation.id)}
                    className="px-md py-sm text-left hover:bg-accent transition-colors"
                    leading={
                      <StatusDot
                        colorClass={conversation.active ? "bg-info" : "bg-muted-foreground/40"}
                      />
                    }
                    content={
                      <Stack gap="2xs">
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
                    }
                    trailing={
                      <MdArrowForward className="size-3.5 text-muted-foreground/50" />
                    }
                  />
                ))}
              </Stack>
            </Clip>
          </div>
        )}
      </Stack>
    </Center>
  );
}
