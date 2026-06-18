import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ElementType, ReactNode } from "react";
import type React from "react";

/** Which edge keeps its text. `end` ellipsizes the tail; `start` ellipsizes the lead. */
export type TruncateSide = "end" | "start";

export interface TruncatingTextProps
  extends React.HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Element to render. Defaults to `span`. Pass `button` to make the leaf itself interactive. */
  as?: ElementType;
  /**
   * Native hover tooltip. Pass the full text so the truncated content stays
   * discoverable. Auto-derived when `children` is a string.
   */
  title?: string;
  /**
   * Which edge keeps its text. `end` (default) ellipsizes the tail (`foo/bar/lo…`);
   * `start` ellipsizes the leading chars and keeps the tail visible (`…/bar/baz.ts`) —
   * the right default for file paths and long identifiers.
   */
  side?: TruncateSide;
  /** Forwarded to the rendered element (mirrors the other css/* primitives). */
  ref?: React.Ref<HTMLElement>;
}

/**
 * Single-line text that truncates with an ellipsis instead of wrapping.
 *
 * Bakes in the `min-w-0` + `truncate` pair that flexible text needs inside a
 * flex row — the combination contributors routinely forget (a missing `min-w-0`
 * makes `truncate` silently no-op and the text wraps when compressed). Drop this
 * in wherever a label sits next to fixed controls in a horizontal chrome row.
 *
 * ## Truncates regardless of parent display context (`inline-block max-w-full`)
 *
 * Tailwind's `truncate` (`overflow:hidden` + `text-overflow:ellipsis`) only
 * takes effect on a box that establishes a block formatting context — a
 * block/inline-block element or a flex/grid item (which CSS *blockifies*). A
 * plain `<span>` is inline, so on an inline element `truncate` silently no-ops
 * and the text overflows at full width. That bites only OUTSIDE a flex/grid
 * row — e.g. when this leaf is a *node* child of a plain block `<div>` (such as
 * `Frame`'s node-slot wrapper, which nests its child in a bare `min-w-0` div).
 *
 * The leaf defends against this itself: `inline-block` makes the box always
 * honor overflow (a flex/grid item blockifies `inline-block` → `block` exactly
 * as it would `inline`, so the row case is unchanged), and `max-w-full` caps it
 * at its container so it ellipsizes against the parent instead of overflowing.
 * The result is a leaf that truncates the same in a flex row, a grid track, or a
 * bare block parent — eliminating the second silent-no-op mode at the source.
 *
 * `side="start"` flips the ellipsis to the leading edge via the RTL technique:
 * the host element is laid out `dir="rtl"` (so `text-overflow` clips at the visual
 * start, with `text-left` keeping the visible tail flush-left), while the children
 * are isolated in a `dir="ltr"` run so the path still reads left-to-right. The home
 * for the old hand-rolled `direction:rtl` + `text-overflow` path chips.
 */
export function TruncatingText({
  children,
  as: Component = "span",
  className,
  title,
  side = "end",
  ...rest
}: TruncatingTextProps) {
  const resolvedTitle =
    title ?? (typeof children === "string" ? children : undefined);

  if (side === "start") {
    return (
      <Component
        dir="rtl"
        className={cn(
          "inline-block max-w-full min-w-0 truncate text-left",
          className,
        )}
        title={resolvedTitle}
        {...rest}
      >
        <span dir="ltr" style={{ unicodeBidi: "embed" }}>
          {children}
        </span>
      </Component>
    );
  }

  return (
    <Component
      className={cn("inline-block max-w-full min-w-0 truncate", className)}
      title={resolvedTitle}
      {...rest}
    >
      {children}
    </Component>
  );
}
