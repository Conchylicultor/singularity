import { LaunchButtons } from "@plugins/launch/web";

export function LaunchAgentAction({ taskId }: { taskId: string }) {
  const getRequest = async () => {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (!res.ok) return { taskId };
    const task = (await res.json()) as {
      title: string;
      description: string | null;
    };
    const title = task.title.trim() || "Untitled";
    const prompt = task.description?.trim()
      ? `${title}\n\n${task.description}`
      : title;
    return { taskId, prompt };
  };

  return (
    <LaunchButtons size="icon" openAfterLaunch={false} getRequest={getRequest} />
  );
}
