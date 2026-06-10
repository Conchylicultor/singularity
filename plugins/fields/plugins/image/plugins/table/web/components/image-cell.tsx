import type { ReactNode } from "react";
import type { TableCellProps } from "@plugins/primitives/plugins/data-view/web";

/** Read-only image cell: a small thumbnail of the projected URL. */
export function ImageCell(props: TableCellProps): ReactNode {
  const src = String(props.value ?? "");
  if (src === "") return null;
  return (
    <img
      src={src}
      alt=""
      className="size-8 rounded-md border border-border object-cover"
    />
  );
}
