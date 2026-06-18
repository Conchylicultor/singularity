import { MdAdd, MdAutoStories } from "react-icons/md";
import { useResource, useCombinedResources } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  pagesResource,
  pageData,
  type Block,
} from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { storiesResource } from "@plugins/apps/plugins/story/plugins/marker/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { storyDetailPane } from "../panes";
import { createStory } from "../internal/create-story";

const STORY_GALLERY_VIEW = defineDataView("story.gallery");

/**
 * The gallery surface: a prominent header + a `DataView` over story-marked pages,
 * which brings search, sort, and view-state persistence for free.
 *
 * Joins the story marks against the page resource — for each mark we find its
 * page by id. Marks whose page is missing are **skipped** rather than crashing:
 * a page could be deleted while its marker row lingers briefly, and the gallery
 * should degrade gracefully instead of throwing.
 *
 * Both resources are combined via `useCombinedResources` so we never paint from
 * a half-loaded snapshot (e.g. showing "0 stories" while stories are in-flight).
 */
export function StoryGallery() {
  const storiesResult = useResource(storiesResource);
  const pagesResult = useResource(pagesResource);
  const all = useCombinedResources({ stories: storiesResult, pages: pagesResult });
  const openPane = useOpenPane();

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

  let cards: Block[] = [];
  if (!all.pending) {
    const { stories: storyMarks, pages } = all.data;
    cards = Object.values(storyMarks)
      // Resolve each mark to its page; drop marks with no surviving page.
      .map((mark) => pages.find((p) => p.id === mark.pageId))
      .filter((page): page is Block => page !== undefined);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="min-h-0 flex-1">
        <DataView<Block>
          title="Stories"
          loading={all.pending}
          creators={[
            {
              id: "story",
              label: "New story",
              icon: <MdAdd className="size-4" />,
              onSelect: newStory,
            },
          ]}
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
          storageKey={STORY_GALLERY_VIEW}
          onRowActivate={openStory}
          emptyState={'No stories yet. Create one with "New story".'}
          viewOptions={{
            // Plain literal (the gallery view child is never imported) to respect
            // data-view's collection-consumer separation. The page icon renders in
            // the default card's tinted cover frame.
            gallery: {
              minCardWidth: 224,
              showCreateCard: true,
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
