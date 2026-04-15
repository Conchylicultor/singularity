import { useState } from "react";
import { MdPlayArrow } from "react-icons/md";
import { cn } from "@/lib/utils";

export function LaunchAgentAction({ taskId }: { taskId: string }) {
  const [launching, setLaunching] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (launching) return;
    setLaunching(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) return;
      const task = (await res.json()) as {
        title: string;
        description: string | null;
      };
      const title = task.title.trim() || "Untitled";
      const prompt = task.description?.trim()
        ? `${title}\n\n${task.description}`
        : title;
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, prompt }),
      });
    } finally {
      setLaunching(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={launching}
      title="Launch agent"
      aria-label="Launch agent"
      className={cn(
        "hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded",
        launching && "opacity-50",
      )}
    >
      <MdPlayArrow className="size-4" />
    </button>
  );
}
