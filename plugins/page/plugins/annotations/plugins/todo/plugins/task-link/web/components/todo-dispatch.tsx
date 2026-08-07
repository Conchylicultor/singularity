import { useMemo } from "react";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { LaunchAgentForm } from "@plugins/primitives/plugins/launch/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  attemptsResource,
  type ConversationSummary,
} from "@plugins/tasks/plugins/tasks-core/core";
import { StatusBadge } from "@plugins/tasks/plugins/task-status/web";
import { useTodoTaskState, type TodoTaskState } from "../hooks";
import { dispatchTodoAgent } from "../internal/api";

/**
 * The TODO card's dispatch panel — what its glyph opens, and what its rail's
 * block-actions menu carries. ONE component registered twice, deliberately: the
 * rail is where a user looks for a block's actions, the glyph is where they look
 * for the glyph.
 *
 * Two states, and the second is the first plus a header rather than a different
 * surface: before a dispatch it is the launch form alone, after one it leads
 * with the task it created and the run to open, and the form below reads as
 * "dispatch another". That form is not a second way to do the same thing — the
 * endpoint returns the SAME task id, so using it adds an ATTEMPT to that task.
 */
export function TodoDispatch({
  blockId,
  close,
}: {
  blockId: string;
  /** Dismisses the popover this panel was opened in. */
  close: () => void;
}) {
  const dispatched = useTodoTaskState(blockId);

  return (
    <Stack gap="md">
      {dispatched ? <DispatchedTask task={dispatched} onOpen={close} /> : null}
      <LaunchAgentForm
        title={dispatched ? "Dispatch another agent" : "Dispatch an agent"}
        description={
          dispatched
            ? "Runs as another attempt on the same task, with the card as it reads now."
            : "The agent gets this card's contents and the page it lives on, and writes its findings back into the card."
        }
        // Both values come from the server: the task id it created or reused,
        // and the prompt it composed from the card's CURRENT contents. Composing
        // the prompt here would mean re-deriving the card's markdown from rows
        // whose `data.text` projection lags their content docs.
        getRequest={(context) => dispatchTodoAgent(blockId, context)}
        openAfterLaunch
        openMode="push"
        // The launched conversation opens in a column beside the page, so the
        // panel that opened it must get out of the way.
        onLaunched={close}
      />
    </Stack>
  );
}

/**
 * The task this card is bound to: its live title and status, and a row opening
 * the newest conversation of its newest attempt.
 *
 * Split into its own component so the `attempts` subscription is a hook on
 * something that only mounts once there IS a task — the panel's un-dispatched
 * state must not pay for it, and a hook cannot be called conditionally.
 */
function DispatchedTask({
  task,
  onOpen,
}: {
  task: TodoTaskState;
  /** Called once the row navigates, so the shell can dismiss its popover. */
  onOpen: () => void;
}) {
  const attempts = useResource(attemptsResource);
  const openPane = useOpenPane();

  // The task's newest conversation, across every attempt — the run a user
  // clicking "open" means. Joined off the already boot-critical global attempts
  // resource, the same read `page/prompt/block`'s chips make, so nothing about
  // the run is stored on the card and it stays right after a reload.
  const latest = useMemo<ConversationSummary | null>(() => {
    if (attempts.pending) return null;
    const convs = attempts.data
      .filter((attempt) => attempt.taskId === task.taskId)
      .flatMap((attempt) => attempt.conversations);
    if (convs.length === 0) return null;
    return convs.reduce((newest, conv) =>
      +new Date(conv.createdAt) > +new Date(newest.createdAt) ? conv : newest,
    );
  }, [attempts, task.taskId]);

  return (
    <Stack gap="2xs">
      <Text variant="eyebrow" tone="muted">
        Dispatched
      </Text>
      <Line>
        <Fill>
          <Text variant="label">{task.title}</Text>
        </Fill>
        <StatusBadge status={task.status} />
      </Line>
      {latest ? (
        <Row
          size="sm"
          hover="muted"
          title={latest.title ?? "Starting…"}
          onClick={() => {
            openPane(conversationPane, { convId: latest.id }, { mode: "push" });
            onOpen();
          }}
        >
          <Fill>
            <ConversationItem conv={latest} layout="inline" />
          </Fill>
        </Row>
      ) : null}
    </Stack>
  );
}
