import { useState } from "react";
import { MdAutoFixHigh } from "react-icons/md";
import type { BoundaryErrorReport } from "@core";
import { LaunchButtons } from "@plugins/primitives/plugins/launch/web";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function LaunchFixButton({
  report,
  taskId,
}: {
  report: BoundaryErrorReport;
  taskId: string | null;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  const disabled = taskId === null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={disabled ? "Recording crash…" : "Launch an agent to fix this crash"}
        aria-label="Launch fix agent"
        disabled={disabled}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
      >
        <MdAutoFixHigh className="size-3" />
        Fix
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[420px] max-w-[90vw] space-y-3 p-3"
      >
        <div className="space-y-1">
          <div className="text-sm font-medium">Fix this crash</div>
          <div className="text-muted-foreground text-xs">
            {[report.slot, report.label].filter(Boolean).join(" / ") || "Plugin"}{" "}
            crashed: {report.error.message}
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Extra context (optional) — e.g. what you were doing, expected behaviour…"
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-[80px] w-full resize-y rounded-md border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3"
          rows={3}
        />
        <LaunchButtons
          size="sm"
          disabled={disabled}
          getRequest={() => ({
            taskId: taskId ?? undefined,
            prompt: text.trim() || undefined,
          })}
          onLaunched={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
