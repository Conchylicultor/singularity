import { MdGrade } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { SidebarPaneSection } from "@plugins/primitives/plugins/app-shell/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { SortableList, SortableItem } from "@plugins/primitives/plugins/sortable-list/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { pagesResource, pageData, type Block } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { movePageStarred } from "../../shared/endpoints";
import { starredPagesResource, type StarredPageRow } from "../../shared/resources";

export function FavoritesSidebar() {
  const starredResult = useResource(starredPagesResource);
  const pagesResult = useResource(pagesResource);
  const openPane = useOpenPane();
  const { mutate: moveStarred } = useEndpointMutation(movePageStarred);
  const selectedId = pageDetailPane.useRouteEntry()?.params.pageId;

  // Hide the whole section while loading or when there are no favorites — no
  // empty collapsible header (Notion-style).
  if (starredResult.pending || pagesResult.pending) return null;
  if (starredResult.data.length === 0) return null;

  const pagesById = new Map<string, Block>(pagesResult.data.map((b) => [b.id, b]));

  // Only favorites that still resolve to an existing page (a deleted page
  // FK-cascades its starred row away, but guard against transient skew).
  const rows = starredResult.data.filter((r): r is StarredPageRow =>
    pagesById.has(r.parentId),
  );
  if (rows.length === 0) return null;

  const ids = rows.map((r) => r.parentId);

  const onMove = (activeId: string, overId: string) => {
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return;

    // Apply the move to derive the dropped item's new neighbors, then mint a
    // rank strictly between them. Neighbors keep their existing ranks (only the
    // moved item is re-ranked), so Rank.between is stable.
    const nextIds = [...ids];
    const [moved] = nextIds.splice(from, 1);
    nextIds.splice(to, 0, moved!);
    const at = nextIds.indexOf(activeId);
    const prev = at > 0 ? rows.find((r) => r.parentId === nextIds[at - 1])!.rank : null;
    const next =
      at < nextIds.length - 1
        ? rows.find((r) => r.parentId === nextIds[at + 1])!.rank
        : null;
    const rank = Rank.between(prev, next);
    // The live resource push reconciles and SortableList shows an optimistic
    // order during the drag; a failed write surfaces via the global error toast.
    moveStarred({ params: { pageId: activeId }, body: { rank: rank.toString() } });
  };

  return (
    <SidebarPaneSection title="Favorites" icon={MdGrade}>
      <div className="min-h-0 flex-1 overflow-y-auto py-xs">
        <SortableList items={ids} onMove={onMove}>
          <Stack gap="2xs">
            {rows.map((r) => {
              const data = pageData(pagesById.get(r.parentId)!);
              return (
                <SortableItem key={r.parentId} id={r.parentId}>
                  {() => (
                    <Row
                      selected={r.parentId === selectedId}
                      icon={<PageIcon nodes={data.iconSvgNodes} />}
                      onClick={() =>
                        openPane(pageDetailPane, { pageId: r.parentId }, { mode: "push" })
                      }
                    >
                      {data.title || "Untitled"}
                    </Row>
                  )}
                </SortableItem>
              );
            })}
          </Stack>
        </SortableList>
      </div>
    </SidebarPaneSection>
  );
}
