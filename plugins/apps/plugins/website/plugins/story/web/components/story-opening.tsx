import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WebsiteBand } from "@plugins/apps/plugins/website/plugins/shell/web";

const EYEBROW = "The story";
const HEADING = "How equin came to be";

/**
 * The page's opening — the same words the homepage's story link used, so
 * arriving here confirms rather than re-introduces.
 *
 * It stands alone above `WebsiteStory.Section`: the story is not written yet, and
 * an unwritten page should read as unwritten. No placeholder copy, no empty-state
 * chrome — the heading, then the sections when they exist.
 */
export function StoryOpening() {
  return (
    <WebsiteBand>
      <Stack gap="sm">
        <Text variant="eyebrow" tone="muted">
          {EYEBROW}
        </Text>
        <Text as="h1" variant="title">
          {HEADING}
        </Text>
      </Stack>
    </WebsiteBand>
  );
}
