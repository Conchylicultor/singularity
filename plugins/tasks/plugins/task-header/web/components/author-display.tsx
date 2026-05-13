import { useConversationById } from "@plugins/conversations/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useTask } from "@plugins/tasks/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";

export function AuthorDisplay({ author }: { author: string | null }) {
  const isUser = !author || author === "user";
  const authorConversation = useConversationById(isUser ? null : author);
  const authorTask = useTask(authorConversation?.taskId);
  const openPane = useOpenPane();

  if (isUser) {
    return <span className="text-sm">User</span>;
  }

  if (!authorTask) {
    return <span className="text-muted-foreground font-mono text-xs">{author}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => openPane(taskDetailPane, { taskId: authorTask.id }, { replace: true })}
      className="hover:text-foreground text-sm underline underline-offset-2"
    >
      {authorTask.title}
    </button>
  );
}
