import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type ReactNode, type Ref } from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { TreeDisclosureProps } from "../../core";
import { Tree } from "../slots";
import { TreeDisclosureToggle } from "./tree-disclosure-toggle";

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
          // eslint-disable-next-line layout/no-adhoc-layout -- chevron button overlays the icon slot full-bleed (icon at rest, chevron on hover)
          className={cn(
            "absolute inset-0",
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
      onClick={onSelect}
      {...dragAttributes}
      {...dragListeners}
      // Bespoke named-group (group/tree-row) hover scoping: Row's bare-group
      // slots would leak the reveal under ancestor groups, so this row composes
      // Stack directly rather than the Row primitive.
      className={cn(
        "group/tree-row min-h-7 rounded-md px-xs py-xs text-body",
        "hover:bg-accent",
        selected && "bg-accent",
        className,
      )}
      style={{ paddingLeft: depth * indentStep + 4 }}
    >
      {icon != null ? (
        // useContributions() seals the `component` field, so the disclosure
        // can't be rendered as <Disclosure/>; route it through renderIsolated
        // (which unseals and applies the error-boundary middleware).
        disclosure ? (
          renderIsolated(
            Tree.Disclosure.id,
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
      {actions && (
        <Clip
          onClick={(e) => e.stopPropagation()}
          // Pressing a trailing control must not arm a row drag.
          onPointerDown={(e) => e.stopPropagation()}
          // Reserve NO width at rest: `w-0` + Clip's `overflow-hidden` collapses
          // the cluster so the label gets the full row width and only truncates
          // once the actions actually appear on hover. (Plain `opacity-0` keeps
          // the cluster in layout, prematurely truncating labels behind invisible
          // buttons.) We collapse width rather than `display:none` so the action
          // buttons stay in the tab order and focus-within can reveal them for
          // keyboard users. Stays expanded while a descendant popup is open
          // (e.g. a row action's "more" menu), even after the pointer leaves.
          //
          // That last rule is load-bearing, not cosmetic: the cluster is the
          // ANCHOR of any menu launched from inside it, so letting it collapse
          // to `w-0` while the menu is open shoves the still-mounted trigger to
          // the collapsed edge and the open menu jumps sideways to follow it.
          // `data-popup-open` is base-ui's attribute — this used to read
          // `data-[state=open]` (Radix's), which matches nothing here, so the
          // rule silently never fired. Keep it in sync with the popup library.
          className={cn(
            "whitespace-nowrap",
            "w-0 opacity-0 pointer-events-none",
            "group-hover/tree-row:w-auto group-hover/tree-row:opacity-100 group-hover/tree-row:pointer-events-auto",
            "group-focus-within/tree-row:w-auto group-focus-within/tree-row:opacity-100 group-focus-within/tree-row:pointer-events-auto",
            "has-[[data-popup-open]]:w-auto has-[[data-popup-open]]:opacity-100 has-[[data-popup-open]]:pointer-events-auto",
          )}
        >
          <Stack direction="row" align="center" gap="2xs">
            {actions}
          </Stack>
        </Clip>
      )}
    </Stack>
  );
}
