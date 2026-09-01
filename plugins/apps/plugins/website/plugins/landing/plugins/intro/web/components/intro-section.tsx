import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const THESIS =
  "equin is a self-evolving application. Agents extend it while I use it — and I use it every day.";
const PREMISE =
  "It started as a bet: that AI doesn't just make the software we already have cheaper to build, but makes a kind of software possible that didn't exist before. Two questions come out of that, and they have different answers.";

/**
 * The opening statement, and the whole of the homepage above the fork: what
 * this is, and why there are two questions rather than one pitch.
 *
 * Deliberately not a hero — no eyebrow pill, no gradient wash, no call to
 * action. The site is one developer's proof of concept, so the register is an
 * essay's: the thesis in `subheading`, the premise beneath it in muted body,
 * left-aligned on a reading measure rather than centered like a product page.
 */
export function IntroSection() {
  return (
    <section>
      <Inset x="xl" y="2xl">
        <Stack gap="lg" className="mx-auto w-full max-w-2xl">
          <Text as="p" variant="subheading">
            {THESIS}
          </Text>
          <Text as="p" variant="body" tone="muted">
            {PREMISE}
          </Text>
        </Stack>
      </Inset>
    </section>
  );
}
