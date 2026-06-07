import type { ReactNode } from "react";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only text cell: single-line, truncates on overflow. */
export function TextCell(props: TableCellProps): ReactNode {
  return <span className="truncate">{String(props.value ?? "")}</span>;
}
