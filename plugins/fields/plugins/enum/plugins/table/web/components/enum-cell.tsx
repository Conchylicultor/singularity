import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only enum cell: the option label as a chip, tinted and explained by the
 *  option itself. */
export function EnumCell(props: TableCellProps): ReactNode {
  const raw = props.value == null ? "" : String(props.value);
  if (raw === "") return null;
  // `field.options` is authoritative for every enum field, custom column included
  // — a custom column's private `config.options` is projected onto it by this
  // type's `ColumnConfig.derive` (see fields/enum column-config).
  const option = props.field.options?.find((o) => o.value === raw);
  // An option that declares no `variant` is "muted" — the right default for a
  // value with no semantics (every user-authored custom column). `hint` is the
  // option's own explanation of what the value means, spent as the chip's title.
  return (
    <Badge variant={option?.variant ?? "muted"} title={option?.hint}>
      {option?.label ?? raw}
    </Badge>
  );
}
