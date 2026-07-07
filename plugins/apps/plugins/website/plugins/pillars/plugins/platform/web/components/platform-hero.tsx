import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const EYEBROW = "Behind the scenes";
const HEADLINE = "Everything is a plugin.";
const SUBHEAD =
  "For the builders and the curious: equin is a slot-based extension system with strictly enforced boundaries. Plugins compose into apps, apps compose into releases — the whole workspace, this website included, is one pyramid of building blocks.";

/**
 * Opening band of the Platform pillar page: the developer-facing pitch.
 * Mirrors the landing hero's centered, gradient-washed layout so pillar pages
 * read as the same site.
 */
export function PlatformHero() {
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
