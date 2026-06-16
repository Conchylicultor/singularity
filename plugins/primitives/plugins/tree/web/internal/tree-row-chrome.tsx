import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { type ReactNode, type Ref } from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";

export type TreeRowChromeProps = {
  depth: number;
  hasChildren: boolean;
  isOpen: boolean;
  selected?: boolean;
  /** Chevron click. Stops propagation internally so it never triggers onSelect. */
  onToggle?: () => void;
  /** Row click. */
  onSelect?: () => void;
  children: ReactNode;
  actions?: ReactNode;
  /**
   * Leading control rendered between the chevron block and the label (e.g. the
   * multi-select checkbox). Hover-reveal scoping is the leading node's own
   * concern (RowChrome passes a `group-hover/tree-row` className into it) — this
   * slot only reserves layout space.
   */
  leading?: ReactNode;
  /**
   * Optional row icon (e.g. a page icon) merged into the chevron slot, Notion
   * style: the icon shows at rest and the expand/collapse chevron reveals on
   * row hover in the *same* box. When omitted, the chevron slot renders on its
   * own as before. The chevron only appears for expandable rows (`hasChildren`
   * or `leafChevron`); a non-expandable row with an icon shows only the icon.
   */
  icon?: ReactNode;
  /** Editable wrappers inject DnD state classes (dragging, drop-target ring). */
  className?: string;
  /** Editable wrappers attach the scroll + child-drop ref here. */
  rowRef?: Ref<HTMLDivElement>;
  /**
   * Whole-row drag source props (Notion-style: no grip handle). The editable
   * RowChrome spreads dnd-kit's draggable `attributes`/`listeners` onto the row
   * so the entire row is the drag source. Read-only trees omit them.
   */
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  /** Pixels of indentation per depth level. Defaults to the shared tree value. */
  indentStep?: number;
  /**
   * Whether a childless row still renders a (hover-revealed) chevron. Editable
   * trees keep it as an expand affordance (default true); read-only trees where
   * a leaf can never gain children pass false to render only alignment space.
   */
  leafChevron?: boolean;
};

/**
 * Pure presentational tree-row chrome: indentation, a fixed row height, and a
 * reserved chevron slot. No hooks, no context, no dnd-kit *logic* — the
 * editable RowChrome computes the drag source via dnd-kit and passes the
 * resulting `dragAttributes`/`dragListeners` in for this component to spread
 * onto the row (read-only trees, e.g. config nav, omit them). Both render
 * through it so every tree row in the app shares one height invariant.
 *
 * Deliberately NOT built on the generic `Row` primitive: tree rows need a
 * NAMED group (`group/tree-row`) to scope the chevron/actions hover-reveal to
 * the individual row. `Row` uses a bare `group`, which leaks the reveal when an
 * ancestor also carries a bare `group` (e.g. the shadcn sidebar wrapper) —
 * showing every row's actions at once. Hence the row/no-adhoc-row exception.
 */
export function TreeRowChrome({
  depth,
  hasChildren,
  isOpen,
  selected,
  onToggle,
  onSelect,
  children,
  actions,
  leading,
  icon,
  className,
  rowRef,
  dragAttributes,
  dragListeners,
  indentStep = 16,
  leafChevron = true,
}: TreeRowChromeProps) {
  const expandable = hasChildren || leafChevron;
  return (
    <div
      ref={rowRef}
      onClick={onSelect}
      {...dragAttributes}
      {...dragListeners}
      // eslint-disable-next-line row/no-adhoc-row -- bespoke named-group (group/tree-row) hover scoping; Row's bare-group slots leak the reveal under ancestor groups
      className={cn(
        "group/tree-row flex min-h-7 items-center gap-xs rounded-md px-xs py-xs text-body",
        "hover:bg-accent",
        selected && "bg-accent",
        className,
      )}
      style={{ paddingLeft: depth * indentStep + 4 }}
    >
      {icon != null ? (
        // Notion-style merged slot: icon at rest, chevron on row hover, both
        // sharing one size-5 box. The icon is purely visual (the row click
        // navigates); the overlaid chevron button owns the toggle.
        <span className="relative flex size-5 shrink-0 items-center justify-center">
          <span
            className={cn(
              "flex items-center justify-center",
              expandable && "group-hover/tree-row:opacity-0",
            )}
          >
            {icon}
          </span>
          {expandable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle?.();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={isOpen ? "Collapse" : "Expand"}
              className={cn(
                "absolute inset-0 flex items-center justify-center rounded-md",
                "hover:bg-background/60",
                "opacity-0 group-hover/tree-row:opacity-100 focus-visible:opacity-100",
              )}
            >
              <CollapsibleChevron open={isOpen} className="size-4" />
            </button>
          )}
        </span>
      ) : expandable ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={isOpen ? "Collapse" : "Expand"}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md",
            "hover:bg-background/60",
            hasChildren
              ? "opacity-40 group-hover/tree-row:opacity-100"
              : "opacity-0 group-hover/tree-row:opacity-60",
          )}
        >
          <CollapsibleChevron open={isOpen} className="size-4" />
        </button>
      ) : (
        // Read-only leaf: reserve the chevron's width for alignment, but render
        // no expander — this row can never gain children.
        <span className="size-5 shrink-0" aria-hidden />
      )}
      {leading != null && (
        <span
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center justify-center"
        >
          {leading}
        </span>
      )}
      {children}
      {actions && (
        <div
          onClick={(e) => e.stopPropagation()}
          // Pressing a trailing control must not arm a row drag.
          onPointerDown={(e) => e.stopPropagation()}
          // Stay visible while an open dropdown (e.g. the row "more" menu) keeps
          // a descendant in the `data-state=open` state, even after the pointer
          // leaves the row.
          className="flex shrink-0 items-center gap-2xs opacity-0 group-hover/tree-row:opacity-100 has-data-[state=open]:opacity-100"
        >
          {actions}
        </div>
      )}
    </div>
  );
}
