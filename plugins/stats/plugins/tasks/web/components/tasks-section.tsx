import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { TasksCumulativeChart } from "./tasks-cumulative-chart";
import { TasksVelocityChart } from "./tasks-velocity-chart";

export function TasksSection() {
  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Text as="p" variant="label" className="text-muted-foreground">Active tasks over time</Text>
        <TasksCumulativeChart />
      </Stack>
      <Stack gap="sm">
        <Text as="p" variant="label" className="text-muted-foreground">Daily velocity — added vs completed</Text>
        <TasksVelocityChart />
      </Stack>
    </Stack>
  );
}
