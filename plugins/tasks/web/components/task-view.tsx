import type { ComponentType } from "react";
import { TaskDetail } from "./task-detail";

type ViewContribution = {
  id: string;
  title?: string;
  component: ComponentType<{ taskId: string }>;
};

export function TaskView({
  taskId,
  views,
}: {
  taskId: string | undefined;
  views: readonly ViewContribution[];
}) {
  if (!taskId) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        Select a task
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto">
      <TaskDetail key={taskId} taskId={taskId} />
      {views.length > 0 && (
        <div className="flex flex-col gap-4 px-6 pb-6">
          {views.map((v) => (
            <section key={v.id} className="bg-card rounded-lg border p-4">
              {v.title ? (
                <h2 className="mb-4 text-sm font-medium">{v.title}</h2>
              ) : null}
              <v.component taskId={taskId} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
