import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import type { SegmentedProgressBarProps } from "@plugins/ui/plugins/segmented-progress-bar/core";

export function DotsRenderer({
  steps,
  activeStep,
  compact = false,
}: SegmentedProgressBarProps) {
  const currentIndex = steps.findIndex((s) => s.id === activeStep);

  const dots = steps.map((step, i) => {
    const isPast = i < currentIndex;
    const isActive = i === currentIndex;

    let dotClass = "size-2 rounded-full shrink-0 ";
    if (isPast) dotClass += "bg-success";
    else if (isActive) dotClass += "bg-primary";
    else dotClass += "border border-muted-foreground/40";

    return { step, i, dotClass };
  });

  if (compact) {
    return (
      <span className="inline-flex items-center gap-0.5">
        {dots.map(({ step, dotClass }) => (
          <WithTooltip key={step.id} content={step.label}>
            <span className={dotClass} />
          </WithTooltip>
        ))}
      </span>
    );
  }

  const activeLabel = steps[currentIndex]?.label ?? activeStep;

  return (
    <span className="inline-flex items-center gap-1">
      {dots.map(({ step, i, dotClass }) => (
        <span key={step.id} className="inline-flex items-center gap-1">
          <WithTooltip content={step.label}>
            <span className={dotClass} />
          </WithTooltip>
          {i < steps.length - 1 && (
            <span className="h-px w-3 shrink-0 bg-muted-foreground/30" />
          )}
        </span>
      ))}
      <Text as="span" variant="caption" className="ml-0.5 text-muted-foreground">
        {activeLabel}
      </Text>
    </span>
  );
}
