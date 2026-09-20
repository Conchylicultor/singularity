import { MdDescription } from "react-icons/md";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { pageData, pagesResource } from "@plugins/page/plugins/editor/core";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import type { ArtifactItem } from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";
import { ArtifactRow } from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/web";

/**
 * The glyph, in one place: the registry draws it on the contribution and every
 * row draws it again, and a row whose icon disagreed with its own section's
 * would read as a different kind of thing.
 *
 * It is the Pages app's own icon: a row here opens that app, and the thing you
 * land in should wear the mark you clicked.
 */
export const PAGE_ICON = MdDescription;

/** A page with no title of its own still has to be called something. */
const UNTITLED = "Untitled";

/**
 * Why a row cannot be opened — and NOT an error.
 *
 * The page tools write to the shared instance (normally main) while this view
 * reads whichever instance served it, so a worktree's stale DB fork routinely
 * has no row for a page that exists. The id may also name a card *inside* a
 * page rather than a page, which the pages list will never carry. Either way
 * there is no pane to open here.
 */
const NOT_HERE = "Not in this instance — page writes go to the shared instance";

/**
 * The pages a conversation wrote, changed or read, one per line.
 *
 * Titles come from `pagesResource`, the same live app-wide list the page chips
 * in the transcript resolve against, so a popover full of ids costs no requests
 * and a renamed page relabels itself.
 *
 * Until it arrives the rows are skeletons, one per artifact. The *count* is
 * known from the transcript alone — that is what the button shows — but a
 * *title* is not, and a raw `block-7f1a…` standing in for one would read as the
 * answer rather than as the wait for it.
 */
export function PageSection({ items }: { items: ArtifactItem[] }) {
  const pages = useResource(pagesResource);
  const openPane = useOpenPane();

  return matchResource(pages, {
    pending: () => <Loading variant="rows" count={items.length} />,
    ready: (rows) => (
      <Stack gap="none">
        {items.map((item) => {
          const page = rows.find((row) => row.id === item.key);
          return (
            <ArtifactRow
              key={item.key}
              item={item}
              icon={PAGE_ICON}
              title={
                page === undefined ? item.key : pageData(page).title || UNTITLED
              }
              inertReason={page === undefined ? NOT_HERE : undefined}
              onOpen={
                page === undefined
                  ? undefined
                  : // `push` opens the page as a column to the RIGHT of the
                    // conversation, so the transcript stays beside it.
                    () =>
                      openPane(
                        pageDetailPane,
                        { pageId: page.id },
                        { mode: "push" },
                      )
              }
            />
          );
        })}
      </Stack>
    ),
  });
}
