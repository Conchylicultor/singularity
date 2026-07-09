import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { ReactNode } from "react";

import { BLOCK_GUTTER, BLOCK_INSET } from "../internal/page-column";

/**
 * Puts a host's own chrome (page icon, title, section list) on the block content
 * edge. The outer div owns the horizontal gutters (the rail on the left, its
 * mirror on the right); the inner `Inset` lands the children at `C + BLOCK_INSET`,
 * exactly where a block's content sits. Hosts must never re-derive this from
 * `BLOCK_GUTTER` — compose this component instead.
 */
export function PageContentColumn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div style={{ paddingLeft: BLOCK_GUTTER, paddingRight: BLOCK_GUTTER }}>
      <Inset x={BLOCK_INSET} className={className}>
        {children}
      </Inset>
    </div>
  );
}
