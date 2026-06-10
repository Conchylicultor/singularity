import type { StoryNode } from "@plugins/apps/plugins/story/plugins/story-core/core";

/**
 * Story.Content fallback — rendered when no content widget supports the block's
 * type. Visible (fail-loud): an unsupported block is shown as a muted
 * placeholder, never hidden.
 */
export function UnsupportedContent({ node }: { node: StoryNode }) {
  return (
    <div className="px-3 py-2 text-sm text-muted-foreground">
      ⛔ {node.type} — not shown in this view
    </div>
  );
}
