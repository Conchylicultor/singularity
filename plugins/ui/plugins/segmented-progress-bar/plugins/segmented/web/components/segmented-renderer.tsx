import { Tooltip, TooltipContent, TooltipTrigger } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
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
          <Grid
            as="span"
            cols={steps.length}
            minCellWidth="0"
            gap="none"
            align="center"
            className="gap-px w-10 cursor-default"
          />
        }
      >
        {steps.map((step, i) => {
          const segClass =
            i < currentIndex
              ? "bg-success"
              : i === currentIndex
                ? "bg-primary"
                : "bg-muted-foreground/25";
          return (
            <span
              key={step.id}
              className={`h-1 rounded-sm ${segClass}`}
            />
          );
        })}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
