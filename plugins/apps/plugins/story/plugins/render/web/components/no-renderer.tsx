import type { StoryNode } from "@plugins/apps/plugins/story/plugins/story-core/core";

/**
 * Story.Renderer fallback — rendered when no renderer matches the active id.
 * Visible (fail-loud) so a missing lens shows rather than silently blanks.
 * Ignores its props (story / activeRendererId).
 */
export function NoRenderer(_props: { story: StoryNode[]; activeRendererId: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      No renderer available
    </div>
  );
}
