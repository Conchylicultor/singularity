import type { ReactNode } from "react";
import { Placed } from "@plugins/primitives/plugins/css/plugins/coords/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { KeyMark, type KeyShape } from "./key-mark";

/** One line of a chart tooltip: the value leads, the series label follows. */
export interface TooltipRow {
  key: string;
  shape: KeyShape;
  color?: string;
  value: string;
  label: string;
}

/** Roughly how wide a tooltip is, to flip it left before it overflows. */
const TOOLTIP_WIDTH = 190;
/** The gap between the hovered x and the tooltip's edge. */
const OFFSET = 14;

export interface ChartTooltipProps {
  /** The hovered x, in the chart box's px. */
  x: number;
  /** The chart box's width. */
  width: number;
  title: string;
  rows: readonly TooltipRow[];
  footer?: string;
}

/**
 * The hover readout, an HTML overlay beside the hovered x (flipped to the left
 * near the right edge). Values are the strong element; labels and keys follow,
 * in text tokens. It never takes the pointer, so hovering stays on the plot.
 */
export function ChartTooltip({
  x,
  width,
  title,
  rows,
  footer,
}: ChartTooltipProps): ReactNode {
  const flip = x + OFFSET + TOOLTIP_WIDTH > width;
  return (
    <Placed
      x={flip ? { end: width - x + OFFSET } : { start: x + OFFSET }}
      y={{ start: 4 }}
      layer="overlay"
      decorative
      role="status"
      data-chart-tooltip=""
    >
      <Surface level="overlay" className="min-w-40 whitespace-nowrap">
        <Inset pad="sm">
          <Stack gap="xs">
            <Text variant="caption" tone="muted">
              {title}
            </Text>
            {rows.map((r) => (
              <Stack key={r.key} direction="row" gap="xs" align="center">
                <KeyMark shape={r.shape} color={r.color} />
                <Text variant="label" className="tabular-nums">
                  {r.value}
                </Text>
                <Text variant="caption" tone="subtle">
                  {r.label}
                </Text>
              </Stack>
            ))}
            {footer && (
              <Text variant="caption" tone="faint">
                {footer}
              </Text>
            )}
          </Stack>
        </Inset>
      </Surface>
    </Placed>
  );
}
