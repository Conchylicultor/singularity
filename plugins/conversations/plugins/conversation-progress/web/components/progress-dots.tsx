import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PHASE_ORDER, PHASE_LABELS, type ConversationPhase } from "../../shared/schemas";

interface ProgressDotsProps {
  phase: ConversationPhase;
  compact?: boolean;
}

export function ProgressDots({ phase, compact = false }: ProgressDotsProps) {
  const currentIndex = PHASE_ORDER.indexOf(phase);

  const dots = PHASE_ORDER.map((p, i) => {
    const isPast = i < currentIndex;
    const isActive = i === currentIndex;

    let dotClass = "size-2 rounded-full shrink-0 ";
    if (isPast) dotClass += "bg-emerald-500/70";
    else if (isActive) dotClass += "bg-primary";
    else dotClass += "border border-muted-foreground/40";

    return { p, i, isPast, isActive, dotClass };
  });

  if (compact) {
    return (
      <span className="inline-flex items-center gap-0.5">
        {dots.map(({ p, dotClass }) => (
          <Tooltip key={p}>
            <TooltipTrigger>
              <span className={dotClass} />
            </TooltipTrigger>
            <TooltipContent>{PHASE_LABELS[p]}</TooltipContent>
          </Tooltip>
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {dots.map(({ p, i, dotClass }) => (
        <span key={p} className="inline-flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger>
              <span className={dotClass} />
            </TooltipTrigger>
            <TooltipContent>{PHASE_LABELS[p]}</TooltipContent>
          </Tooltip>
          {i < PHASE_ORDER.length - 1 && (
            <span className="h-px w-3 shrink-0 bg-muted-foreground/30" />
          )}
        </span>
      ))}
      <span className="ml-0.5 text-xs text-muted-foreground">
        {PHASE_LABELS[phase]}
      </span>
    </span>
  );
}
