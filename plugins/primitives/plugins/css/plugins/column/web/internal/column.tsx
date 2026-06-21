import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import type { SpaceStep } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  cn,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";
import type { ReactNode } from "react";

const GAP_CLASS: Record<SpaceStep, string> = {
  none: "gap-none",
  "2xs": "gap-2xs",
  xs: "gap-xs",
  sm: "gap-sm",
  md: "gap-md",
  lg: "gap-lg",
  xl: "gap-xl",
  "2xl": "gap-2xl",
};

export interface ColumnProps extends React.HTMLAttributes<HTMLElement> {
  /** Rigid top region — never shrinks (`shrink-0`). */
  header?: ReactNode;
  /** Flexible middle region — by default wrapped in `<Scroll axis="y" fill>` so
   *  it absorbs the column's slack and scrolls; set `scrollBody={false}` for a
   *  plain flexible region that manages its own overflow. */
  body?: ReactNode;
  /** Rigid bottom region — never shrinks (`shrink-0`). */
  footer?: ReactNode;
  /** Wrap `body` in a `<Scroll axis="y" fill>` cell. Defaults to true. */
  scrollBody?: boolean;
  /** Hide the scrollbar chrome on the managed `Scroll` body while keeping it
   *  scrollable. Only applies when `scrollBody` is true. Defaults to false. */
  hideScrollbar?: boolean;
  /** Emit the flex-child fill pair (`min-h-0 flex-1`) so the column fills its own
   *  flex-col parent. Defaults to false. */
  fill?: boolean;
  /** Gap role from the spacing ramp between regions. Defaults to `none` (flush). */
  gap?: SpaceStep;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
  /** Forwarded to the rendered element (mirrors Surface/Card/Row). */
  ref?: React.Ref<HTMLElement>;
}

/**
 * The named-slot **column** primitive — a vertical stack of up to three role
 * slots — `header` / `body` / `footer` — laid out as a flex column with the
 * `rigid | flexible | rigid` fill policy baked into one place: the header/footer
 * wrappers are `shrink-0` (never crushed), and the body is the single flexible
 * region.
 *
 * `Column`'s requirement is the textbook flex-column (rigid header,
 * growing+scrolling body, rigid footer) — exactly what `Scroll`'s `fill`
 * (`min-h-0 flex-1 overflow-y-auto`) was built for. So `Column` owns the
 * `flex flex-col` + rigid wrappers and **delegates the scroll body to `Scroll`**
 * (composition); `Scroll` stays the single owner of `overflow`.
 *
 * Callers write roles, never mechanics (no per-call-site `shrink-0` / `min-h-0` /
 * `flex-1`). Only present slots render — an absent slot produces no region. Caller
 * `className` composes last.
 */
export function Column({
  header,
  body,
  footer,
  scrollBody = true,
  hideScrollbar = false,
  fill = false,
  gap = "none",
  as: As = "div",
  ref,
  className,
  ...rest
}: ColumnProps) {
  return (
    // Flow container (always vertical): RESETS the single-line contract so stacked
    // regions wrap — `whitespace-normal` re-wraps raw text and the `SingleLine`
    // reset stops leaves from truncating, in case the column is nested inside a
    // line container (Row/Bar).
    <SingleLineProvider value={false}>
      <As
        ref={ref}
        className={cn(
          "flex flex-col whitespace-normal",
          GAP_CLASS[gap],
          fill && "min-h-0 flex-1",
          className,
        )}
        {...rest}
      >
        {header != null && <div className="shrink-0">{header}</div>}
        {body != null &&
          (scrollBody ? (
            <Scroll axis="y" fill hideScrollbar={hideScrollbar}>
              {body}
            </Scroll>
          ) : (
            <div className="min-h-0 flex-1">{body}</div>
          ))}
        {footer != null && <div className="shrink-0">{footer}</div>}
      </As>
    </SingleLineProvider>
  );
}
