import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { buildTaskPrompt } from "@plugins/tasks-core/core";

export function LaunchAgentAction({ taskId }: { taskId: string }) {
  const getRequest = async () => {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (!res.ok) return { taskId };
    const task = (await res.json()) as {
      title: string;
      description: string | null;
    };
    return { taskId, prompt: buildTaskPrompt(task) };
  };

  return (
    <LaunchControl size="icon" openAfterLaunch={false} getRequest={getRequest} />
  );
}
