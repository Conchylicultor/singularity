import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only tags cell: each tag as a muted chip on one truncating line. */
export function TagsCell(props: TableCellProps): ReactNode {
  const tags = props.values ?? [];
  if (tags.length === 0) return null;
  const labelFor = (v: string) =>
    props.field.options?.find((o) => o.value === v)?.label ?? v;
  return (
    <Clip className="whitespace-nowrap">
      <Stack direction="row" gap="xs">
        {tags.map((t) => (
          <Badge key={t} variant="muted">
            {labelFor(t)}
          </Badge>
        ))}
      </Stack>
    </Clip>
  );
}
