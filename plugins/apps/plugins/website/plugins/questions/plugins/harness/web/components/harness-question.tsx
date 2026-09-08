import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WebsiteBand } from "@plugins/apps/plugins/website/plugins/shell/web";

const EYEBROW = "The engineering";
const QUESTION =
  "What does software engineering look like when no human reviews the code?";

/**
 * The page's question, restated as its heading — the same words the homepage
 * fork used, so arriving here confirms rather than re-introduces.
 *
 * It stands alone above `WebsiteHarness.Section`: the answer is not written
 * yet, and an unwritten page should read as unwritten. No placeholder copy, no
 * empty-state chrome — the question, then the sections when they exist.
 */
export function HarnessQuestion() {
  return (
    <WebsiteBand>
      <Stack gap="sm">
        <Text variant="eyebrow" tone="muted">
          {EYEBROW}
        </Text>
        <Text as="h1" variant="title">
          {QUESTION}
        </Text>
      </Stack>
    </WebsiteBand>
  );
}
