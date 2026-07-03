import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only enum cell: the option label as a chip. */
export function EnumCell(props: TableCellProps): ReactNode {
  const raw = props.value == null ? "" : String(props.value);
  if (raw === "") return null;
  // A custom column carries its enum options on `field.config.options` (not
  // `field.options`), so fall back to it — see fields/enum column-config.
  const options =
    props.field.options ??
    (props.field.config as { options?: { value: string; label: string }[] } | undefined)
      ?.options ??
    [];
  const label = options.find((o) => o.value === raw)?.label ?? raw;
  return (
    <Badge variant="muted">
      {label}
    </Badge>
  );
}
