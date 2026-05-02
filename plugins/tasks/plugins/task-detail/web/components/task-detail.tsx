import { useMemo } from "react";
import { TaskDetail as TaskDetailSlots } from "../slots";

export function TaskDetail({ taskId }: { taskId: string }) {
  const sections = TaskDetailSlots.Section.useContributions();
  const ordered = useMemo(
    () =>
      [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [sections],
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      {ordered.map((s) => (
        <s.component key={s.id} taskId={taskId} />
      ))}
    </div>
  );
}
