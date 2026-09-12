import { blockAuthorOf } from "../../core/define-block";
import { PAGE_BLOCK_TYPE, pageBlockHandle, pageData } from "../../core/schemas";

/**
 * The `title` of every HUMAN sub-page among `rows` — the value of the annotated
 * `title` attribute on `<page id="…" title="…"/>`, this plugin's own
 * `Editor.BlockAnnotation` contribution.
 *
 * An annotation rather than a field the `<page>` spelling reads from `data`,
 * because `<page>` is ALSO how a link-to-page block writes itself, and that
 * block's title lives on another row: `page-link` claims the tag on parse, so a
 * `title` there has to be read-only and discarded, which is what `annotated`
 * means. `page-link/server` answers for the link rows; this answers for the
 * shells, whose title is simply their own.
 *
 * An agent-authored page is skipped: its `<agent-page>` spelling emits `title`
 * from `data` itself, and does not reserve the name — so supplying it here too
 * would be a loud serialize error, not a duplicate. That throw is also what
 * keeps this skip honest if the spellings ever change.
 *
 * No query: the answer is in the rows the read already holds.
 */
export function resolvePageTitleAnnotations(
  rows: readonly { id: string; type: string; data: unknown }[],
): Promise<ReadonlyMap<string, Record<string, string>>> {
  const byBlock = new Map<string, Record<string, string>>();
  for (const row of rows) {
    if (row.type !== PAGE_BLOCK_TYPE) continue;
    if (blockAuthorOf(pageBlockHandle, row.data) === "agent") continue;
    byBlock.set(row.id, { title: pageData(row).title });
  }
  return Promise.resolve(byBlock);
}
