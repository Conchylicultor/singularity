import type { ReactNode } from "react";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/** Read-only color cell: a small swatch tinted with the projected CSS color. */
export function ColorCell(props: TableCellProps): ReactNode {
  const color = String(props.value ?? "");
  if (color === "") return null;
  return (
    <Stack as="span" direction="row" align="center" gap="xs">
      <span
        className="size-4 rounded-md border border-border"
        style={{ background: color }}
      />
      <Text variant="caption" tone="muted" className="tabular-nums">
        {color}
      </Text>
    </Stack>
  );
}
