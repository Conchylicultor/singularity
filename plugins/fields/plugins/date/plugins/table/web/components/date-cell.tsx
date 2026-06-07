import type { ReactNode } from "react";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only date cell: a relative "Nd ago" label. */
export function DateCell(props: TableCellProps): ReactNode {
  const { value } = props;
  const date =
    value instanceof Date
      ? value
      : value == null || value === ""
        ? null
        : new Date(value as string);
  if (!date || Number.isNaN(date.getTime())) return null;
  return <span>{formatRelativeTime(date)}</span>;
}
