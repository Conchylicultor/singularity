import type { ReactNode } from "react";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { TimeChartKind } from "../../core";
import { KeyMark } from "./key-mark";

export interface LegendProps {
  /** The series, colours resolved. */
  series: readonly { key: string; label: string; color: string }[];
  kind: TimeChartKind;
  /** The compare line's label, when one is drawn. */
  compareLabel?: string | null;
}

/**
 * A chart's legend. Present only when there is something to tell apart — two or
 * more series, or a compare line; a single series is named by its card's title.
 * Keys mirror the mark (a square for bars / areas, a stroke for lines); the
 * labels stay in text tokens.
 */
export function Legend({ series, kind, compareLabel }: LegendProps): ReactNode {
  const showSeries = series.length > 1;
  if (!showSeries && !compareLabel) return null;
  const shape = kind === "line" ? "line" : "rect";
  return (
    <Cluster gap="md" role="list" aria-label="Legend">
      {showSeries &&
        series.map((s) => (
          <Stack
            key={s.key}
            direction="row"
            gap="xs"
            align="center"
            role="listitem"
          >
            <KeyMark shape={shape} color={s.color} />
            <Text variant="caption" tone="subtle">
              {s.label}
            </Text>
          </Stack>
        ))}
      {compareLabel && (
        <Stack direction="row" gap="xs" align="center" role="listitem">
          <KeyMark shape="dash" />
          <Text variant="caption" tone="subtle">
            {compareLabel}
          </Text>
        </Stack>
      )}
    </Cluster>
  );
}
