import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { layerClasses } from "@plugins/primitives/plugins/css/plugins/layer/web";
import {
  RowActions,
  rowActionsAnchor,
} from "@plugins/primitives/plugins/row-actions/web";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { TreeDisclosureProps } from "../../core";
import { Tree } from "../slots";
import { TreeDisclosureToggle } from "./tree-disclosure-toggle";

export type TreeRowChromeProps = {
  /**
   * The node's id, stamped as `data-tree-id` on the row element so the tree's
   * keyboard navigation can find (and focus) the row a key moves to.
   */
  rowId?: string;
  depth: number;
  hasChildren: boolean;
  isOpen: boolean;
  selected?: boolean;
  /** Chevron click. Stops propagation internally so it never triggers onSelect. */
  onToggle?: () => void;
  /** Row click. */
  onSelect?: () => void;
  /**
   * The open gesture: double-click, or Enter while the row has focus. Present →
   * the row is focusable, and the second click of a double-click does not fire
   * `onSelect` again (so a click-to-toggle row is not toggled back by the very
   * gesture that opens it).
   */
  onOpen?: () => void;
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
  /**
   * Whether a childless row still renders a (hover-revealed) chevron. Editable
   * trees keep it as an expand affordance (default true); read-only trees where
   * a leaf can never gain children pass false to render only alignment space.
   */
  leafChevron?: boolean;
};

/**
 * The current (and default) icon-bearing disclosure, extracted verbatim from
 * the row below. Used when no `Tree.Disclosure` is contributed, so rows render
 * identically even if the tree-disclosure plugin is not loaded. The `merged`
 * variant of tree-disclosure mirrors this byte-for-byte.
 *
 * Notion-style merged slot: icon at rest, chevron on row hover, both sharing
 * one size-5 box. The icon is purely visual (the row click navigates); the
 * overlaid chevron button owns the toggle.
 */
function DefaultMergedDisclosure({
  icon,
  isOpen,
  expandable,
  onToggle,
}: TreeDisclosureProps) {
  return (
    <Center as="span" axis="both" className="relative size-5">
      <Center
        as="span"
        axis="both"
        className={cn(
          expandable &&
            "group-hover/tree-row:opacity-0 group-hover/tree-row:pointer-events-none",
        )}
      >
        {icon}
      </Center>
      {expandable && (
        <TreeDisclosureToggle
          isOpen={isOpen}
          onToggle={onToggle}
          className={cn(
            // The chevron button overlays the icon slot full-bleed (icon at
            // rest, chevron on hover). It is the layer itself, so it takes the
            // class rather than a wrapping <Layer>.
            layerClasses(),
            "opacity-0 pointer-events-none group-hover/tree-row:opacity-100 group-hover/tree-row:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto",
          )}
        />
      )}
    </Center>
  );
}

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
  rowId,
  depth,
  hasChildren,
  isOpen,
  selected,
  onToggle,
  onSelect,
  onOpen,
  children,
  actions,
  leading,
  icon,
  className,
  rowRef,
  dragAttributes,
  dragListeners,
  leafChevron = true,
}: TreeRowChromeProps) {
  const expandable = hasChildren || leafChevron;
  // A UI plugin can contribute the icon-bearing leading disclosure (merged /
  // dimmed-leaf / column). Exactly one is expected — its Region internally
  // dispatches to the active variant. With none, fall back to the inline
  // default merged disclosure.
  const disclosures = Tree.Disclosure.useContributions();
  const disclosure = disclosures[0];
  const disclosureProps: TreeDisclosureProps = {
    icon,
    hasChildren,
    isOpen,
    expandable,
    onToggle,
  };
  return (
    <Stack
      direction="row"
      align="center"
      gap="xs"
      ref={rowRef as Ref<HTMLElement>}
      data-tree-row
      data-tree-id={rowId}
      onClick={
        onOpen && onSelect
          ? (e: MouseEvent) => {
              // `detail` counts the clicks of one gesture; the second click of
              // a double-click belongs to `onOpen`, not to another select.
              if (e.detail > 1) return;
              onSelect();
            }
          : onSelect
      }
      onDoubleClick={onOpen}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={
        onOpen
          ? (e: KeyboardEvent) => {
              // Only the row's own key press — never one bubbling from a
              // control inside it (a rename input, an action button).
              if (e.key !== "Enter" || e.target !== e.currentTarget) return;
              e.preventDefault();
              onOpen();
            }
          : undefined
      }
      {...dragAttributes}
      {...dragListeners}
      // Bespoke named-group (group/tree-row) hover scoping: Row's bare-group
      // slots would leak the reveal under ancestor groups, so this row composes
      // Stack directly rather than the Row primitive. `rowActionsAnchor` adds a
      // SECOND, separate group (`group/row-actions`) plus the positioning
      // context the pinned action cluster anchors to — the chevron/disclosure
      // reveal keeps reading `group/tree-row`.
      className={cn(
        // Row height and per-depth indent are density tokens (`treeRowH`,
        // `treeIndent`), so a theme owns a tree's rhythm.
        "group/tree-row min-h-tree-row rounded-md px-xs py-xs text-body",
        // A focusable row (one with an open gesture) is walked with the arrow
        // keys, so the row the keys are on must show it.
        onOpen && "focus-ring",
        rowActionsAnchor,
        // Each tint co-publishes itself as `--scrim` — the colour the pinned
        // cluster's mask paints so the label it covers dissolves instead of
        // showing through the icons. Without it the mask paints the surface's
        // ambient `--chrome-mask`, i.e. the untinted background, and a hovered
        // row reads as a hole. Same contract as the `Row` primitive.
        // Selected is its own tier (`--selected`, default = the accent hover
        // fill), so a selected row does not hover to a different tone.
        selected
          ? "bg-selected [--scrim:var(--selected)]"
          : "hover:bg-accent hover:[--scrim:var(--accent)]",
        className,
      )}
      style={{ paddingLeft: `calc(${depth} * var(--tree-indent) + 4px)` }}
    >
      {icon != null ? (
        // useContributions() seals the `component` field, so the disclosure
        // can't be rendered as <Disclosure/>; route it through renderIsolated
        // (which unseals and applies the error-boundary middleware).
        disclosure ? (
          renderIsolated(
            Tree.Disclosure,
            disclosure as unknown as Contribution,
            disclosureProps,
          )
        ) : (
          <DefaultMergedDisclosure {...disclosureProps} />
        )
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
            "size-5 rounded-md",
            "hover:bg-background/60",
            hasChildren
              ? "opacity-40 group-hover/tree-row:opacity-100"
              : "opacity-0 pointer-events-none group-hover/tree-row:opacity-60 group-hover/tree-row:pointer-events-auto",
          )}
        >
          <Center axis="both" className="size-full">
            <CollapsibleChevron open={isOpen} className="size-4" />
          </Center>
        </button>
      ) : (
        // Read-only leaf: reserve the chevron's width for alignment, but render
        // no expander — this row can never gain children.
        <span className="size-5" aria-hidden />
      )}
      {leading != null && (
        <Center
          as="span"
          axis="both"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {leading}
        </Center>
      )}
      {children}
      {/* The shared cluster, not a second hand-rolled one: it reveals with
          opacity behind a right-edge `Pin mask`, so it reserves no flow width
          and its geometry — hence the anchor of any menu launched from it — is
          identical hovered or not. The bespoke reveal this replaced changed
          LAYOUT (`w-0` → `w-auto`), which slid an open menu sideways whenever
          the row lost hover. */}
      {actions && <RowActions>{actions}</RowActions>}
    </Stack>
  );
}
