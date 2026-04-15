import { MdOpenInNew } from "react-icons/md";
import { Tasks as TasksCommands } from "../commands";

export function OpenDetailsAction({ taskId }: { taskId: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        TasksCommands.OpenTask({ id: taskId });
      }}
      title="Open details"
      aria-label="Open details"
      className="hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded"
    >
      <MdOpenInNew className="size-4" />
    </button>
  );
}
