import { useMemo } from "react";
import { TaskDetail as TaskDetailSlots } from "../slots";
import { TaskDetailFilePeekProvider } from "../context";

export function TaskDetail({
  taskId,
  onFileOpen,
}: {
  taskId: string;
  onFileOpen?: (path: string) => void;
}) {
  const sections = TaskDetailSlots.Section.useContributions();
  const ordered = useMemo(
    () =>
      [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [sections],
  );

  const body = (
    <div className="flex flex-col gap-4 p-6">
      {ordered.map((s) => (
        <s.component key={s.id} taskId={taskId} />
      ))}
    </div>
  );

  if (onFileOpen) {
    return (
      <TaskDetailFilePeekProvider override={{ openFile: onFileOpen }}>
        {body}
      </TaskDetailFilePeekProvider>
    );
  }
  return body;
}
