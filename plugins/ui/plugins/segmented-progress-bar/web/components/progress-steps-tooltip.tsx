import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import {
  WithTooltip,
  type WithTooltipProps,
} from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import type { ReactElement } from "react";
import type { SegmentedProgressBarProps } from "../../core";

type Props = Pick<
  SegmentedProgressBarProps,
  "steps" | "activeStep" | "summary"
>;

/** The one-line name of where the bar stands: `Design · step 2 of 4`. */
export function progressStepLabel({
  steps,
  activeStep,
}: Pick<Props, "steps" | "activeStep">): string {
  const current = steps.findIndex((s) => s.id === activeStep);
  return `${steps[current]?.label ?? activeStep} · step ${current + 1} of ${steps.length}`;
}

// Past steps a quiet accent, the current one a strong accent, the rest a faint fill.
const SEGMENT = {
  done: "bg-primary/45",
  now: "bg-primary",
  todo: "bg-muted-foreground/25",
} as const;

/**
 * The tooltip every variant wraps its bar in: where the bar stands and what it
 * tracks, then the whole path as a stepper — one equal segment per step with
 * its name under it, the current one lit — and what the current step means.
 * So a user who has never seen the bar learns the full path from one hover.
 *
 * It owns the tooltip, not just its body: the stepper needs more room than a
 * tooltip's default width, and a variant cannot forget to give it.
 */
export function ProgressStepsTooltip({
  side,
  children,
  ...props
}: Props & {
  side?: WithTooltipProps["side"];
  /** The bar — the tooltip's trigger. */
  children: ReactElement;
}) {
  return (
    <WithTooltip
      content={<StepsBody {...props} />}
      side={side}
      className="max-w-md"
    >
      {children}
    </WithTooltip>
  );
}

function StepsBody({ steps, activeStep, summary }: Props) {
  const current = steps.findIndex((s) => s.id === activeStep);
  return (
    <Stack gap="sm" className="min-w-56 py-2xs">
      <Stack gap="none">
        <Text variant="caption" className="font-medium">
          {progressStepLabel({ steps, activeStep })}
        </Text>
        <Text variant="caption" tone="muted">
          {summary}
        </Text>
      </Stack>
      {/* Equal columns: sized to fit, each is as wide as the longest name. */}
      <Grid as="ol" cols={steps.length} gap="sm">
        {steps.map((step, i) => {
          const state = i < current ? "done" : i === current ? "now" : "todo";
          return (
            <Stack as="li" key={step.id} gap="2xs">
              <span className={cn("h-1 rounded-sm", SEGMENT[state])} />
              <Text
                variant="caption"
                tone={state === "now" ? "default" : "muted"}
                className={cn(
                  "whitespace-nowrap",
                  state === "now" && "font-medium",
                )}
              >
                {step.label}
              </Text>
            </Stack>
          );
        })}
      </Grid>
      {steps[current] && (
        <Text variant="caption" tone="muted">
          {steps[current].description}
        </Text>
      )}
    </Stack>
  );
}
