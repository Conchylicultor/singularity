import type { IconType } from "react-icons";
import { MdApps, MdAutoAwesome, MdExtension } from "react-icons/md";
import {
  useOpenPane,
  type PaneObject,
} from "@plugins/primitives/plugins/pane/web";
import { appsPane } from "@plugins/apps/plugins/website/plugins/pillars/plugins/apps/web";
import { agentsPane } from "@plugins/apps/plugins/website/plugins/pillars/plugins/agents/web";
import { platformPane } from "@plugins/apps/plugins/website/plugins/pillars/plugins/platform/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

const SECTION_TITLE = "Apps you use. Agents that build them. A platform underneath.";
const SECTION_SUBTITLE =
  "Three pillars that demonstrate each other: agents assemble apps out of plugins, the apps prove the platform, and the platform lets anyone extend both.";

interface Pillar {
  icon: IconType;
  title: string;
  blurb: string;
  highlights: string;
  cta: string;
  pane: PaneObject;
}

/**
 * The three pillars are a closed set by definition — the site's information
 * architecture, not an extensible collection — so this is plain data, not a
 * slot.
 */
const PILLARS: Pillar[] = [
  {
    icon: MdApps,
    title: "The apps",
    blurb:
      "Real, working apps from day one — a block editor, a mail client, a piano studio, an automation builder — all made of the same building blocks.",
    highlights: "Pages · Mail · Sonata · Workflows",
    cta: "Explore the apps",
    pane: appsPane,
  },
  {
    icon: MdAutoAwesome,
    title: "The agents",
    blurb:
      "A nested to-do list of work for agents. Each one builds in its own isolated worktree, racing to close tasks faster than they are created.",
    highlights: "Nested tasks · isolated worktrees · the race",
    cta: "Meet the agents",
    pane: agentsPane,
  },
  {
    icon: MdExtension,
    title: "The platform",
    blurb:
      "Underneath, everything is a plugin: a slot-based extension system with machine-enforced boundaries that agents and developers compose into apps.",
    highlights: "Slots · boundaries · one release engine",
    cta: "Under the hood",
    pane: platformPane,
  },
];

/**
 * The three-pillars band — the landing page's narrative spine. One teaser
 * card per pillar, each opening its dedicated pillar page.
 */
export function PillarsSection() {
  return (
    <section>
      <Inset x="xl" y="2xl">
        <Stack gap="xl" className="mx-auto w-full max-w-5xl">
          <Stack gap="sm" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              Three pillars
            </Text>
            <Text as="h2" variant="heading" className="tracking-tight">
              {SECTION_TITLE}
            </Text>
            <Text as="p" variant="body" tone="muted" className="max-w-2xl">
              {SECTION_SUBTITLE}
            </Text>
          </Stack>
          <Grid minCellWidth="16rem" gap="lg">
            {PILLARS.map((pillar) => (
              <PillarCard key={pillar.title} pillar={pillar} />
            ))}
          </Grid>
        </Stack>
      </Inset>
    </section>
  );
}

function PillarCard({ pillar }: { pillar: Pillar }) {
  const openPane = useOpenPane();
  const Icon = pillar.icon;
  return (
    <Card className="h-full">
      <Stack gap="md" className="h-full">
        <div className="w-fit rounded-lg bg-primary/10">
          <Inset pad="sm">
            <Icon className="size-6 text-primary" aria-hidden />
          </Inset>
        </div>
        <Fill axis="y">
          <Stack gap="xs">
            <Text as="h3" variant="subheading">
              {pillar.title}
            </Text>
            <Text as="p" variant="body" tone="muted">
              {pillar.blurb}
            </Text>
            <Text as="p" variant="caption" tone="muted">
              {pillar.highlights}
            </Text>
          </Stack>
        </Fill>
        <div>
          <Button
            variant="outline"
            onClick={() => openPane(pillar.pane, {}, { mode: "root" })}
          >
            {pillar.cta}
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
