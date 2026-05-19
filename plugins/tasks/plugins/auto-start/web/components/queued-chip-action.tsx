import { useTaskAutoStart } from "../hooks";
import { setAutoStart } from "@plugins/tasks/web";

export function QueuedChipAction({ taskId }: { taskId: string; hasChildren: boolean }) {
  const autoStart = useTaskAutoStart(taskId);
  const queuedModel = autoStart?.autoStartModel ?? null;

  if (!queuedModel) return null;

  const label = queuedModel === "opus" ? "Opus" : "Sonnet";
  return (
    <button
      type="button"
      title="Auto-start when parent is done — click to cancel"
      aria-label={`Cancel auto-start (${label})`}
      onClick={(e) => {
        e.stopPropagation();
        void setAutoStart(taskId, "none");
      }}
      className="ml-1 inline-flex shrink-0 items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
    >
      Queued · {label}
    </button>
  );
}
