import type { ReactNode } from "react";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only numeric cell: renders the projected value as text. */
export function NumberCell(props: TableCellProps): ReactNode {
  return <span className="tabular-nums">{String(props.value ?? "")}</span>;
}
