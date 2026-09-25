import type { ReactNode } from "react";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type {
  DataViewFoldLines,
  DataViewSection,
} from "@plugins/primitives/plugins/data-view/core";
import { foldKeyOf } from "../internal/fold-sections";

export interface FoldLineProps {
  /** The section the line closes. Renders nothing unless it carries a `fold`. */
  section: DataViewSection<unknown>;
  /** The view's `DataViewRenderProps.foldLines`. Absent ⇒ nothing folds. */
  foldLines: DataViewFoldLines | undefined;
}

/**
 * The fold line: the last line of a section some of whose rows are folded. Closed
 * it reads `… N more`, open it reads `Show less`; clicking toggles THIS section's
 * fold (`foldLines.setOpen`). A muted caption row on the ambient rail, and a real
 * `<button>` (`Row` infers it from `onClick`). The tooltip is the fold rule in
 * words, so the user can tell why these rows were set aside.
 *
 * Every flat view must render one per folded section — `GroupedSections` does it
 * for the grouped path; each view's ungrouped fast path renders it after its
 * body. A view that does not would make the folded rows vanish silently.
 *
 * Not to be confused with the tree's fold-children header action: that collapses
 * a group's subtrees; this reveals rows a fold rule set aside.
 */
export function FoldLine({ section, foldLines }: FoldLineProps): ReactNode {
  const fold = section.fold;
  if (!fold || !foldLines) return null;
  const key = foldKeyOf(section);
  return (
    <Row
      size="sm"
      hover="muted"
      className="rail-follow"
      title={foldLines.summary}
      aria-expanded={fold.open}
      onClick={() => foldLines.setOpen(key, !fold.open)}
    >
      <Text variant="caption" tone="muted">
        {fold.open ? "Show less" : `… ${fold.hidden} more`}
      </Text>
    </Row>
  );
}
