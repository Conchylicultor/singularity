import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

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
  in_progress: "bg-blue-500",
  done: "bg-emerald-500",
  completed: "bg-emerald-500",
  blocked: "bg-red-500",
  need_action: "bg-orange-500",
};
const DEFAULT_DOT = "bg-muted-foreground/40";

export function TaskReminderAttachmentView({ event }: AttachmentRendererProps) {
  const att = event.attachment as TaskReminderPayload;
  const { open, triggerProps, contentId } = useCollapsible();
  const count = att.itemCount ?? att.content?.length ?? 0;

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <button
        {...triggerProps}
        className="flex w-full items-center gap-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <CollapsibleChevron open={open} className="size-3" />
        <span className="font-mono">
          Task Reminder{" "}
          <span className="text-muted-foreground/60">
            ({count === 0 ? "no tasks" : `${count} task${count === 1 ? "" : "s"}`})
          </span>
        </span>
      </button>
      {open && (
        <div id={contentId} className="mt-2 border-l-2 border-muted-foreground/20 pl-3">
          {count === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">No active tasks.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {att.content.map((task) => (
                <li key={task.id} className="flex items-start gap-2 text-xs leading-5">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_DOT[task.status] ?? DEFAULT_DOT}`}
                  />
                  <span className="min-w-0">
                    <span className="text-foreground">{task.subject}</span>
                    {task.description && (
                      <span className="ml-1.5 text-muted-foreground/60 truncate">
                        — {task.description}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
