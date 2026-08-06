import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import {
  RowActions,
  rowActionsAnchor,
} from "@plugins/primitives/plugins/row-actions/web";
import type React from "react";

export type RowSize = "sm" | "md";
export type RowHover = "accent" | "muted";

export interface RowProps {
  /** Persistent selection → bg-accent; aria-current on buttons. */
  selected?: boolean;
  /** Text+gap density only; PADDING is always p-row. sm=text-xs gap-1.5, md=text-sm gap-2. Default "md". */
  size?: RowSize;
  /** Hover treatment. "accent" (sidebars/menus, default) | "muted" (cards/popovers). */
  hover?: RowHover;
  /** Adds a `border` (bordered chip-rows). */
  bordered?: boolean;
  /** Tree depth px → style paddingLeft (overrides p-row's left). */
  indent?: number;
  /** Leading slot (icon / StatusDot / chevron), rendered before children. */
  icon?: React.ReactNode;
  /** Trailing slot, rendered through the `row-actions` primitive; hover-revealed by default. */
  actions?: React.ReactNode;
  actionsAlwaysVisible?: boolean;
  /**
   * Forwarded to the row's outermost element (the row box) — the one intentional
   * divergence from ToggleChip (tree DnD / scroll-into-view depend on it).
   */
  ref?: React.Ref<HTMLElement>;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
  /**
   * Permissive passthrough for the rendered element (onClick, href, download,
   * role, aria-*, …). The element is INFERRED from these — there is no `as`:
   * `href` → `<a>`, otherwise `onClick`/`disabled` → `<button>`, otherwise a
   * non-interactive `<div>`. So a clickable row + interactive `actions` can never
   * emit invalid nested-interactive DOM.
   */
  [key: string]: unknown;
}

export function Row({
  selected,
  size = "md",
  hover = "accent",
  bordered,
  indent,
  icon,
  actions,
  actionsAlwaysVisible,
  ref,
  disabled,
  className,
  children,
  ...rest
}: RowProps) {
  // The element is inferred, never authored: a row with `href` is a link, a row
  // with `onClick`/`disabled` is a button, anything else is a plain container.
  // This removes the `as` footgun — a clickable row can no longer be declared as
  // a `<button>` that then nests its `actions` buttons (invalid DOM).
  const href = (rest as { href?: unknown }).href;
  const onClick = (rest as { onClick?: unknown }).onClick;
  const Tag: React.ElementType =
    href != null ? "a" : onClick != null || disabled != null ? "button" : "div";
  const isButton = Tag === "button";
  const interactive = Tag !== "div";

  // The single-line contract (region-line + SingleLineProvider) comes from
  // <Line>; Row layers its interactive row chrome (width, padding, hover) on top.
  //
  // `rowActionsAnchor` is unconditional: it establishes the `group/row-actions`
  // hover group the actions cluster reveals off (a CSS group, so a hovered row
  // costs zero re-renders — the list and table views window 100+ rows), plus the
  // `relative` a pinned cluster anchors to. Both are inert on a row with no
  // actions, and pinning them to `actions ? …` would only make the row's
  // positioning context depend on which slots the caller filled.
  const chromeClass = cn(
    "group w-full rounded-md p-row text-left transition-colors [&_svg:not([class*='size-'])]:icon-auto",
    rowActionsAnchor,
    "disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "gap-xs text-caption",
    size === "md" && "gap-sm text-body",
    // Each tint co-publishes itself as `--scrim` — the color the pinned action
    // cluster's mask paints so it hides the row instead of letting the label
    // show through the action icons. Same contract as a Surface publishing
    // `--chrome-mask`, one level down: the surface says what is behind the row,
    // the row says what is *painted* on it right now. A translucent tint
    // publishes its composite over the ambient mask, which is why this is a
    // second property and not a `--chrome-mask` re-declaration — a custom
    // property whose value reads itself is a cycle, and CSS drops it.
    hover === "accent" &&
      (selected
        ? "bg-accent [--scrim:var(--accent)]"
        : "hover:bg-accent hover:[--scrim:var(--accent)]"),
    hover === "muted" &&
      (selected
        ? "bg-muted [--scrim:var(--muted)]"
        : // `in srgb`, not oklab: this must reproduce what ALPHA COMPOSITING of
          // `bg-muted/50` over the backdrop paints, and that happens in sRGB.
          "hover:bg-muted/50 hover:[--scrim:color-mix(in_srgb,var(--muted)_50%,var(--chrome-mask))]"),
    bordered && "border",
    className,
  );
  const style = indent !== undefined ? { paddingLeft: indent } : undefined;

  // The trailing cluster is the `row-actions` primitive — the ONE implementation
  // of a row-action cluster, owning the reveal, the popup-hold, the click +
  // pointerdown guards (a press on an action must not fire the row's onClick nor
  // arm its drag source) and the control size. `Row` keeps only the PLACEMENT
  // decision, which is the one thing that genuinely differs per host:
  //
  // - Hover-revealed actions are PINNED to the right edge, so a hidden cluster
  //   reserves ZERO flow width — otherwise a multi-button cluster (e.g. a queue
  //   row's 4 icon buttons) permanently steals ~100px from the row body via
  //   `shrink-0`, collapsing the flex-1 title cell and truncating the title even
  //   when nothing is shown. On reveal the cluster overlays the row's right edge,
  //   which is why the pin's `mask` (owned by the primitive) is not optional: it
  //   paints the row's own `--scrim` under the buttons with a gradient ramp on
  //   its inner edge, so what the cluster covers (a trailing status badge, a long
  //   title) dissolves under it rather than interleaving its glyphs with the
  //   icons. Reserving the width instead would cure the overlap too, at the cost
  //   the paragraph above rejects.
  // - `actionsAlwaysVisible` actions instead stay in flow (`pin={null}`): they
  //   are part of the row layout and legitimately reserve their space, so the
  //   placement `Row` hands down is `ml-auto shrink-0` — flush right, never
  //   crushed.
  //
  // Either way they paint above the split path's `z-under` hit-area, so their
  // buttons stay clickable.
  const actionsCluster = actions ? (
    <RowActions
      pin={actionsAlwaysVisible ? null : "right"}
      alwaysVisible={actionsAlwaysVisible}
      className={actionsAlwaysVisible ? "ml-auto shrink-0" : undefined}
    >
      {actions}
    </RowActions>
  ) : null;

  // SPLIT PATH — an interactive row that also carries actions. The interactive
  // element must be a SIBLING of the actions, never their ancestor, so we render
  // a non-interactive container and put the primary <button>/<a> beside the
  // actions. A full-bleed, aria-hidden hit-area child keeps the whole padded row
  // clickable and gives the button its accessible name from {children}.
  //
  // The hit-area is sized to the CONTAINER (`inset-0` resolves against the
  // `relative` box, not the button), so it also covers the `p-row` padding ring
  // the button — a `flex-1` child of an `items-center` line — can never reach.
  //
  // It MUST paint below the row's own content (`z-under`), never above it.
  // Absolutely-positioned siblings paint over non-positioned ones regardless of
  // DOM order, so an on-top hit-area silently swallows every pointer event aimed
  // at the row body: hover-driven body content (a tooltip trigger, a CSS
  // `group-hover` chip) goes dead, because :hover only applies to the element
  // under the pointer and its ANCESTORS — and the hit-area is a sibling. Clicks
  // on the ring still land on it (nothing else is there to hit), so pushing it
  // under costs nothing. `isolate` is load-bearing: it makes the container a
  // stacking context, without which the negative layer escapes to the nearest
  // one up the tree and sinks behind intervening backgrounds.
  if (interactive && actions) {
    return (
      <Line
        as="div"
        ref={ref}
        className={cn(chromeClass, "isolate")}
        style={style}
      >
        <Tag
          type={isButton ? "button" : undefined}
          disabled={isButton ? disabled : undefined}
          aria-current={isButton && selected ? true : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center text-left",
            size === "sm" ? "gap-xs" : "gap-sm",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          {...rest}
        >
          {icon}
          {children}
          <span aria-hidden className="absolute inset-0 z-under rounded-md" />
        </Tag>
        {actionsCluster}
      </Line>
    );
  }

  // SINGLE-ELEMENT PATH — no actions (any element), or a non-interactive
  // container row with actions (a <div> may legally nest the action buttons).
  // The positioning context a hover-revealed cluster pins against already comes
  // from `rowActionsAnchor` in `chromeClass`.
  return (
    <Line
      as={Tag}
      ref={ref}
      type={isButton ? "button" : undefined}
      disabled={isButton ? disabled : undefined}
      aria-current={isButton && selected ? true : undefined}
      className={chromeClass}
      style={style}
      {...rest}
    >
      {icon}
      {children}
      {actionsCluster}
    </Line>
  );
}
