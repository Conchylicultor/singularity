import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

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
    <section>
      <Inset x="xl" y="2xl">
        <Stack gap="sm" className="mx-auto w-full max-w-2xl">
          <Text variant="eyebrow" tone="muted">
            {EYEBROW}
          </Text>
          <Text as="h1" variant="title" className="tracking-tight">
            {QUESTION}
          </Text>
        </Stack>
      </Inset>
    </section>
  );
}
