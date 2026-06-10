import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
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
  const story = useMemo(
    () => (result.pending ? [] : buildStoryTree(result.data, pageId)),
    [result, pageId],
  );
  return <Story.Renderer.Dispatch story={story} activeRendererId={rendererId} />;
}
