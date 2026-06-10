import { Text } from "@plugins/primitives/plugins/text/web";
import { TasksCumulativeChart } from "./tasks-cumulative-chart";
import { TasksVelocityChart } from "./tasks-velocity-chart";

export function TasksSection() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="p" variant="label" className="mb-2 text-muted-foreground">Active tasks over time</Text>
        <TasksCumulativeChart />
      </div>
      <div>
        <Text as="p" variant="label" className="mb-2 text-muted-foreground">Daily velocity — added vs completed</Text>
        <TasksVelocityChart />
      </div>
    </div>
  );
}
