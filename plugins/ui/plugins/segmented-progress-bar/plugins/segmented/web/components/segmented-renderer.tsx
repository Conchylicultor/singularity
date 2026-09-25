import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import type { SegmentedProgressBarProps } from "@plugins/ui/plugins/segmented-progress-bar/core";
import { ProgressStepsTooltip } from "@plugins/ui/plugins/segmented-progress-bar/web";

export function SegmentedRenderer({
  steps,
  activeStep,
  summary,
}: SegmentedProgressBarProps) {
  const currentIndex = steps.findIndex((s) => s.id === activeStep);

  return (
    <ProgressStepsTooltip
      steps={steps}
      activeStep={activeStep}
      summary={summary}
    >
      <Grid
        as="span"
        cols={steps.length}
        gap="none"
        align="center"
        className="gap-px w-10 cursor-default"
      >
        {steps.map((step, i) => {
          const segClass =
            i < currentIndex
              ? "bg-success"
              : i === currentIndex
                ? "bg-primary"
                : "bg-muted-foreground/25";
          return (
            <span key={step.id} className={`h-1 rounded-sm ${segClass}`} />
          );
        })}
      </Grid>
    </ProgressStepsTooltip>
  );
}
