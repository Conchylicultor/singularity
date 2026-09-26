import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";

/**
 * A chip in the conversation header (the model chip, the status chip): a
 * bordered pill whose shape and type are the header-chip tokens —
 * `padChipHeader*` (density) and `*ChipHeader` (type-scale). Their defaults are
 * the regular chip's pad, caption size and medium weight, so a theme that
 * leaves them out paints exactly a `Badge shape="pill"`.
 *
 * `colorClass` carries the chip's fill, text and border colours (a status map,
 * or the neutral `chip` / `subtle` roles); the shape is not the caller's.
 */
export function HeaderChip({
  colorClass,
  children,
}: {
  colorClass: string;
  children: ReactNode;
}) {
  return (
    <Badge
      shape="pill"
      colorClass={colorClass}
      className="border p-chip-header text-chip-header font-chip-header"
    >
      {children}
    </Badge>
  );
}
