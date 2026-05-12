import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SegmentedProgressBarProps } from "@plugins/ui/plugins/segmented-progress-bar/core";

export function SegmentedRenderer({
  steps,
  activeStep,
}: SegmentedProgressBarProps) {
  const currentIndex = steps.findIndex((s) => s.id === activeStep);
  const activeLabel = steps[currentIndex]?.label ?? activeStep;
  const label = `${activeLabel} — ${currentIndex + 1}/${steps.length}`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex items-center gap-px w-10 cursor-default" />
        }
      >
        {steps.map((step, i) => {
          const segClass =
            i < currentIndex
              ? "bg-emerald-500/70"
              : i === currentIndex
                ? "bg-primary"
                : "bg-muted-foreground/25";
          return (
            <span
              key={step.id}
              className={`h-1 flex-1 rounded-sm ${segClass}`}
            />
          );
        })}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
