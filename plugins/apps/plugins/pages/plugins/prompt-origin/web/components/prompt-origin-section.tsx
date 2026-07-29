import { MdDescription } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { pageData, pagesResource } from "@plugins/page/plugins/editor/core";
import { usePromptTaskLink } from "@plugins/page/plugins/prompt/plugins/link/web";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";

/**
 * "Origin" section of the task detail: the page this task was launched from,
 * when it came from a `/prompt` block.
 *
 * The whole section is conditional — it renders nothing at all (no header, no
 * empty state) unless there is a live page to link to. Three ways that happens:
 *
 * - the task did not come from a prompt block (the common case — every task
 *   filed from anywhere else), so there is no link row;
 * - either read is still hydrating, so we do not yet know;
 * - the page is gone. `pageId`/`blockId` carry **no FK** by design (a task is
 *   real work and must outlive its block), so a dangling id is expected, not an
 *   error — the provenance is simply no longer navigable.
 */
export function PromptOriginSection({ taskId }: { taskId: string }) {
  const origin = usePromptTaskLink(taskId);
  const pagesResult = useResource(pagesResource);
  const openPane = useOpenPane();

  if (!origin) return null;
  if (pagesResult.pending) return null;

  const page = pagesResult.data.find((row) => row.id === origin.pageId);
  if (!page) return null;

  const title = pageData(page).title || "Untitled";

  return (
    <Stack gap="sm">
      <SectionHeaderRow>Origin</SectionHeaderRow>
      <Cluster>
        <LinkChip
          leading={<MdDescription />}
          title={title}
          onClick={() =>
            openPane(pageDetailPane, { pageId: origin.pageId }, { mode: "push" })
          }
        >
          {title}
        </LinkChip>
      </Cluster>
    </Stack>
  );
}
