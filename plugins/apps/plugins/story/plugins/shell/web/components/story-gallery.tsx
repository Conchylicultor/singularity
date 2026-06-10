import { MdAdd, MdAutoStories } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { openPane } from "@plugins/primitives/plugins/pane/web";
import {
  pagesResource,
  pageData,
  type Block,
} from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { useStories } from "@plugins/apps/plugins/story/plugins/marker/web";
import { DataView } from "@plugins/primitives/plugins/data-view/web";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { storyDetailPane } from "../panes";
import { createStory } from "../internal/create-story";

/**
 * The gallery surface: a prominent header + a `DataView` over story-marked pages,
 * which brings search, sort, and view-state persistence for free.
 *
 * Joins the story marks (`useStories`) against the page resource — for each mark
 * we find its page by id. Marks whose page is missing are **skipped** rather than
 * crashing: a page could be deleted while its marker row lingers briefly, and the
 * gallery should degrade gracefully instead of throwing.
 */
export function StoryGallery() {
  const stories = useStories();
  const pagesResult = useResource(pagesResource);

  const cards: Block[] = pagesResult.pending
    ? []
    : stories
        // Resolve each mark to its page; drop marks with no surviving page.
        .map((mark) => pagesResult.data.find((p) => p.id === mark.pageId))
        .filter((page): page is Block => page !== undefined);

  const openStory = (page: Block) => {
    openPane(
      storyDetailPane,
      { pageId: page.id },
      { mode: "root", input: { title: pageData(page).title || "Untitled" } },
    );
  };

  const newStory = async () => {
    const pageId = await createStory();
    openPane(storyDetailPane, { pageId }, { mode: "root", input: { title: "" } });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* `pr-14` reserves the top-right gutter for the global floating action
          bar (fixed top-2 right-3) so the "New story" button stays clickable. */}
      <div className="flex items-center justify-between gap-4 py-4 pl-6 pr-14">
        <Text variant="title">Stories</Text>
        <Button size="sm" onClick={() => void newStory()}>
          <MdAdd className="size-4" />
          New story
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <DataView<Block>
          rows={cards}
          rowKey={(p) => p.id}
          fields={[
            {
              id: "title",
              label: "Title",
              type: "text",
              value: (p) => pageData(p).title || "Untitled",
            },
            {
              id: "updated",
              label: "Updated",
              type: "date",
              value: (p) => p.updatedAt,
              cell: (p) => formatRelativeTime(p.updatedAt),
            },
          ]}
          views={["gallery"]}
          defaultView="gallery"
          storageKey="story:gallery"
          onRowActivate={openStory}
          emptyState={'No stories yet. Create one with "New story".'}
          viewOptions={{
            // Plain literal (not the gallery child's `galleryOptions`) to respect
            // data-view's collection-consumer separation. The page icon renders in
            // the default card's tinted cover frame.
            gallery: {
              minCardWidth: 224,
              cover: (p: Block) => ({
                kind: "icon",
                icon: (
                  <PageIcon
                    nodes={pageData(p).iconSvgNodes}
                    fallback={MdAutoStories}
                    className="size-7"
                  />
                ),
              }),
            },
          }}
        />
      </div>
    </div>
  );
}
