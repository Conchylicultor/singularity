import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { PageReference } from "./slots";

/**
 * Every `PageReference.Trailing` contribution for the page a reference points
 * at, in one rigid line — what a reference renderer places right after the
 * title, so the sub-page row, the link block and the backlinks list show the
 * same things about a page in the same order. Rigid: the title beside it is
 * the cell that truncates, never these.
 */
export function PageReferenceTrailing({ pageId }: { pageId: string }) {
  return (
    <Inline gap="xs" className={rigidClass()}>
      <PageReference.Trailing.Render>
        {(item) => <item.component pageId={pageId} />}
      </PageReference.Trailing.Render>
    </Inline>
  );
}
