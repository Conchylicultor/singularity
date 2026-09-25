import { useId } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import type { SegmentedProgressBarProps } from "@plugins/ui/plugins/segmented-progress-bar/core";
import {
  ProgressStepsTooltip,
  progressStepLabel,
} from "@plugins/ui/plugins/segmented-progress-bar/web";

// The circle is drawn in a 16-unit box centred on (8, 8), radius 8.
const C = 8;

/** A point on the circle of radius `r` at the start of wedge `i` of `n`, clockwise from 12 o'clock. */
function point(r: number, i: number, n: number): [number, number] {
  const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
  return [+(C + r * Math.cos(a)).toFixed(2), +(C + r * Math.sin(a)).toFixed(2)];
}

function wedge(i: number, n: number): string {
  const [x0, y0] = point(C, i, n);
  const [x1, y1] = point(C, i + 1, n);
  return `M${C} ${C} L${x0} ${y0} A${C} ${C} 0 0 1 ${x1} ${y1} Z`;
}

// Past steps a quiet accent, the current one a strong accent, the rest a faint fill.
const FILL = {
  done: "fill-primary/45",
  now: "fill-primary/85",
  todo: "fill-muted-foreground/25",
} as const;

/**
 * One wedge per step, the gaps between them straight bars of constant width
 * (masked out of whole wedges — an angular gap would widen toward the rim).
 *
 * `compact` is the list-row form: a bare 12px pie. Otherwise it is the header
 * form: a 16px pie in a round, icon-button-sized target that greys on hover.
 * Both show every step in a tooltip.
 */
export function PieRenderer({
  steps,
  activeStep,
  summary,
  compact = false,
}: SegmentedProgressBarProps) {
  const current = steps.findIndex((s) => s.id === activeStep);
  const label = progressStepLabel({ steps, activeStep });
  const tooltip = { steps, activeStep, summary };
  const pie = <Pie steps={steps} current={current} compact={compact} />;

  if (compact) {
    return (
      <ProgressStepsTooltip {...tooltip}>
        <span role="img" aria-label={label} className={rigidClass()}>
          {pie}
        </span>
      </ProgressStepsTooltip>
    );
  }
  return (
    <ProgressStepsTooltip {...tooltip} side="bottom">
      <Center
        as="span"
        role="img"
        aria-label={label}
        tabIndex={0}
        className={cn(
          "control-icon-sm focus-ring rounded-full transition-colors hover:bg-accent",
          rigidClass(),
        )}
      >
        {pie}
      </Center>
    </ProgressStepsTooltip>
  );
}

function Pie({
  steps,
  current,
  compact,
}: {
  steps: SegmentedProgressBarProps["steps"];
  current: number;
  compact: boolean;
}) {
  const mask = `pie-${useId().replace(/:/g, "")}`;
  const n = steps.length;
  // The gap's on-screen width stays ~1px at either size.
  const gap = compact ? 1.2 : 1;
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn(compact ? "size-3" : "size-4", "block")}
    >
      <mask
        id={mask}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="16"
        height="16"
      >
        <rect width="16" height="16" fill="white" />
        {steps.map((s, i) => {
          const [x, y] = point(C + 2, i, n);
          return (
            <line
              key={s.id}
              x1={C}
              y1={C}
              x2={x}
              y2={y}
              stroke="black"
              strokeWidth={gap}
            />
          );
        })}
      </mask>
      <g mask={`url(#${mask})`}>
        {steps.map((s, i) => (
          <path
            key={s.id}
            d={wedge(i, n)}
            className={
              i < current ? FILL.done : i === current ? FILL.now : FILL.todo
            }
          />
        ))}
      </g>
    </svg>
  );
}
