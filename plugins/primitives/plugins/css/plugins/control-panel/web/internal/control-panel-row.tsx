import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { CheckboxIndicator } from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import { SwitchIndicator } from "@plugins/primitives/plugins/css/plugins/switch/web";
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
   * Trailing cell content — a count, a type name, a chip. PRESENTATIONAL by
   * contract: the row itself is the click target, so an interactive control here
   * would be a nested one. Ignored when `select="switch"`, which owns the cell.
   */
  trailing?: React.ReactNode;
  tone?: ControlPanelRowTone;
  /** Muted foreground — for a secondary row ("New field", "Add filter"). */
  muted?: boolean;
  disabled?: boolean;
  /** Makes the row a `<button>`. */
  onSelect?: () => void;
  /** Makes the row an `<a>`. */
  href?: string;
  className?: string;
  /** Forwarded to the row box, for DnD / scroll-into-view. */
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
 * occupies width when empty. Its trailing slot is hover-revealed and
 * overlay-pinned; the panel's trailing cell is in-flow and presentational.
 * Adding a grid mode plus a panel-only geometry axis to a primitive with 50+
 * call sites costs more than eight lines of duplicated element inference. The
 * two stay in step by sharing TOKENS (`--pad-row-x`, `--control-height-md`, the
 * surface-following hover fill), not code.
 *
 * The host element is INFERRED, never authored — `href` → `<a>`,
 * `onSelect`/`disabled` → `<button>`, else a plain `<div>`. Same rule as `Row`,
 * so an author learns it once.
 */
export function ControlPanelRow({
  icon,
  hint,
  select,
  checked,
  handle,
  handleProps,
  trailing,
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
    interactive && "focus-ring",
    disabled && "pointer-events-none opacity-50",
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
  const cells = (
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
      <span
        data-cp-cell="trailing"
        className="flex items-center gap-2xs text-caption text-muted-foreground"
      >
        {trailingContent}
      </span>
    </>
  );

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
        {cells}
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
        {cells}
      </button>
    );
  }
  return (
    <div ref={hostRef} className={rowClass} {...described}>
      {cells}
    </div>
  );
}

const SELECT_ROLE: Record<
  ControlPanelRowSelect,
  "checkbox" | "radio" | "switch"
> = {
  check: "checkbox",
  radio: "radio",
  switch: "switch",
};
