import { TaskDetail as TaskDetailSlots } from "../slots";

export function TaskDetail({ taskId }: { taskId: string }) {
  return <TaskDetailSlots.Host taskId={taskId} />;
}
