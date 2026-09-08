import { type ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { RowActions } from "@plugins/primitives/plugins/row-actions/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  StickyStack,
  StickyStackItem,
} from "@plugins/primitives/plugins/css/plugins/sticky/plugins/stack/web";
import {
  CollapsibleProvider,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import {
  DATA_VIEW_HEADER_OFFSET_VAR,
  type DataViewSection,
} from "@plugins/primitives/plugins/data-view/core";

export interface GroupedSectionsProps {
  /** The grouped sections — every `key` non-null. The ungrouped single implicit
   *  section (`key === null`) is the view's own headerless fast-path and never
   *  reaches here. */
  sections: DataViewSection<unknown>[];
  collapsedSections?: ReadonlySet<string>;
  setSectionCollapsed?: (key: string, collapsed: boolean) => void;
  /**
   * An affordance scoped to ONE section, rendered in that section's header
   * beside the count — the tree's fold-this-group toggle today, and the seam
   * anything else section-scoped goes through tomorrow. Return `null` for a
   * section that has nothing to offer; the wrapper is then not rendered either,
   * so a header without an action keeps the exact node it has always had.
   *
   * The count and the action want opposite treatments, which is why they are two
   * clusters rather than one: the count is information and reads at rest (it
   * rides the header's own `actionsAlwaysVisible` cluster), while an action is
   * something you reach for, so it appears on hover. `RowActions` already
   * separates `pin` (positioning) from `alwaysVisible` (reveal), so an inline
   * cluster that still reveals costs nothing new in `Row`, `SectionHeaderRow` or
   * `row-actions` — it rides the row's own `group/row-actions`, published
   * unconditionally by `rowActionsAnchor` in `Row`'s chrome class.
   *
   * The header is itself the section's collapse trigger, and an action sitting
   * on it must not collapse the section it folds. Nothing here guards that:
   * `RowActions`' button `Stack` already stops `onClick` AND `onPointerDown`,
   * for exactly this reason.
   *
   * This is deliberately NOT the `hover-reveal` primitive. That plugin's own
   * CLAUDE.md says in as many words that a cluster of row actions belongs to
   * `row-actions`; using both would put two competing reveal systems — one CSS
   * group, one JS state — on a single row.
   */
  headerActions?: (section: DataViewSection<unknown>) => ReactNode;
  /** This section's body — rendered inside the collapsible content. */
  children: (section: DataViewSection<unknown>) => ReactNode;
}

/**
 * The group-header chrome shared by every flat view child's grouped branch — the
 * render-side twin of `useDataViewSections`. The pipeline that *computes* the
 * sections and the chrome that *presents* them live side by side on purpose: when
 * each view hand-rolled this, they silently drifted (the gallery's headers never
 * pinned at all, while list's and table's stacked). One home makes that
 * divergence unrepresentable for the next view child.
 *
 * Group headers accumulate: with few enough groups every header stays pinned, each
 * below the last (StickyStack sums their measured heights), so you can see every
 * group you scrolled past. Past the stack's cap it degrades to the swap hand-off —
 * each arriving header covers the pinned one — because N pinned headers would eat
 * the viewport.
 *
 * The whole set shares THIS `<Stack>` as its sticky containing block, which is what
 * makes stacking possible: a per-group wrapper would re-bound each header to its
 * own group and un-pin it as the group scrolls away. Hence `<CollapsibleProvider>`
 * (no DOM) rather than `<Collapsible>`, and hence the header/content landing as
 * direct children of the Stack — a flex column with `gap="none"`, so each view's
 * arrangement is unchanged.
 *
 * `base` stacks the first header BELOW the DataView toolbar by reading the
 * host-published `--dv-header-offset` (its measured height). `mask` keeps rows from
 * showing through; `raised` sits above the (relative, in manual-order) rows while
 * the toolbar's `nav` keeps the headers sliding under it at the hand-off.
 *
 * The header's horizontal inset is the ambient **rail** (`rail-follow`),
 * the same rail every view body reads — so a group header and its rows line up on
 * one edge for free, and there is no longer a per-view `headerClassName` axis to
 * keep in sync with each body's padding.
 *
 * **The `table` view is the documented exception** and composes `StickyStack`
 * itself (inside `data-table`) under this same policy: its headers are
 * `col-span-full` rows of the subgrid, so the chrome cannot own a `<Stack>` without
 * displacing them out of the grid and breaking column alignment.
 */
export function GroupedSections({
  sections,
  collapsedSections,
  setSectionCollapsed,
  headerActions,
  children,
}: GroupedSectionsProps): ReactNode {
  return (
    <Stack gap="none">
      <StickyStack
        keys={sections.map((section) => section.key!)}
        base={`var(${DATA_VIEW_HEADER_OFFSET_VAR}, 0px)`}
      >
        {sections.map((section) => {
          const key = section.key!;
          const collapsed = collapsedSections?.has(key) ?? false;
          const action = headerActions?.(section);
          const count = (
            <Text variant="caption" tone="muted">
              {section.count}
            </Text>
          );
          return (
            <CollapsibleProvider
              key={key}
              open={!collapsed}
              onOpenChange={(open) => setSectionCollapsed?.(key, !open)}
            >
              <StickyStackItem itemKey={key} mask layer="raised">
                <SectionHeaderRow
                  // The label is the grouped column's VALUE, not a name this
                  // chrome chose — so it is spelled the way the data spells it.
                  variant="value"
                  className="rail-follow"
                  // This `null` test is the ONLY thing between a section and an
                  // empty `RowActions` — which is not nothing: the cluster is a
                  // flex item, so an empty one still spends the `gap` below and
                  // pulls that section's count off the edge its neighbours line
                  // up on. Hence the contract that `headerActions` returns
                  // `null`, not a component that renders nothing: a component
                  // is an element, and an element is never `null`.
                  actions={
                    action == null ? (
                      count
                    ) : (
                      // `gap="xs"` is load-bearing rather than decorative: the
                      // header has only ever carried the count, so nothing has
                      // ever sat beside it, and the two would otherwise touch.
                      <Stack direction="row" gap="xs" align="center">
                        {count}
                        <RowActions pin={null}>{action}</RowActions>
                      </Stack>
                    )
                  }
                >
                  {section.label}
                </SectionHeaderRow>
              </StickyStackItem>
              <CollapsibleContent>{children(section)}</CollapsibleContent>
            </CollapsibleProvider>
          );
        })}
      </StickyStack>
    </Stack>
  );
}
