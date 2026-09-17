import type { ReactNode } from "react";
import { MdClose } from "react-icons/md";
import type {
  AnalyticsFilter,
  Dimension,
  ReportSource,
} from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { STACKED_FILTERS_NOTE, atFilterLimit } from "../internal/filters";
import { DIMENSION_LABEL, dimensionValueLabel } from "../internal/format";

/**
 * The active filters as removable chips, a Clear button, and — when the report
 * reads daily totals and its one filter is used — the line saying why no
 * second one can be added.
 */
export function FilterBar({
  filters,
  source,
  onRemove,
  onClear,
}: {
  filters: readonly AnalyticsFilter[];
  source: ReportSource;
  onRemove: (dimension: Dimension) => void;
  onClear: () => void;
}): ReactNode {
  if (filters.length === 0) return null;
  return (
    <Cluster gap="sm" align="center" aria-label="Filters">
      {filters.map((f) => {
        const value = dimensionValueLabel(f.dimension, f.value);
        return (
          <Inline key={f.dimension} gap="none">
            <Badge shape="pill" variant="muted">
              {DIMENSION_LABEL[f.dimension]} is <strong>{value}</strong>
            </Badge>
            <IconButton
              icon={MdClose}
              label={`Remove filter ${DIMENSION_LABEL[f.dimension]} is ${value}`}
              onClick={() => onRemove(f.dimension)}
            />
          </Inline>
        );
      })}
      <Button variant="ghost" onClick={onClear}>
        Clear
      </Button>
      {atFilterLimit(filters, source) && (
        <Text variant="caption" tone="muted">
          {STACKED_FILTERS_NOTE}
        </Text>
      )}
    </Cluster>
  );
}
