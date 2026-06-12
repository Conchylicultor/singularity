import type { ReactNode } from "react";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";
import { Text } from "@plugins/primitives/plugins/text/web";

/** Read-only color cell: a small swatch tinted with the projected CSS color. */
export function ColorCell(props: TableCellProps): ReactNode {
  const color = String(props.value ?? "");
  if (color === "") return null;
  return (
    <span className="flex items-center gap-xs">
      <span
        className="size-4 shrink-0 rounded-md border border-border"
        style={{ background: color }}
      />
      <Text variant="caption" tone="muted" className="tabular-nums">
        {color}
      </Text>
    </span>
  );
}
