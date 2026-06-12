import type { IconType } from "react-icons";
import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { StoryNode } from "@plugins/apps/plugins/story/plugins/story-core/core";
import { NoRenderer } from "./components/no-renderer";
import { UnsupportedContent } from "./components/unsupported-content";

export const Story = {
  // RENDERER — single-active lens (Slides, Blog, …). Dispatch key is the active
  // renderer id, carried in the render props so the host owns `activeRendererId`.
  // `Extra` ({id,label,icon?}) is the metadata the RendererPicker enumerates.
  Renderer: defineDispatchSlot<
    { story: StoryNode[]; pageId: string; activeRendererId: string },
    string,
    { id: string; label: string; icon?: IconType }
  >("story.renderer", {
    key: (p) => p.activeRendererId,
    fallback: NoRenderer,
    docLabel: (c) => c.label,
  }),

  // CONTENT — per-block widget; dispatch key is the block's type. Renderers call
  // <Story.Content node={node}/> for each content node; unsupported types fall
  // through to the visible UnsupportedContent placeholder (fail-loud).
  Content: defineDispatchSlot<{ node: StoryNode }, string>("story.content", {
    key: (p) => p.node.type,
    fallback: UnsupportedContent,
  }),
};
