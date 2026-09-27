import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useConversations } from "@plugins/conversations/web";
import type { ConversationEntry } from "@plugins/conversations/core";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { fillClasses } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const arrowForwardIcon = symbol("arrow-forward");

export function WelcomeView() {
  const conv = useConversations();

  const openPane = useOpenPane();
  const openConversation = (name: string) => {
    openPane(conversationPane, { convId: name }, { mode: "root" });
  };

  // The counts and the recents describe the user's conversations, so they
  // render only once those are known — a pending read shows neither, never a
  // zero or an empty list it would then take back.
  return (
    <Center className="h-full p-2xl">
      <Stack align="center" gap="2xl" className="w-full max-w-sm">
        {/* Branding */}
        <Stack align="center" gap="sm">
          <img src="/icon.svg" alt="Equin" className="size-24" />
          <Text as="span" variant="heading" className="tracking-tight">
            Equin
          </Text>
        </Stack>

        {!conv.pending && (
          <ConversationStats
            active={conv.active}
            totalGoneCount={conv.totalGoneCount}
          />
        )}

        {/* New Conversation */}
        <LaunchControl fullWidth openMode="root" />

        {!conv.pending && (
          <RecentConversations
            conversations={[...conv.active, ...conv.recentGone].slice(0, 5)}
            onOpen={openConversation}
          />
        )}
      </Stack>
    </Center>
  );
}

function ConversationStats({
  active,
  totalGoneCount,
}: {
  active: ConversationEntry[];
  totalGoneCount: number;
}) {
  const activeCount = active.length;
  const workingCount = active.filter((c) => c.status === "working").length;
  const totalCount = activeCount + totalGoneCount;
  if (totalCount === 0) return null;

  return (
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
          <div className="text-2xs text-muted-foreground">{stat.label}</div>
        </Card>
      ))}
    </Grid>
  );
}

function RecentConversations({
  conversations,
  onOpen,
}: {
  conversations: ConversationEntry[];
  onOpen: (id: string) => void;
}) {
  if (conversations.length === 0) return null;

  return (
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
          {conversations.map((conversation) => (
            <Stack
              as="button"
              direction="row"
              align="center"
              gap="md"
              key={conversation.id}
              className="px-md py-sm text-left hover:bg-accent transition-colors"
              onClick={() => onOpen(conversation.id)}
            >
              <StatusDot
                colorClass={
                  conversation.active ? "bg-info" : "bg-muted-foreground/40"
                }
              />
              <Stack as={Clip} gap="2xs" className={fillClasses("x")}>
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
                <RelativeTime
                  date={conversation.createdAt}
                  className="text-3xs text-muted-foreground"
                />
              </Stack>
              <Icon icon={arrowForwardIcon}
                className={cn(
                  "size-3.5 text-muted-foreground/50",
                  rigidClass(),
                )}
              />
            </Stack>
          ))}
        </Stack>
      </Clip>
    </div>
  );
}
