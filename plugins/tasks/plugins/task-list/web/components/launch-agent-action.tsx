import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { buildTaskPrompt } from "@plugins/tasks/plugins/tasks-core/core";
import { useIsContainerTask } from "@plugins/tasks/plugins/container-tasks/web";
import { getTask } from "@plugins/tasks/core";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";

export function LaunchAgentAction({ row }: ItemActionProps<TaskListItem>) {
  const taskId = row.id;
  const isContainer = useIsContainerTask(taskId);
  const getRequest = async () => {
    try {
      const task = await fetchEndpoint(getTask, { id: taskId });
      return { taskId, prompt: buildTaskPrompt(task) };
    // eslint-disable-next-line promise-safety/no-bare-catch -- fetching task details is best-effort prompt enrichment; any failure (404, network, 500) has the same correct fallback: launch with taskId only and no pre-populated prompt
    } catch {
      return { taskId };
    }
  };

  // A container/meta task is a system folder that can't own an attempt — hide
  // Launch so the user never hits the server-side rejection.
  if (isContainer) return null;

  return (
    <LaunchControl size="icon" openAfterLaunch={false} getRequest={getRequest} />
  );
}
