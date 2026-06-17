import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { textBlock } from "@plugins/page/plugins/text/core";
import type { StoryNode } from "@plugins/apps/plugins/story/plugins/story-core/core";

/**
 * Story.Content widget for the `text` block type. Renders the block's text as a
 * paragraph.
 *
 * Defensive parse: `node.data` may be transient/empty mid-edit, so we safe-parse
 * and fall back to "" rather than throw. The slot-render item error boundary
 * would contain a throw to this one leaf, but a safe fallback avoids a visible
 * boundary flicker while typing. An empty paragraph renders nothing.
 */
export function TextContent({ node }: { node: StoryNode }) {
  const result = textBlock.schema.safeParse(node.data);
  const text = result.success ? (result.data as { text: string }).text : "";
  if (!text) return null;
  return (
    <Text as="p" variant="body">
      {text}
    </Text>
  );
}
