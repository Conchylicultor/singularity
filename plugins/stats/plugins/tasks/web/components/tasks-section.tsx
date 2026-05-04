import { TasksCumulativeChart } from "./tasks-cumulative-chart";
import { TasksVelocityChart } from "./tasks-velocity-chart";

export function TasksSection() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Active tasks over time</p>
        <TasksCumulativeChart />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Daily velocity — added vs completed</p>
        <TasksVelocityChart />
      </div>
    </div>
  );
}
