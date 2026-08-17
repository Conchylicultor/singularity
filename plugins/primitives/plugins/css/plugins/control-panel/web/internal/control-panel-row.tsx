import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { CheckboxIndicator } from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import { SwitchIndicator } from "@plugins/primitives/plugins/css/plugins/switch/web";
import type React from "react";
import { useCallback } from "react";
import { MdCheck, MdDragIndicator } from "react-icons/md";

/** The three selection languages, one per meaning. There is no fourth. */
export type ControlPanelRowSelect = "check" | "radio" | "switch";
export type ControlPanelRowTone = "default" | "danger";

interface ControlPanelRowCommon {
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
 * `icon` and `select` are MUTUALLY EXCLUSIVE, and `checked` is required the
 * moment `select` is set. That is what makes the settings panel's three stacked
 * "on" languages — a filled checkbox, a highlighted row with a leading ✓, and a
 * raw select — a type error rather than a review note.
 */
export type ControlPanelRowProps =
  | (ControlPanelRowCommon & {
      icon?: React.ReactNode;
      select?: never;
      checked?: never;
    })
  | (ControlPanelRowCommon & {
      select: ControlPanelRowSelect;
      checked: boolean;
      icon?: never;
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
  // says "selected" one way and "hovered" the same way says neither. The switch
  // takes the trailing cell instead, so its leading cell stays empty and the
  // rail holds.
  const leading =
    select === "check" ? (
      <CheckboxIndicator checked={checked ?? false} />
    ) : select === "radio" ? (
      checked ? (
        <MdCheck className="text-primary" />
      ) : null
    ) : select === "switch" ? null : (
      icon
    );

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

  const cells = (
    <>
      <span
        {...handleProps}
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
      <span aria-hidden className="flex items-center justify-center">
        {leading}
      </span>
      <span className="truncate">{children}</span>
      <span className="flex items-center gap-2xs text-caption text-muted-foreground">
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
      >
        {cells}
      </button>
    );
  }
  return (
    <div ref={hostRef} className={rowClass}>
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
