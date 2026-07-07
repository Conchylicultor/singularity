import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const EYEBROW = "The agent manager";
const HEADLINE = "A workforce that builds your workspace.";
const SUBHEAD =
  "At the heart of equin is a nested to-do list of work for agents. Each one builds in its own isolated worktree — implementing apps, fixing bugs, composing plugins — racing to close tasks faster than they are created.";

/**
 * Opening band of the Agents pillar page: the builder story. Mirrors the
 * landing hero's centered, gradient-washed layout so pillar pages read as the
 * same site.
 */
export function AgentsHero() {
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
