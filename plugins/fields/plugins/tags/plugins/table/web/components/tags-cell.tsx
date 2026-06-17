import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only tags cell: each tag as a muted chip on one truncating line. */
export function TagsCell(props: TableCellProps): ReactNode {
  const tags = props.values ?? [];
  if (tags.length === 0) return null;
  const labelFor = (v: string) =>
    props.field.options?.find((o) => o.value === v)?.label ?? v;
  return (
    <div className="flex min-w-0 gap-xs overflow-hidden whitespace-nowrap">
      {tags.map((t) => (
        <Badge key={t} size="sm" variant="muted">
          {labelFor(t)}
        </Badge>
      ))}
    </div>
  );
}
