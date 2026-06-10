import { useConversationById } from "@plugins/conversations/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { useTask } from "@plugins/tasks/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";

export function AuthorDisplay({ author }: { author: string | null }) {
  const isUser = !author || author === "user";
  const authorConversation = useConversationById(isUser ? null : author);
  const authorTask = useTask(authorConversation?.taskId);
  const openPane = useOpenPane();

  if (isUser) {
    return <Text variant="body">User</Text>;
  }

  if (!authorTask) {
    return <Text variant="caption" tone="muted" className="font-mono">{author}</Text>;
  }

  return (
    <button
      type="button"
      onClick={() => openPane(taskDetailPane, { taskId: authorTask.id }, { mode: "swap" })}
      className="text-body hover:text-foreground underline underline-offset-2"
    >
      {authorTask.title}
    </button>
  );
}
