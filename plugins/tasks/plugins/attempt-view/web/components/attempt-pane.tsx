import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdVerticalSplit } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  PaneChrome,
  PaneInstanceContext,
  useOpenPane,
} from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  CONV_STATUS_DOT,
  conversationTitle,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  Fill,
  fillClasses,
} from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import {
  attemptsResource,
  type AttemptWithConversations,
} from "@plugins/tasks/plugins/tasks-core/core";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Stack,
  Inset,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { attemptPane } from "../panes";

function SideBySideButton({ convId }: { convId: string }) {
  const openPane = useOpenPane();
  return (
    <button
      type="button"
      title="Open alongside"
      onClick={(e) => {
        e.stopPropagation();
        openPane(conversationPane, { convId }, { mode: "push" });
      }}
      className="rounded-md p-2xs text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <MdVerticalSplit size={14} />
    </button>
  );
}

function AttemptSection({
  attempt,
  isCurrent,
  selectedConvId,
  convInstanceId,
  onSelect,
}: {
  attempt: AttemptWithConversations;
  isCurrent: boolean;
  selectedConvId: string | undefined;
  convInstanceId: number | undefined;
  onSelect: (convId: string) => void;
}) {
  const worktreeName = attempt.worktreePath.split("/").pop();
  return (
    <Stack gap="2xs">
      <Line className="gap-xs px-sm py-xs">
        <Fill
          as="span"
          className={cn(
            "truncate font-mono text-2xs",
            isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {worktreeName}
        </Fill>
        <Badge className={rigidClass()}>{attempt.conversations.length}</Badge>
      </Line>
      {attempt.conversations.length === 0 ? (
        <Text
          as="p"
          variant="caption"
          className="text-muted-foreground px-sm py-2xs italic"
        >
          No conversations
        </Text>
      ) : (
        <Stack as="ul" gap="2xs">
          {attempt.conversations.map((c) => {
            const isActive = c.id === selectedConvId;
            return (
              <Line
                as="li"
                key={c.id}
                className={cn(
                  "group rounded-md",
                  isActive ? "bg-accent" : "hover:bg-accent",
                )}
              >
                <Line
                  as="button"
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    fillClasses("x"),
                    "gap-sm px-sm py-xs text-left text-body",
                  )}
                >
                  <StatusDot colorClass={CONV_STATUS_DOT[c.status]} />
                  <Fill as="span" className="truncate">
                    {conversationTitle(c)}
                  </Fill>
                </Line>
                {convInstanceId !== undefined && !isActive && (
                  <Line
                    className={cn(
                      "pr-xs opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
                      rigidClass(),
                    )}
                  >
                    <PaneInstanceContext.Provider value={convInstanceId}>
                      <SideBySideButton convId={c.id} />
                    </PaneInstanceContext.Provider>
                  </Line>
                )}
              </Line>
            );
          })}
        </Stack>
      )}
      <LaunchControl
        variant="outline"
        className="px-sm pt-xs"
        getRequest={() => ({ attemptId: attempt.id })}
      />
    </Stack>
  );
}

export function AttemptPane() {
  const { attemptId } = attemptPane.useParams();
  const result = useResource(attemptsResource);
  const openPane = useOpenPane();
  // ONE read of "the conversation column this pane opened". It used to be two —
  // the first conversation pane in the chain for the highlight, the last one for
  // the instance the side-by-side button pushes from — so with two conversation
  // columns open the pane lit up one row and opened alongside the other.
  const openedConv = conversationPane.useOpenedHere();
  const selectedConvId = openedConv?.params.convId;
  const convInstanceId = openedConv?.instanceId;

  if (result.pending) return <Loading />;

  const attempt = result.data.find((a) => a.id === attemptId) ?? null;

  const taskAttempts = attempt
    ? result.data.filter((a) => a.taskId === attempt.taskId)
    : [];

  const handleSelect = (convId: string) =>
    openPane(conversationPane, { convId }, { mode: "push" });

  const totalConversations = taskAttempts.reduce(
    (sum, a) => sum + a.conversations.length,
    0,
  );

  const title = (
    <Inline gap="xs">
      Attempts
      {totalConversations > 0 && <Badge>{totalConversations}</Badge>}
    </Inline>
  );

  return (
    <PaneChrome pane={attemptPane} title={title}>
      <Inset pad="sm">
        {taskAttempts.length === 0 ? (
          <Text
            as="p"
            variant="body"
            className="text-muted-foreground px-sm py-xs"
          >
            No attempts.
          </Text>
        ) : (
          <Stack gap="sm">
            {taskAttempts.map((a) => (
              <AttemptSection
                key={a.id}
                attempt={a}
                isCurrent={a.id === attemptId}
                selectedConvId={selectedConvId}
                convInstanceId={convInstanceId}
                onSelect={handleSelect}
              />
            ))}
          </Stack>
        )}
      </Inset>
    </PaneChrome>
  );
}
