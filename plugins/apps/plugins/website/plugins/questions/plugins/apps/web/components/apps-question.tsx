import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WebsiteBand } from "@plugins/apps/plugins/website/plugins/shell/web";

const EYEBROW = "The applications";
const QUESTION = "What will apps evolve into?";

/**
 * The page's question, restated as its heading — the same words the homepage
 * fork used, so arriving here confirms rather than re-introduces.
 *
 * It stands alone above `WebsiteApps.Section`: the answer is not written yet,
 * and an unwritten page should read as unwritten. No placeholder copy, no
 * empty-state chrome — the question, then the sections when they exist.
 */
export function AppsQuestion() {
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
