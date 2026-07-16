import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { plainOf } from "@plugins/page/plugins/editor/core";
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
 *
 * Text is read through the block's typed lens (`textBlock.text`) and flattened
 * with `plainOf` — a raw `data.text` read would render the runs array as a React
 * child and crash ("Objects are not valid as a React child").
 */
export function TextContent({ node }: { node: StoryNode }) {
  const result = textBlock.safeParse(node.data);
  const text = result.success ? plainOf(textBlock.text(result.data)) : "";
  if (!text) return null;
  return (
    <Text as="p" variant="body">
      {text}
    </Text>
  );
}
