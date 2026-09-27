import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import type { SegmentedProgressBarProps } from "@plugins/ui/plugins/segmented-progress-bar/core";
import {
  ProgressStepsTooltip,
  progressStepLabel,
} from "@plugins/ui/plugins/segmented-progress-bar/web";

// The ring is drawn in a 16-unit box centred on (8, 8); the stroke stays inside it.
const C = 8;
const R = 6.5;
const STROKE = 2;

/**
 * The fraction of the path reached, as one unbroken arc clockwise from 12
 * o'clock on a faint ring. The current step counts as reached, so the arc
 * agrees with the tooltip's "step n of N": step 1 of 4 is a quarter, the
 * last step the whole circle. One colour, no per-step marks — the tooltip
 * carries the step names.
 *
 * `compact` is the list-row form: a bare 12px ring in grey, so a row's only
 * colour stays its status. Otherwise it is the header form: a 16px ring in
 * the accent inside a round, icon-button-sized button that greys on hover
 * and pins the tooltip open on click.
 */
export function ArcRenderer({
  steps,
  activeStep,
  summary,
  compact = false,
}: SegmentedProgressBarProps) {
  const current = steps.findIndex((s) => s.id === activeStep);
  const label = progressStepLabel({ steps, activeStep });
  const tooltip = { steps, activeStep, summary };
  const arc = (
    <Arc
      fraction={Math.min(current + 1, steps.length) / steps.length}
      compact={compact}
    />
  );

  if (compact) {
    return (
      <ProgressStepsTooltip {...tooltip}>
        <span role="img" aria-label={label} className={rigidClass()}>
          {arc}
        </span>
      </ProgressStepsTooltip>
    );
  }
  return (
    <ProgressStepsTooltip {...tooltip} side="bottom" pinOnClick>
      {/* A native button centres its content on both axes by itself. */}
      <button
        type="button"
        aria-label={label}
        className={cn(
          "control-icon-sm focus-ring rounded-full transition-colors hover:bg-accent",
          rigidClass(),
        )}
      >
        {arc}
      </button>
    </ProgressStepsTooltip>
  );
}

function Arc({ fraction, compact }: { fraction: number; compact: boolean }) {
  const fill = compact ? "stroke-muted-foreground" : "stroke-primary";
  const a = -Math.PI / 2 + fraction * 2 * Math.PI;
  const end = `${+(C + R * Math.cos(a)).toFixed(2)} ${+(C + R * Math.sin(a)).toFixed(2)}`;
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      strokeWidth={STROKE}
      className={cn(compact ? "size-3" : "size-4", "mx-auto block")}
    >
      <circle cx={C} cy={C} r={R} className="stroke-muted-foreground/25" />
      {fraction >= 1 ? (
        <circle cx={C} cy={C} r={R} className={fill} />
      ) : (
        fraction > 0 && (
          <path
            d={`M${C} ${C - R} A${R} ${R} 0 ${fraction > 0.5 ? 1 : 0} 1 ${end}`}
            strokeLinecap="round"
            className={fill}
          />
        )
      )}
    </svg>
  );
}
