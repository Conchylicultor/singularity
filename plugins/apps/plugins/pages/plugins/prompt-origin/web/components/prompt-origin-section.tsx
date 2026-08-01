import { MdDescription } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { pageData, pagesResource } from "@plugins/page/plugins/editor/core";
import { usePromptTaskLink } from "@plugins/page/plugins/prompt/plugins/link/web";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";

/**
 * The page this task was launched from, or `null`. Three ways it is absent:
 *
 * - the task did not come from a prompt block (the common case — every task
 *   filed from anywhere else), so there is no link row;
 * - either read is still hydrating, so we do not yet know;
 * - the page is gone. `pageId`/`blockId` carry **no FK** by design (a task is
 *   real work and must outlive its block), so a dangling id is expected, not an
 *   error — the provenance is simply no longer navigable.
 */
function useOriginPage(taskId: string): { pageId: string; title: string } | null {
  const origin = usePromptTaskLink(taskId);
  const pagesResult = useResource(pagesResource);

  if (!origin) return null;
  if (pagesResult.pending) return null;

  const page = pagesResult.data.find((row) => row.id === origin.pageId);
  if (!page) return null;

  return { pageId: origin.pageId, title: pageData(page).title || "Untitled" };
}

/**
 * The whole section is conditional — with no live page to link to the host
 * paints nothing at all: no card, no title, no empty state.
 */
export function usePromptOriginAvailable({ taskId }: { taskId: string }): boolean {
  return useOriginPage(taskId) !== null;
}

/** "Origin" section of the task detail: a chip linking back to the source page. */
export function PromptOriginSection({ taskId }: { taskId: string }) {
  const page = useOriginPage(taskId);
  const openPane = useOpenPane();

  if (!page) return null;

  return (
    <Cluster>
      <LinkChip
        leading={<MdDescription />}
        title={page.title}
        onClick={() =>
          openPane(pageDetailPane, { pageId: page.pageId }, { mode: "push" })
        }
      >
        {page.title}
      </LinkChip>
    </Cluster>
  );
}
