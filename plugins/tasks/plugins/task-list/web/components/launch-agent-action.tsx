import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { buildTaskPrompt } from "@plugins/tasks-core/core";
import { getTask } from "@plugins/tasks/core";

export function LaunchAgentAction({ taskId }: { taskId: string }) {
  const getRequest = async () => {
    try {
      const task = await fetchEndpoint(getTask, { id: taskId });
      return { taskId, prompt: buildTaskPrompt(task) };
    } catch {
      return { taskId };
    }
  };

  return (
    <LaunchControl size="icon" openAfterLaunch={false} getRequest={getRequest} />
  );
}
