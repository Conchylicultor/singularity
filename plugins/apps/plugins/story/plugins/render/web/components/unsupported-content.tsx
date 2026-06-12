import { Text } from "@plugins/primitives/plugins/text/web";
import type { StoryNode } from "@plugins/apps/plugins/story/plugins/story-core/core";

/**
 * Story.Content fallback — rendered when no content widget supports the block's
 * type. Visible (fail-loud): an unsupported block is shown as a muted
 * placeholder, never hidden.
 */
export function UnsupportedContent({ node }: { node: StoryNode }) {
  return (
    <Text as="div" variant="body" tone="muted" className="px-md py-sm">
      ⛔ {node.type} — not shown in this view
    </Text>
  );
}
