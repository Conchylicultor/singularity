import { MdAdd, MdAutoStories } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { openPane } from "@plugins/primitives/plugins/pane/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { useStories } from "@plugins/apps/plugins/story/plugins/marker/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { storyDetailPane } from "../panes";
import { createStory } from "../internal/create-story";

/**
 * The gallery surface: a grid of story cards plus a "New story" action.
 *
 * Joins the story marks (`useStories`) against the page resource — for each mark
 * we find its page by id. Marks whose page is missing are **skipped** rather than
 * crashing: a page could be deleted while its marker row lingers briefly, and the
 * gallery should degrade gracefully instead of throwing.
 */
export function StoryGallery() {
  const stories = useStories();
  const pagesResult = useResource(pagesResource);

  const cards = pagesResult.pending
    ? []
    : stories
        // Resolve each mark to its page; drop marks with no surviving page.
        .map((mark) => pagesResult.data.find((p) => p.id === mark.pageId))
        .filter((page) => page !== undefined);

  const openStory = (pageId: string, title: string) => {
    openPane(storyDetailPane, { pageId }, { mode: "root", input: { title } });
  };

  const newStory = async () => {
    const pageId = await createStory();
    openPane(storyDetailPane, { pageId }, { mode: "root", input: { title: "" } });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background text-foreground">
      {/* `pr-14` reserves the top-right gutter for the global floating action
          bar (fixed top-2 right-3) so the "New story" button stays fully
          clickable. */}
      <div className="flex items-center justify-between gap-4 py-4 pl-6 pr-14">
        <Text variant="title">Stories</Text>
        <Button size="sm" onClick={() => void newStory()}>
          <MdAdd className="size-4" />
          New story
        </Button>
      </div>

      <div className="min-h-0 flex-1 px-6 pb-6">
        {cards.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Text variant="body" tone="muted">
              No stories yet. Create one with "New story".
            </Text>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
            {cards.map((page) => {
              const data = pageData(page);
              const title = data.title || "Untitled";
              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => openStory(page.id, title)}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted"
                >
                  <div className="flex items-center gap-2">
                    <PageIcon
                      nodes={data.iconSvgNodes}
                      fallback={MdAutoStories}
                      className="size-5 text-muted-foreground"
                    />
                    <Text variant="label" className="truncate">
                      {title}
                    </Text>
                  </div>
                  <Text variant="caption" tone="muted">
                    {formatRelativeTime(page.updatedAt)}
                  </Text>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
