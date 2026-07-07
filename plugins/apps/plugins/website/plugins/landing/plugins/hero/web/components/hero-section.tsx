import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const EYEBROW = "equin — the self-evolving workspace";
const HEADLINE = "One app that becomes every app.";
const SUBHEAD =
  "equin is a self-evolving workspace for the agentic era, where agents compose personal apps on the fly from shared building blocks — a single surface at the boundary of an application and an operating system, shaped to how you work.";

/**
 * The hero band — the site's opening statement. A full-width section over a
 * subtle top-down primary wash, with generous vertical rhythm: an eyebrow pill,
 * the headline, and a muted subheadline, centered and width-constrained.
 */
export function HeroSection() {
  return (
    <section className="bg-linear-to-b from-primary/10 to-card">
      <Inset x="xl" y="2xl">
        <Stack
          gap="lg"
          align="center"
          className="mx-auto w-full max-w-4xl text-center"
        >
          <div className="rounded-full border border-primary/20 bg-primary/5">
            <Inset x="md" y="2xs">
              <Text variant="eyebrow" tone="primary">
                {EYEBROW}
              </Text>
            </Inset>
          </div>
          <Text as="h1" variant="title" className="tracking-tight">
            {HEADLINE}
          </Text>
          <Text as="p" variant="body" tone="muted" className="max-w-2xl">
            {SUBHEAD}
          </Text>
        </Stack>
      </Inset>
    </section>
  );
}
