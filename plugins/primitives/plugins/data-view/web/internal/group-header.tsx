import { type ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { RowActions } from "@plugins/primitives/plugins/row-actions/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  formatSectionCount,
  type DataViewGroupHeaders,
  type DataViewSection,
} from "@plugins/primitives/plugins/data-view/core";

export interface DataViewGroupHeaderProps {
  /** The section this header heads: its `label` and `count` are what it shows. */
  section: DataViewSection<unknown>;
  /** The header treatment — see {@link DataViewGroupHeaders}. Default `"standard"`. */
  headerStyle?: DataViewGroupHeaders;
  /**
   * Expanded state and toggle. Optional: absent, both come from the surrounding
   * collapsible context (`GroupedSections` wraps each section in one); the table,
   * which has no such wrapper, passes them explicitly.
   */
  open?: boolean;
  onClick?: () => void;
  /**
   * A section-scoped affordance (`GroupedSectionsProps.headerActions`), hover-
   * revealed in the trailing cluster. `null`/absent ⇒ no cluster at all.
   */
  action?: ReactNode;
  /** Forwarded to the header row (the band's inline-inset choice is the caller's). */
  className?: string;
}

/**
 * The ONE rendering of a DataView group header, in either treatment — shared by
 * `GroupedSections` (list, gallery, tree, icons) and the table view, which draws
 * its headers inside `data-table`'s subgrid but must look the same.
 *
 * - **standard** — the chevron-led `value` header with the count as a muted
 *   caption at the far right (beside the action, when there is one).
 * - **quiet** — one run: a semibold `group` label, then its count right beside
 *   it (faint, semibold), the fold chevron trailing that run and shown only on
 *   hover / keyboard focus. The count is part of the label's run, so the
 *   trailing cluster holds only an action.
 */
export function DataViewGroupHeader({
  section,
  headerStyle = "standard",
  open,
  onClick,
  action,
  className,
}: DataViewGroupHeaderProps): ReactNode {
  if (headerStyle === "quiet") {
    return (
      <SectionHeaderRow
        // The `group` role: the heading of a group of rows (its semibold comes
        // with the role), sized by the theme apart from the rows it heads.
        variant="group"
        disclosure="trailing"
        open={open}
        onClick={onClick}
        className={className}
        // The count is part of the label's run here, so the trailing cluster
        // holds only an action — and, like the standard header, nothing at all
        // when there is none.
        actions={
          action == null ? undefined : (
            <RowActions pin={null}>{action}</RowActions>
          )
        }
      >
        {section.label}
        {/* A quiet header's count is a faint, semibold tally right after its
            label ("Queue 6"). */}
        <Text variant="caption" tone="faint" className="font-semibold">
          {formatSectionCount(section.count)}
        </Text>
      </SectionHeaderRow>
    );
  }
  const count = (
    <Text variant="caption" tone="muted">
      {formatSectionCount(section.count)}
    </Text>
  );
  return (
    <SectionHeaderRow
      // The label is the grouped column's VALUE, not a name this chrome chose —
      // so it is spelled the way the data spells it.
      variant="value"
      open={open}
      onClick={onClick}
      className={className}
      // This `null` test is the ONLY thing between a section and an empty
      // `RowActions` — which is not nothing: the cluster is a flex item, so an
      // empty one still spends the `gap` below and pulls that section's count
      // off the edge its neighbours line up on. Hence the contract that
      // `headerActions` returns `null`, not a component that renders nothing: a
      // component is an element, and an element is never `null`.
      actions={
        action == null ? (
          count
        ) : (
          // `gap="xs"` is load-bearing rather than decorative: the header has
          // only ever carried the count, so nothing has ever sat beside it, and
          // the two would otherwise touch.
          <Stack direction="row" gap="xs" align="center">
            {count}
            <RowActions pin={null}>{action}</RowActions>
          </Stack>
        )
      }
    >
      {section.label}
    </SectionHeaderRow>
  );
}
