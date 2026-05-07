import { useMemo } from "react";
import { TaskDetail as TaskDetailSlots } from "../slots";

export function TaskDetail({ taskId }: { taskId: string }) {
  const aboveBands = TaskDetailSlots.Above.useContributions();
  const orderedAbove = useMemo(
    () => [...aboveBands].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [aboveBands],
  );
  const sections = TaskDetailSlots.Section.useContributions();
  const orderedSections = useMemo(
    () => [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [sections],
  );

  return (
    <div className="flex flex-col">
      {orderedAbove.map((band) => (
        <band.component key={band.id} taskId={taskId} />
      ))}
      <div className="flex flex-col gap-4 p-6">
        {orderedSections.map((s) => (
          <s.component key={s.id} taskId={taskId} />
        ))}
      </div>
    </div>
  );
}
