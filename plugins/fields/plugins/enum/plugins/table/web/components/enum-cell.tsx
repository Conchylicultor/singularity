import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only enum cell: the option label as a chip. */
export function EnumCell(props: TableCellProps): ReactNode {
  const raw = props.value == null ? "" : String(props.value);
  if (raw === "") return null;
  // `field.options` is authoritative for every enum field, custom column included
  // — a custom column's private `config.options` is projected onto it by this
  // type's `ColumnConfig.derive` (see fields/enum column-config).
  const label = props.field.options?.find((o) => o.value === raw)?.label ?? raw;
  return <Badge variant="muted">{label}</Badge>;
}
