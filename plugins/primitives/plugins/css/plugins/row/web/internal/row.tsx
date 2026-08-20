import { useCallback, useImperativeHandle, useRef } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import {
  RowActions,
  rowActionsAnchor,
} from "@plugins/primitives/plugins/row-actions/web";
import type React from "react";

export type RowSize = "sm" | "md";
export type RowHover = "accent" | "muted";

/**
 * The row's focusable control, as a capability rather than a node. `Row` decides
 * WHICH element that is — the row box, or the inner button of the split path
 * below — and deliberately never says, so a holder can focus it and do nothing
 * else with it.
 */
export interface RowFocus {
  /** Move DOM focus onto the row's control. */
  focus(): void;
}

/** Write one node into a ref of either form (callback or object). */
function setRef(
  ref: React.Ref<HTMLElement> | undefined,
  el: HTMLElement | null,
) {
  if (typeof ref === "function") ref(el);
  else if (ref) ref.current = el;
}

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
   * Forwarded to the ROW ELEMENT — the row's outermost box — the one intentional
   * divergence from ToggleChip (tree DnD / scroll-into-view depend on it).
   *
   * It is the node you measure, drag, or scroll into view. It is never the node
   * you focus: on a row carrying `actions` the box is a plain `<div>` that
   * cannot take focus at all. Reach for `focusRef`, which hands out the
   * capability instead of the node.
   */
  ref?: React.Ref<HTMLElement>;
  /**
   * The capability to move focus onto the row's control — NOT that control's
   * node. A host that lands focus on a row programmatically (keyboard
   * navigation arriving at a void editor block) calls `focusRef.current.focus()`
   * and is told nothing else about the element it focused.
   *
   * Handing out the node is the bug this replaces. The control is SYNTHESIZED by
   * `Row`: it is the row box right up until the row carries `actions`, and from
   * that moment on it is an inner `<button>`/`<a>` rendered as a SIBLING of the
   * action cluster (nesting interactive elements is invalid DOM). So a caller
   * holding the node held one that changed identity the day someone added an
   * action, and the old `interactiveRef` — a second ref you had to know to reach
   * for — failed SILENTLY when you didn't: `.focus()` on an unfocusable `<div>`
   * neither throws nor focuses anything. A capability cannot be measured,
   * dragged, or compared against `document.activeElement`, so it cannot be
   * confused with `ref`, and `Row` stays free to move the focus target between
   * paths because that is now an internal detail.
   *
   * `focus()` is synchronous, and has to stay that way: the page editor's
   * `CaretSurface` contract is `focus: () => void` invoked imperatively from a
   * keydown handler, so a declarative `focused` prop would make the landing
   * async and break it. On a row that renders no control it THROWS — a
   * `focusRef` on a non-interactive row is a caller bug, and a loud one is
   * debuggable where the old silent no-op was not.
   */
  focusRef?: React.Ref<RowFocus>;
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
  focusRef,
  disabled,
  className,
  children,
  ...rest
}: RowProps) {
  // The element is inferred, never authored: a row with `href` is a link, a row
  // with `onClick`/`disabled` is a button, anything else is a plain container.
  // This removes the `as` footgun — a clickable row can no longer be declared as
  // a `<button>` that then nests its `actions` buttons (invalid DOM). Inferred
  // FIRST because the focus handle below has to know whether this row renders a
  // control at all, and a hook cannot be moved past the conditional return.
  const href = (rest as { href?: unknown }).href;
  const onClick = (rest as { onClick?: unknown }).onClick;
  const Tag: React.ElementType =
    href != null ? "a" : onClick != null || disabled != null ? "button" : "div";
  const isButton = Tag === "button";
  const interactive = Tag !== "div";

  // WHICH node takes the focus is `Row`'s business, so it keeps a private handle
  // on it — the row box itself on the single-element path, the inner
  // `<button>`/`<a>` on the split path — and publishes only the capability to
  // focus whatever that is (see `focusRef`).
  const controlRef = useRef<HTMLElement | null>(null);
  useImperativeHandle(
    focusRef,
    () => ({
      focus() {
        // A non-interactive row renders a plain `<div>`, and focusing it would
        // do nothing while looking like it worked — exactly how the ref this
        // replaces failed. So it throws instead: the caller either meant to make
        // the row clickable, or meant not to hold a `focusRef` at all.
        if (!interactive) {
          throw new Error(
            "Row: focusRef.focus() on a row that renders no focusable control. A Row " +
              "is only focusable when it infers one from its props (`href` → <a>, " +
              "`onClick`/`disabled` → <button>); with neither it is a plain <div>. Give " +
              "the row an `onClick`/`href`, or drop the `focusRef`.",
          );
        }
        // Unreachable-null: the handle is published by the same commit that
        // attaches the ref below, so anyone holding it holds a mounted row.
        controlRef.current?.focus();
      },
    }),
    [interactive],
  );

  // SINGLE-ELEMENT PATH refs — the one element is both the box and the control,
  // so the caller's `ref` and the private control handle collapse onto it.
  // Memoised on the caller's ref so React does not detach and re-attach it on
  // every render.
  const setBoxAndControl = useCallback(
    (el: HTMLElement | null) => {
      setRef(ref, el);
      controlRef.current = el;
    },
    [ref],
  );
  // SPLIT PATH — `ref` still goes to the box untouched, and the control handle
  // is written through a CALLBACK rather than a ref object handed straight to
  // `<Tag>`. `Tag` is an `ElementType`, so its `ref` prop types as the
  // INTERSECTION of every element it could be — a `Ref<HTMLElement>` satisfies
  // none of them, while a callback taking the supertype satisfies all of them.
  const setControl = useCallback((el: HTMLElement | null) => {
    controlRef.current = el;
  }, []);

  // The single-line contract (region-line + SingleLineProvider) comes from
  // <Line>; Row layers its interactive row chrome (width, padding, hover) on top.
  //
  // `rowActionsAnchor` is unconditional: it establishes the `group/row-actions`
  // hover group the actions cluster reveals off (a CSS group, so a hovered row
  // costs zero re-renders — the list and table views window 100+ rows), plus the
  // `relative` a pinned cluster anchors to. Both are inert on a row with no
  // actions, and pinning them to `actions ? …` would only make the row's
  // positioning context depend on which slots the caller filled.
  //
  // The two focus utilities are UNCONDITIONAL because each is inert on the path
  // where it cannot match, and a branch would only re-state the path split in a
  // second place. On the single-element path the box IS the control, so
  // `focus-ring` fires and `focus-ring-from`'s `:has(> …)` can never match (the
  // box is not its own child). On the split path the box is a `<div>` that can
  // never be focused, so `focus-ring` never fires and `focus-ring-from` picks up
  // the inner control's focus instead. Either way the ring is painted by the
  // BOX: one indicator, identical whether or not the row carries actions, and
  // covering the whole `p-row` padding ring that the control — a `flex-1` child
  // of an `items-center` line — can never reach. `focus-ring-within` is
  // deliberately not what this uses: it would also fire when a row ACTION takes
  // focus, stacking the row's ring on top of that button's own.
  const chromeClass = cn(
    "group w-full rounded-md p-row text-left transition-colors [&_svg:not([class*='size-'])]:icon-auto",
    "focus-ring focus-ring-from",
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
          ref={setControl}
          type={isButton ? "button" : undefined}
          disabled={isButton ? disabled : undefined}
          aria-current={isButton && selected ? true : undefined}
          // Nominates THIS node as the one whose focus rings the box
          // (`focus-ring-from` above). Written `=""` like the other marker
          // attributes in the repo — presence is the whole signal.
          data-focus-ring=""
          className={cn(
            // `outline-none`: the ring is painted by the box, so the UA outline
            // would be a second, tighter indicator hugging the label inside it.
            "flex min-w-0 flex-1 items-center text-left outline-none",
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
      ref={setBoxAndControl}
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
