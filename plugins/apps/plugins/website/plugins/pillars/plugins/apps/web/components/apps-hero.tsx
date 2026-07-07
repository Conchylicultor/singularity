import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const EYEBROW = "The apps";
const HEADLINE = "Real apps, ready on day one.";
const SUBHEAD =
  "equin ships working apps out of the box — a Notion-like editor, a Gmail-class client, a piano studio, an automation builder — and agents grow new ones from the same building blocks.";

/**
 * Opening band of the Apps pillar page: the end-user promise. Mirrors the
 * landing hero's centered, gradient-washed layout so pillar pages read as the
 * same site.
 */
export function AppsHero() {
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
