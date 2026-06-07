import type { ReactNode } from "react";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only color cell: a small swatch tinted with the projected CSS color. */
export function ColorCell(props: TableCellProps): ReactNode {
  const color = String(props.value ?? "");
  if (color === "") return null;
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-4 shrink-0 rounded border border-border"
        style={{ background: color }}
      />
      <span className="text-xs text-muted-foreground tabular-nums">{color}</span>
    </span>
  );
}
