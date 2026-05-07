import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SegmentedProgressBarProps } from "@plugins/ui/plugins/segmented-progress-bar/shared";

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
    if (isPast) dotClass += "bg-emerald-500/70";
    else if (isActive) dotClass += "bg-primary";
    else dotClass += "border border-muted-foreground/40";

    return { step, i, dotClass };
  });

  if (compact) {
    return (
      <span className="inline-flex items-center gap-0.5">
        {dots.map(({ step, dotClass }) => (
          <Tooltip key={step.id}>
            <TooltipTrigger render={<span className={dotClass} />} />
            <TooltipContent>{step.label}</TooltipContent>
          </Tooltip>
        ))}
      </span>
    );
  }

  const activeLabel = steps[currentIndex]?.label ?? activeStep;

  return (
    <span className="inline-flex items-center gap-1">
      {dots.map(({ step, i, dotClass }) => (
        <span key={step.id} className="inline-flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger render={<span className={dotClass} />} />
            <TooltipContent>{step.label}</TooltipContent>
          </Tooltip>
          {i < steps.length - 1 && (
            <span className="h-px w-3 shrink-0 bg-muted-foreground/30" />
          )}
        </span>
      ))}
      <span className="ml-0.5 text-xs text-muted-foreground">
        {activeLabel}
      </span>
    </span>
  );
}
