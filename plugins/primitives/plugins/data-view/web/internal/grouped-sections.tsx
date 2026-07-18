import { type ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
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
 * The header's horizontal inset is the shared **pane gutter** (`px-pane-gutter`),
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
          return (
            <CollapsibleProvider
              key={key}
              open={!collapsed}
              onOpenChange={(open) => setSectionCollapsed?.(key, !open)}
            >
              <StickyStackItem itemKey={key} mask layer="raised">
                <SectionHeaderRow
                  className="px-pane-gutter"
                  actions={
                    <Text variant="caption" tone="muted">
                      {section.count}
                    </Text>
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
