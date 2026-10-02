import type { ReactNode } from "react";
import { ChartState } from "@plugins/primitives/plugins/metrics/plugins/chart-kit/web";
import { CardFrame } from "./card-frame";

export interface MetricErrorProps {
  /** What the card would have shown (a metric id, a breakdown's label). */
  title: string;
  message: string;
  onRetry?: () => void;
  /** The body height, so an error card sits in its row like the chart it replaces. */
  height?: number;
}

/**
 * A card that could not be drawn — an unknown ref, an illegal display, a
 * failed read — naming why, in the card's own place and at its own height.
 */
export function MetricError({
  title,
  message,
  onRetry,
  height = 240,
}: MetricErrorProps): ReactNode {
  return (
    <CardFrame title={title}>
      <ChartState
        state="error"
        height={height}
        message={message}
        onRetry={onRetry}
      />
    </CardFrame>
  );
}
