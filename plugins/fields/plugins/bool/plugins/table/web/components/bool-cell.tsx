import type { ReactNode } from "react";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const checkIcon = symbol("check");
const removeIcon = symbol("remove");

/** Read-only boolean cell: a check for truthy, a muted dash otherwise. */
export function BoolCell(props: TableCellProps): ReactNode {
  return props.value ? (
    <Icon icon={checkIcon} className="text-foreground" aria-label="true" />
  ) : (
    <Icon
      icon={removeIcon}
      className="text-muted-foreground"
      aria-label="false"
    />
  );
}
