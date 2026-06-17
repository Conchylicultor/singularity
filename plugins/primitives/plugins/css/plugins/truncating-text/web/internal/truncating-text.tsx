import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import type { ElementType, ReactNode } from "react";

export interface TruncatingTextProps {
  children: ReactNode;
  /** Element to render. Defaults to `span`. */
  as?: ElementType;
  className?: string;
  /**
   * Native hover tooltip. Pass the full text so the truncated content stays
   * discoverable. Auto-derived when `children` is a string.
   */
  title?: string;
}

/**
 * Single-line text that truncates with an ellipsis instead of wrapping.
 *
 * Bakes in the `min-w-0` + `truncate` pair that flexible text needs inside a
 * flex row — the combination contributors routinely forget (a missing `min-w-0`
 * makes `truncate` silently no-op and the text wraps when compressed). Drop this
 * in wherever a label sits next to fixed controls in a horizontal chrome row.
 */
export function TruncatingText({
  children,
  as: Component = "span",
  className,
  title,
}: TruncatingTextProps) {
  return (
    <Component
      className={cn("min-w-0 truncate", className)}
      title={title ?? (typeof children === "string" ? children : undefined)}
    >
      {children}
    </Component>
  );
}
