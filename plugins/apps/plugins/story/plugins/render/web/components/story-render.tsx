import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { blocksResource } from "@plugins/page/plugins/editor/core";
import { buildStoryTree } from "@plugins/apps/plugins/story/plugins/story-core/core";
import { Story } from "../slots";

/**
 * Reusable Story render surface: reads the page's blocks, builds the
 * renderer-agnostic StoryNode IR (mirrors block-editor.tsx's resource → sort →
 * buildTree), and dispatches to the active renderer.
 */
export function StoryRender({ pageId, rendererId }: { pageId: string; rendererId: string }) {
  const result = useResource(blocksResource, { pageId });
  if (result.pending) return <Loading variant="rows" />;
  const story = buildStoryTree(result.data, pageId);
  return <Story.Renderer.Dispatch story={story} pageId={pageId} activeRendererId={rendererId} />;
}
