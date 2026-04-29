import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useConversationById } from "@plugins/conversations/web";
import { tasksResource } from "@plugins/tasks/shared";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";

export function AuthorDisplay({ author }: { author: string | null }) {
  const isUser = !author || author === "user";
  const { data: tasksData } = useResource(tasksResource);
  const authorConversation = useConversationById(isUser ? null : author);

  const authorTask = useMemo(() => {
    if (!authorConversation) return null;
    return tasksData?.find((t) => t.id === authorConversation.taskId) ?? null;
  }, [authorConversation, tasksData]);

  if (isUser) {
    return <span className="text-sm">User</span>;
  }

  if (!authorTask) {
    return <span className="text-muted-foreground font-mono text-xs">{author}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => taskDetailPane.open({ taskId: authorTask.id })}
      className="hover:text-foreground text-sm underline underline-offset-2"
    >
      {authorTask.title}
    </button>
  );
}
