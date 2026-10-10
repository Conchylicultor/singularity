import type { ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type {
  DataViewFoldLines,
  DataViewSection,
} from "@plugins/primitives/plugins/data-view/core";
import { FoldLine } from "./fold-line";
import { SectionPagingFooter } from "./section-paging-footer";
import { PagePlaceholders } from "./page-placeholders";

export interface SectionBodyProps {
  /** The section this band renders. Its fold line (when it carries `fold`) is
   *  drawn as the band's last row. */
  section: DataViewSection<unknown>;
  /** The view's `DataViewRenderProps.foldLines`. Absent ⇒ nothing folds. */
  foldLines: DataViewFoldLines | undefined;
  /**
   * The band's BLOCK padding — the view's own rhythm (`py-sm`, `pb-sm`). The
   * inline inset is the rail's, which this band pays. Dropped when the band holds
   * only its fold line, so an all-folded section is not an empty padded gap.
   */
  className?: string;
  /** The section's visible entries, laid out the view's way (rows, a grid, a
   *  windowed list). `null` when every entry is folded. */
  children: ReactNode;
}

/**
 * The body band of one DataView section: the ONE box that pays the ambient rail
 * (`rail-follow`) for the section's content, with the section's fold line as its
 * last row.
 *
 * The fold line lives here, not beside the band, so it lands wherever the view's
 * own entries land — a view never states that edge, so it cannot state it wrong.
 * A list's rows are `Row`s inside the band (pill on the rail, text one row pad
 * in), and the fold line is a `Row` in the same band, so its caption sits on the
 * rows' content column; a gallery's cards sit on the rail, and so does the fold
 * line's pill. When the fold line was a free-standing band carrying its own
 * `rail-follow`, that class replaced its row padding, and in the list it drew one
 * row pad left of every row it closed.
 *
 * It is also why a view cannot forget the fold line: rendering a section body IS
 * rendering its fold line. `FoldLine` is not exported.
 *
 * The same holds for a DECLARED section's own paging (`section.paging`): the
 * band ends in its footer — loading-more, Retry, and the sentinel whose first
 * sighting starts the section's read — so a section with no row loaded yet
 * still draws its band, and no view can render a declared section that never
 * loads. Its read's pages past the stale budget are drawn here too, as
 * height-keeping placeholders before the entries and after them; with no
 * entries in the band (every row folded, or a view drawing its rows outside
 * it — the table's grid) only those after them are drawn, since the band has
 * no rows to stand above.
 *
 * Its content must not follow the rail again — the band has paid it, and a
 * nested `rail-follow` pays it twice (the rail guard's nested-follower check).
 */
export function SectionBody({
  section,
  foldLines,
  className,
  children,
}: SectionBodyProps): ReactNode {
  const folds = section.fold != null && foldLines != null;
  const empty = children == null || children === false;
  if (empty && !folds && !section.paging) return null;
  return (
    <div className={cn("rail-follow", !empty && className)}>
      {section.paging && !empty ? (
        <PagePlaceholders placeholders={section.paging.placeholders.before} />
      ) : null}
      {children}
      {section.paging ? (
        <PagePlaceholders placeholders={section.paging.placeholders.after} />
      ) : null}
      <FoldLine section={section} foldLines={foldLines} />
      {section.paging ? (
        <SectionPagingFooter
          paging={section.paging}
          shown={section.entries.length}
        />
      ) : null}
    </div>
  );
}
