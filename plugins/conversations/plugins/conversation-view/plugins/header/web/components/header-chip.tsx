import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";

/**
 * A chip in the conversation header (the model chip, the status chip): a
 * bordered pill whose shape is the header-chip pad tokens (`padChipHeader*`,
 * defaulting to the regular chip's pad) and whose words are the `tag` role —
 * pinned here (`text-tag font-tag`) so the chip keeps the full tag rung even
 * where the ambient control density would step a `Badge` to its compact rung.
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
      className="border p-chip-header text-tag font-tag"
    >
      {children}
    </Badge>
  );
}
