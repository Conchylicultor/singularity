import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdChecklist } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { useActiveDependentCount, useTask } from "@plugins/tasks/web";
import { STATUS_META } from "@plugins/tasks/plugins/task-status/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";

/**
 * The ONE task affordance of the conversation toolbar: opens the task pane and
 * carries the two facts about that task worth reading at a glance — its status
 * (a colored dot) and how many tasks are waiting on it (a bare count). Both
 * spell themselves out in the tooltip, so the glyphs stay quiet.
 */
export function TasksButton() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const taskId = conversation?.taskId;
  const { isOpen, toggle } = taskDetailPane.useToggle({ taskId: taskId ?? "" });

  const task = useTask(taskId ?? null);
  const blocked = useActiveDependentCount(taskId);
  const status = task ? STATUS_META[task.status] : null;
  // Until the task set is known there is no count to show — and no `0` drawn
  // either, so the button never claims "nothing is waiting on this" before it
  // could know. The count simply appears once the answer arrives.
  const blockedCount =
    blocked.pending || blocked.count === 0 ? null : blocked.count;

  const title = [
    "Tasks",
    status?.label,
    blockedCount === null
      ? null
      : `${blockedCount} task${blockedCount === 1 ? "" : "s"} blocked on this task`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      title={title}
      aria-label={title}
      aria-pressed={isOpen}
      onClick={() => {
        if (taskId) toggle();
      }}
      disabled={!taskId}
      className="gap-xs"
    >
      <MdChecklist className="size-4" />
      {status && <StatusDot colorClass={status.dotClass} />}
      {blockedCount !== null && (
        <Text as="span" variant="caption" tone="muted" className="tabular-nums">
          {blockedCount}
        </Text>
      )}
    </Button>
  );
}
