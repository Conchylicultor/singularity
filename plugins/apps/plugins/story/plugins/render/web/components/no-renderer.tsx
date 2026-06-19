import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { StoryNode } from "@plugins/apps/plugins/story/plugins/story-core/core";

/**
 * Story.Renderer fallback — rendered when no renderer matches the active id.
 * Visible (fail-loud) so a missing lens shows rather than silently blanks.
 * Ignores its props (story / activeRendererId).
 */
export function NoRenderer(_props: { story: StoryNode[]; activeRendererId: string }) {
  return (
    <Center className="h-full">
      <Inset pad="2xl">
        <Text variant="body" tone="muted">
          No renderer available
        </Text>
      </Inset>
    </Center>
  );
}
