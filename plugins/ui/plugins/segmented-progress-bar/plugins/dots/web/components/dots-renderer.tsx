import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
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

    let dotClass = "size-2 rounded-full ";
    if (isPast) dotClass += "bg-success";
    else if (isActive) dotClass += "bg-primary";
    else dotClass += "border border-muted-foreground/40";

    return { step, i, dotClass };
  });

  if (compact) {
    return (
      <Inline gap="2xs">
        {dots.map(({ step, dotClass }) => (
          <WithTooltip key={step.id} content={step.label}>
            <span className={dotClass} />
          </WithTooltip>
        ))}
      </Inline>
    );
  }

  const activeLabel = steps[currentIndex]?.label ?? activeStep;

  return (
    <Inline gap="xs">
      {dots.map(({ step, i, dotClass }) => (
        <Inline key={step.id} gap="xs">
          <WithTooltip content={step.label}>
            <span className={dotClass} />
          </WithTooltip>
          {i < steps.length - 1 && (
            <span className="h-px w-3 bg-muted-foreground/30" />
          )}
        </Inline>
      ))}
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off label offset after the dot row; inline sibling, no flex parent to own it */}
      <Text as="span" variant="caption" className="ml-0.5 text-muted-foreground">
        {activeLabel}
      </Text>
    </Inline>
  );
}
