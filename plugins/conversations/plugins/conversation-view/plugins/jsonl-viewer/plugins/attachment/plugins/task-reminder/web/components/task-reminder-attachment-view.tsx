import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

interface TaskReminderItem {
  id: string;
  subject: string;
  description: string;
  activeForm: string;
  status: string;
  blocks: string[];
  blockedBy: string[];
}

interface TaskReminderPayload {
  type: "task_reminder";
  itemCount: number;
  content: TaskReminderItem[];
}

const STATUS_DOT: Record<string, string> = {
  in_progress: "bg-info",
  done: "bg-success",
  completed: "bg-success",
  blocked: "bg-destructive",
  need_action: "bg-warning",
};
const DEFAULT_DOT = "bg-muted-foreground/40";

export function TaskReminderAttachmentView({ event }: AttachmentRendererProps) {
  const att = event.attachment as TaskReminderPayload;
  const count = att.itemCount ?? att.content?.length ?? 0;

  return (
    <CollapsibleCard
      label="Task Reminder"
      note={`(${count === 0 ? "no tasks" : `${count} task${count === 1 ? "" : "s"}`})`}
    >
      {count === 0 ? (
        <Text as="p" variant="caption" className="text-muted-foreground/60 italic">
          No active tasks.
        </Text>
      ) : (
        <Stack as="ul" gap="xs">
          {att.content.map((task) => (
            <Text
              as="li"
              variant="caption"
              key={task.id}
              className="flex items-start gap-sm"
            >
              <span
                // eslint-disable-next-line spacing/no-adhoc-spacing -- vertical offset aligning the status dot with the first line of wrapping subject text; not a sibling gap
                className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_DOT[task.status] ?? DEFAULT_DOT}`}
              />
              <span className="min-w-0">
                <span className="text-foreground">{task.subject}</span>
                {task.description && (
                  /* eslint-disable-next-line spacing/no-adhoc-spacing -- inline left offset separating description from subject within a text line; not a flex-sibling gap */
                  <span className="ml-1.5 text-muted-foreground/60 truncate">
                    — {task.description}
                  </span>
                )}
              </span>
            </Text>
          ))}
        </Stack>
      )}
    </CollapsibleCard>
  );
}
