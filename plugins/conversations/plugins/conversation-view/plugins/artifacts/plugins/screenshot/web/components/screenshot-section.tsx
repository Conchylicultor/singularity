import { MdPhotoCamera } from "react-icons/md";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  ImageGallery,
  ViewerThumbnail,
} from "@plugins/primitives/plugins/overlay/plugins/image-viewer/web";
import { codeImageUrl } from "@plugins/code-explorer/plugins/code-api/core";
import { useConversationById } from "@plugins/conversations/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import type { ArtifactItem } from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";
import { screenshotName } from "../internal/screenshots";

/** The pictures' glyph, the same one the Screenshot toolbar button wears. */
export const SCREENSHOT_ICON = MdPhotoCamera;

/**
 * The pictures the conversation looked at, four to a row.
 *
 * A picture is its own label, so this kind does not list rows: a thumbnail grid
 * says in one glance what a column of file names cannot. The file name is the
 * tooltip, and the full-window viewer shows it in its top bar.
 *
 * The whole grid is ONE `ImageGallery`, so opening any thumbnail lets ← / →
 * walk the conversation's other screenshots without going back to the popover.
 *
 * The popover deliberately stays open underneath. The viewer renders inside
 * this section's React tree (that is how `ViewerThumbnail` keeps a popover from
 * reading the viewer's own clicks as an outside press), so dismissing the
 * popover would unmount the viewer the click just opened. Closing the viewer
 * lands the reader back on the grid, which is where they would want to pick the
 * next picture anyway.
 */
export function ScreenshotSection({ items }: { items: ArtifactItem[] }) {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const worktree = conversation?.attemptId;

  // A picture's address is worktree-scoped, so until the conversation row
  // arrives there is no image to show — a loading state, not an empty grid.
  if (worktree === undefined) {
    return <Loading variant="cards" count={items.length} />;
  }

  return (
    <ImageGallery>
      <Grid cols={4} gap="2xs" align="center" className="px-sm">
        {items.map((item) => {
          const name = screenshotName(item.key);
          return (
            <span key={item.key} title={item.key} className="block">
              <ViewerThumbnail
                image={{
                  src: codeImageUrl(worktree, item.key),
                  name,
                  sourceLabel: "Screenshot",
                }}
                size="chip"
              />
            </span>
          );
        })}
      </Grid>
    </ImageGallery>
  );
}
