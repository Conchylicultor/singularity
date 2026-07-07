import type { IconType } from "react-icons";
import { MdExtension, MdRule, MdStorefront } from "react-icons/md";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const SECTION_TITLE = "An architecture agents can trust";
const SECTION_SUBTITLE =
  "The platform is what lets agents build safely: composition happens through declared slots, and the boundaries are machine-checked, not conventions.";

interface Pillar {
  icon: IconType;
  title: string;
  blurb: string;
}

const ARCHITECTURE: Pillar[] = [
  {
    icon: MdExtension,
    title: "Slots & contributions",
    blurb:
      "Plugins never call each other directly — they contribute into declared slots. A collection owner renders whatever arrives, so adding a feature never edits existing code.",
  },
  {
    icon: MdRule,
    title: "Enforced boundaries",
    blurb:
      "One public barrel per plugin, no deep imports, no cycles — checked on every build. The rules that keep a hundred plugins composable are enforced by machines, not review.",
  },
  {
    icon: MdStorefront,
    title: "A marketplace in the making",
    blurb:
      "The same primitives are the seed of a plugin marketplace: building blocks users share, and agents assemble into a workspace shaped to each person.",
  },
];

/**
 * The architecture band — three cards making the developer case: slots,
 * enforced boundaries, and the marketplace trajectory.
 */
export function PlatformArchitecture() {
  return (
    <section>
      <Inset x="xl" y="2xl">
        <Stack gap="xl" className="mx-auto w-full max-w-5xl">
          <Stack gap="sm" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              The foundations
            </Text>
            <Text as="h2" variant="heading" className="tracking-tight">
              {SECTION_TITLE}
            </Text>
            <Text as="p" variant="body" tone="muted" className="max-w-2xl">
              {SECTION_SUBTITLE}
            </Text>
          </Stack>
          <Grid minCellWidth="16rem" gap="lg">
            {ARCHITECTURE.map((entry) => (
              <ArchitectureCard key={entry.title} entry={entry} />
            ))}
          </Grid>
        </Stack>
      </Inset>
    </section>
  );
}

function ArchitectureCard({ entry }: { entry: Pillar }) {
  const Icon = entry.icon;
  return (
    <Card>
      <Stack gap="md">
        <div className="w-fit rounded-lg bg-primary/10">
          <Inset pad="sm">
            <Icon className="size-6 text-primary" aria-hidden />
          </Inset>
        </div>
        <Stack gap="xs">
          <Text as="h3" variant="subheading">
            {entry.title}
          </Text>
          <Text as="p" variant="body" tone="muted">
            {entry.blurb}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}
