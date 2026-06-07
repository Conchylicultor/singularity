import type { ReactNode } from "react";
import { MdCheck, MdRemove } from "react-icons/md";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only boolean cell: a check for truthy, a muted dash otherwise. */
export function BoolCell(props: TableCellProps): ReactNode {
  return props.value ? (
    <MdCheck className="text-foreground" aria-label="true" />
  ) : (
    <MdRemove className="text-muted-foreground" aria-label="false" />
  );
}
