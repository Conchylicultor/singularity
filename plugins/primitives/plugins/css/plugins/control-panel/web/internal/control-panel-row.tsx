import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { CheckboxIndicator } from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import { SwitchIndicator } from "@plugins/primitives/plugins/css/plugins/switch/web";
import {
  RowActions,
  rowActionsAnchor,
} from "@plugins/primitives/plugins/row-actions/web";
import type React from "react";
import { useCallback, useId } from "react";
import { MdCheck, MdDragIndicator } from "react-icons/md";

import { HintedLabelCell } from "./hint";

/** The three selection languages, one per meaning. There is no fourth. */
export type ControlPanelRowSelect = "check" | "radio" | "switch";
export type ControlPanelRowTone = "default" | "danger";

interface ControlPanelRowCommon {
  /**
   * Explanatory prose as a TOOLTIP, wired by `aria-describedby` — never a
   * second line. A second line is the one change that breaks invariant #2 in
   * every panel at once; a muted pseudo-row breaks invariant #1's meaning (a row
   * that is not a control still opening the rails). See `HintedLabelCell`.
   */
  hint?: string;
  /** Shows the drag handle in the gutter track (revealed on row hover/focus). */
  handle?: boolean;
  /** dnd-kit listeners/attributes (and an activator `ref`) for that handle. */
  handleProps?: React.HTMLAttributes<HTMLElement> & {
    ref?: React.Ref<HTMLElement>;
  };
  /**
   * Trailing cell content — a count, a type name, a chip. PRESENTATIONAL: it
   * carries no click target of its own. On a row with no `actions` that is a
   * hard contract (the row IS the click target, so an interactive control here
   * would be a nested one); on a row WITH `actions` the interactive trailing
   * content is the action cluster, and this still sits in front of it as plain
   * text. Ignored when `select="switch"`, which owns the cell.
   */
  trailing?: React.ReactNode;
  /**
   * Row actions — a hover-revealed cluster of `IconButton`s at the row's
   * trailing edge, rendered through the `row-actions` primitive.
   *
   * Passing it switches the row to its SECOND construction: the row box becomes
   * a non-interactive `<div>` and the selectable part becomes an inner subgrid
   * spanning every track but the trailing one, so the action buttons are the
   * click target's SIBLINGS rather than its descendants. See the component doc.
   */
  actions?: React.ReactNode;
  tone?: ControlPanelRowTone;
  /** Muted foreground — for a secondary row ("New field", "Add filter"). */
  muted?: boolean;
  /**
   * Disables the row's SELECTION — not the whole row.
   *
   * On a row with no `actions` those are the same thing, and it reads as it
   * always has: the row is inert and dimmed. On a row WITH `actions` the
   * dimming and the inertness land on the inner select element only, and the
   * action cluster stays live. That is the honest meaning of the prop, and it is
   * the case that actually occurs: a saved preset whose fields have all left the
   * schema cannot be applied, but it is exactly the preset you want to delete.
   */
  disabled?: boolean;
  /** Makes the row a `<button>`. */
  onSelect?: () => void;
  /** Makes the row an `<a>`. */
  href?: string;
  className?: string;
  /**
   * Forwarded to the row BOX — the outermost node — in both constructions, for
   * DnD / scroll-into-view. Deliberately not the inner select element on the
   * `actions` path: a ref that changed node the day a row grew an action would
   * hand a dnd transform a box that leaves the trailing cell behind.
   */
  ref?: React.Ref<HTMLElement>;
  children: React.ReactNode;
}

/**
 * `checked` is required the moment `select` is set, and `icon` is excluded from
 * exactly the two selections that OWN the leading cell. That is what makes the
 * settings panel's three stacked "on" languages — a filled checkbox, a
 * highlighted row with a leading ✓, and a raw select — a type error rather than
 * a review note.
 *
 * The switch is a third arm rather than a third exclusion, because its leading
 * cell is empty BY CONSTRUCTION: the indicator lives in the trailing cell (see
 * `trailingContent` below), so nothing there competes with an icon. Collapsing
 * it into the check/radio arm made an icon + switch row unspellable, and the one
 * surface that wanted one moved a real glyph into the label cell instead —
 * misaligning its text against every other row in the panel.
 *
 * `actions` is excluded from that same switch arm, and for the mirror-image
 * reason: the switch is drawn IN the trailing cell, so a cluster there would be
 * a second occupant of a cell that already has an owner — and a toggle sharing
 * its box with a trash button is a mis-click waiting to happen. Excluded at the
 * type level rather than dropped at render, the same way `icon` is.
 */
export type ControlPanelRowProps =
  | (ControlPanelRowCommon & {
      icon?: React.ReactNode;
      select?: never;
      checked?: never;
    })
  | (ControlPanelRowCommon & {
      select: "check" | "radio";
      checked: boolean;
      icon?: never;
    })
  | (ControlPanelRowCommon & {
      select: "switch";
      checked: boolean;
      icon?: React.ReactNode;
      actions?: never;
    });

/**
 * The hover-reveal recipe for the drag handle. Opacity and pointer-events are
 * coupled in both directions, so a hidden handle is never a live hit-target
 * sitting invisibly over the row's left edge.
 */
const HANDLE_REVEAL =
  "opacity-0 pointer-events-none " +
  "group-hover/cp-row:opacity-100 group-hover/cp-row:pointer-events-auto " +
  "group-focus-within/cp-row:opacity-100 group-focus-within/cp-row:pointer-events-auto";

/**
 * THE panel row. Four grid tracks — gutter | icon/indicator | label | trailing —
 * so every label in every panel starts at the same x whether or not this
 * particular row has an icon, and a long label truncates in its own column
 * instead of sliding under the trailing control.
 *
 * The two leading tracks are reserved only when the PANEL has something to put
 * in them, which is why each row marks its own occupants: `data-cp-handle` when
 * it hangs a drag handle, `data-cp-icon` when its leading cell is actually
 * occupied — an icon, a checkbox or a radio mark, never a switch (which is
 * drawn in the trailing cell). A panel with neither is a two-track grid, and
 * its rows sit flush against the panel's own content inset — no reserved
 * columns nothing paints in.
 * The scan is per PANEL, never per row: derive it per row and a row with an icon
 * would indent its label past a row without one, which is the conditional
 * leading cell invariant #1 exists to delete.
 *
 * It is its own grid rather than a composed `css/row`'s `Row` on purpose. `Row`
 * is a `<Line>`-based FLEX row whose `icon` is a leading flex child, so the
 * label's x depends on whether an icon is present — that IS the 12/14/20/38px
 * misalignment this vocabulary exists to remove, and flex has no track that
 * occupies width when empty. Adding a grid mode plus a panel-only geometry axis
 * to a primitive with 50+ call sites costs more than eight lines of duplicated
 * element inference. The two stay in step by sharing TOKENS (`--pad-row-x`,
 * `--control-height-md`, the surface-following hover fill), not code.
 *
 * The host element is INFERRED, never authored — `href` → `<a>`,
 * `onSelect`/`disabled` → `<button>`, else a plain `<div>`. Same rule as `Row`,
 * so an author learns it once.
 *
 * ## Two constructions, chosen by `actions`
 *
 * **Without `actions`** the inferred element IS the row box: one node carrying
 * `cp-row`, with the four cells as its direct children. That is the shape ~50
 * call sites render today, and it is the reason the trailing cell is
 * presentational — a `<button>` inside a `<button>` is invalid DOM.
 *
 * **With `actions`** the row splits, the same way `css/row`'s `Row` splits when
 * it is handed both a click target and an action cluster. The box is always a
 * non-interactive `<div>`, and the selectable part becomes an inner element
 * spanning every track but the last — so the action buttons are that element's
 * SIBLINGS rather than its descendants, which is the only construction in which
 * both are legal at once. The inner element is a CSS **subgrid**: the panel's
 * tracks pass straight through it, so the gutter, icon and label cells land on
 * exactly the rails they land on in the other construction and invariant #1
 * never learns that this row is built differently. `col-[1/-2]` is written
 * track-count agnostic because `cp-row` has 2/3/4-track templates depending on
 * what the PANEL occupies, and a hardcoded span would break in three of them.
 */
export function ControlPanelRow({
  icon,
  hint,
  select,
  checked,
  handle,
  handleProps,
  trailing,
  actions,
  tone = "default",
  muted,
  disabled,
  onSelect,
  href,
  className,
  ref,
  children,
}: ControlPanelRowProps) {
  const hintId = useId();
  const isLink = href != null;
  const isButton = !isLink && (onSelect != null || disabled != null);
  const interactive = isLink || isButton;
  const hasActions = actions != null;

  // One callback ref for three possible hosts. A `RefObject`'s `current` is
  // MUTABLE, so `RefObject<HTMLElement>` is not assignable to
  // `RefObject<HTMLAnchorElement>` — but a callback ref is, because parameters
  // are contravariant. Normalizing the caller's ref into one callback is what
  // lets the public prop stay honest (`Ref<HTMLElement>` — a row is an element,
  // not a fixed tag) with no cast at any branch. Same composition idiom as
  // `css/sticky/stack`'s item ref.
  const hostRef = useCallback(
    (el: HTMLElement | null) => {
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  // Leading cell. A single-select row shows a CHECKMARK AND NOTHING ELSE — no
  // background fill, because a filled row already means hover, and a panel that
  // says "selected" one way and "hovered" the same way says neither.
  // A SWITCH FALLS THROUGH TO `icon`: it owns the TRAILING cell, so its leading
  // cell holds whatever the row itself carries — nothing, usually, or a real
  // glyph for a row that has one.
  const leading =
    select === "check" ? (
      <CheckboxIndicator checked={checked ?? false} />
    ) : select === "radio" ? (
      checked ? (
        <MdCheck className="text-primary" />
      ) : null
    ) : (
      icon
    );

  // …and the occupancy mark follows the CELL, not the row's props. A switch
  // reserves nothing here (it is drawn in the trailing cell), so a panel whose
  // only selections are switches has no icon column at all — before this it
  // reserved 18px that painted nothing and indented every label in the panel by
  // 26px, which is what the fx-toggle and metronome panels looked like.
  // NOT `leading != null`, deliberately: an UNCHECKED radio renders nothing yet
  // still owns the column — its mark is state, the track is not — so deriving
  // the marker from the rendered node would make the whole panel re-flow the
  // first time someone ticked a row.
  const occupiesLeadingCell =
    icon != null || select === "check" || select === "radio";

  const trailingContent =
    select === "switch" ? (
      <SwitchIndicator checked={checked ?? false} disabled={disabled} />
    ) : (
      trailing
    );

  const rowClass = cn(
    "group/cp-row cp-row text-body transition-colors",
    "[&_svg:not([class*='size-'])]:icon-auto",
    muted && "text-muted-foreground",
    tone === "danger" && "text-destructive",
    interactive &&
      (tone === "danger" ? "hover:bg-destructive/10" : "hover:bg-hover-fill"),
    // WHO gets rung is the one class that differs between the two
    // constructions, and each spelling is inert on the other path.
    // `focus-ring` is `&:focus-visible`, which a `<div>` box can never satisfy;
    // `focus-ring-from` is `:has(> [data-focus-ring]:focus-visible)`, and the
    // select element IS a direct child, so keyboard focus on the SELECTION
    // rings the whole row — while focus on an action button inside the cluster
    // rings only that button. `focus-ring-within` would light both at once,
    // which is two indicators for one focus.
    interactive && (hasActions ? "focus-ring-from" : "focus-ring"),
    // The actions cluster brings its OWN hover group rather than piggybacking
    // on `group/cp-row`, so the trailing cluster reveals only when this class is
    // on the row it belongs to. Same construction as `RuleRow` and `SettingRow`.
    hasActions && rowActionsAnchor,
    // Only the no-actions construction dims and deadens the WHOLE row: with
    // actions, `disabled` scopes to the selection (see the prop doc) and the
    // treatment moves onto the inner select element below.
    !hasActions && disabled && "pointer-events-none opacity-50",
    className,
  );

  // A selection row reports its OWN state. Plain `checkbox`/`radio`/`switch`
  // rather than `menuitemcheckbox`/`menuitemradio`: those require a
  // `role="menu"` ancestor, and a control panel is a labelled group of sections,
  // not a menu. Only the interactive hosts carry it — a display-only `<div>` row
  // showing an indicator is not a control.
  const selection = select
    ? { role: SELECT_ROLE[select], "aria-checked": checked ?? false }
    : undefined;

  // The description hangs off the HOST, so assistive tech reads the row's name
  // and then its hint. The node it points at is a zero-box `sr-only` sibling
  // inside the label cell, which is why the hint opens no track.
  const described = hint ? { "aria-describedby": hintId } : undefined;

  // Each cell names itself (`data-cp-cell`), and the two LEADING cells also
  // declare whether they are OCCUPIED (`data-cp-handle` / `data-cp-icon`). The
  // occupancy marks are what `cp-panel` scans with `:has()` to decide whether
  // the panel reserves a gutter and an icon column at all — per panel, so every
  // row in it keeps one rail; the cell names are how the dropped cells are then
  // hidden, since an unhidden empty cell would auto-place into the track that
  // took its place. A check or radio indicator counts as an icon — it occupies
  // that column exactly as a glyph does — but a switch does not, because its
  // indicator is in the trailing cell.
  const leadingCells = (
    <>
      <span
        {...handleProps}
        data-cp-cell="gutter"
        data-cp-handle={handle ? "" : undefined}
        className={cn(
          "flex items-center justify-center text-muted-foreground",
          handle ? cn("cursor-grab", HANDLE_REVEAL) : "pointer-events-none",
          handleProps?.className,
        )}
      >
        {handle ? <MdDragIndicator /> : null}
      </span>
      {/* Hidden from the accessibility tree: the indicator is a VISUAL restatement
          of `aria-checked`, and the icon is decorative — leaving them exposed
          would prefix the row's accessible name with the checkbox's own "✓". */}
      <span
        aria-hidden
        data-cp-cell="icon"
        data-cp-icon={occupiesLeadingCell ? "" : undefined}
        className="flex items-center justify-center"
      >
        {leading}
      </span>
      <HintedLabelCell hint={hint} descriptionId={hintId}>
        {children}
      </HintedLabelCell>
    </>
  );

  const trailingCell = (
    <span
      data-cp-cell="trailing"
      className="flex items-center gap-2xs text-caption text-muted-foreground"
    >
      {trailingContent}
    </span>
  );

  // ── The actions construction ────────────────────────────────────────
  //
  // The box is a `<div>` whatever the row's props say, so the action buttons
  // have a legal place to live; the element the props DID infer moves inside it
  // as the selectable region. Everything that describes the SELECTION goes with
  // it — the role and `aria-checked`, the description, the disabled state, the
  // focus nomination — and everything that describes the ROW stays on the box.
  if (hasActions) {
    return (
      <div ref={hostRef} className={rowClass}>
        <SelectRegion
          href={href}
          onSelect={onSelect}
          disabled={disabled}
          isLink={isLink}
          isButton={isButton}
          selection={selection}
          described={described}
        >
          {leadingCells}
        </SelectRegion>
        {/* `col-[-2/-1]` is the trailing track, named the same track-count
            agnostic way the select region names its span: `cp-row` is a 2-, 3-
            or 4-track grid depending on what the PANEL occupies, and only the
            end-relative line numbers are the same line in all three.

            `pin={null}` for the reason `RuleRow` gives: the track already
            reserves this space, so the cluster belongs IN FLOW; pinning it would
            float it over the label cell and paint a `--scrim` this row has no
            tint to publish. The cluster also supplies the xs control density and
            the click / pointerdown guards, so an action press never reaches the
            selection beside it. */}
        <span
          data-cp-cell="trailing"
          className="col-[-2/-1] flex items-center gap-2xs text-caption text-muted-foreground"
        >
          {trailingContent}
          <RowActions pin={null}>{actions}</RowActions>
        </span>
      </div>
    );
  }

  // ── The plain construction ──────────────────────────────────────────
  //
  // Three concrete elements, not one `<Tag>` variable. A capitalized local
  // holding an element type reads to React Compiler as a component CREATED
  // during render (`react-hooks/static-components`) — its identity changes each
  // render, so React would remount the subtree and reset its state rather than
  // update it. Branching keeps the same inference rule (`href` → `<a>`,
  // `onSelect`/`disabled` → `<button>`, else `<div>`) with three stable element
  // types, and each host gets exactly the attributes it actually has.
  if (isLink) {
    return (
      <a
        href={href}
        ref={hostRef}
        onClick={onSelect}
        className={rowClass}
        {...selection}
        {...described}
      >
        {leadingCells}
        {trailingCell}
      </a>
    );
  }
  if (isButton) {
    return (
      <button
        type="button"
        ref={hostRef}
        disabled={disabled}
        onClick={onSelect}
        className={rowClass}
        {...selection}
        {...described}
      >
        {leadingCells}
        {trailingCell}
      </button>
    );
  }
  return (
    <div ref={hostRef} className={rowClass} {...described}>
      {leadingCells}
      {trailingCell}
    </div>
  );
}

/**
 * The selectable region of a row that carries `actions` — the element the row's
 * props inferred, rendered INSIDE the row box instead of as it.
 *
 * It is a subgrid, and that is the whole trick: `grid-cols-subgrid` makes the
 * panel's own tracks pass through this element unchanged, so the three cells it
 * holds land on exactly the rails they would as direct children of `cp-row`.
 * There is deliberately NO `gap` here — a subgrid inherits the parent grid's
 * column gap, and restating it is how the leading cells drift off the panel rail.
 *
 * `self-stretch` against the row's `align-items: center`, so the click target
 * fills the row's full `--cp-row-h` height rather than only its content's: an
 * inferred-height target would leave a few dead pixels above and below the label
 * that the un-split construction has never had.
 *
 * Three concrete elements again rather than one `<Tag>` local, for the reason
 * spelled out at the call site.
 */
function SelectRegion({
  href,
  onSelect,
  disabled,
  isLink,
  isButton,
  selection,
  described,
  children,
}: {
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  isLink: boolean;
  isButton: boolean;
  selection: SelectionAttrs | undefined;
  described: DescribedAttrs | undefined;
  children: React.ReactNode;
}) {
  const className = cn(
    "grid grid-cols-subgrid col-[1/-2] self-stretch items-center min-w-0",
    // `outline-none`: the ring is painted by the row BOX (`focus-ring-from`), so
    // the UA outline would be a second, tighter indicator inside it.
    "rounded-md text-left outline-none",
    // The disabled treatment, scoped to the selection. `pointer-events-none` as
    // well as the attribute, because a `<a>`/`<span>` region takes no `disabled`
    // — and the row box around it must stay live either way, so its actions
    // still work.
    disabled && "pointer-events-none opacity-50",
  );
  // Nominates this node as the one whose focus rings the box, written `=""` like
  // every other marker attribute in the repo — presence is the whole signal.
  const focus = { "data-focus-ring": "", "data-cp-select": "" };

  if (isLink) {
    return (
      <a
        href={href}
        onClick={onSelect}
        className={className}
        {...focus}
        {...selection}
        {...described}
      >
        {children}
      </a>
    );
  }
  if (isButton) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={className}
        {...focus}
        {...selection}
        {...described}
      >
        {children}
      </button>
    );
  }
  return (
    <span className={className} {...focus} {...described}>
      {children}
    </span>
  );
}

/**
 * The two attribute bags the row computes once and then hands to whichever
 * element ends up being the selection — the row host on the plain path, the
 * inner region on the actions path. Named types rather than inferred ones so
 * both spreads typecheck as JSX attributes instead of as an index signature.
 */
type SelectionAttrs = {
  role: "checkbox" | "radio" | "switch";
  "aria-checked": boolean;
};
type DescribedAttrs = { "aria-describedby": string };

const SELECT_ROLE: Record<
  ControlPanelRowSelect,
  "checkbox" | "radio" | "switch"
> = {
  check: "checkbox",
  radio: "radio",
  switch: "switch",
};
