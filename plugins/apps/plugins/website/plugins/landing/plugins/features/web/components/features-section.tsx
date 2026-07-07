import type { IconType } from "react-icons";
import {
  MdAutoAwesome,
  MdDescription,
  MdMail,
  MdPalette,
  MdExtension,
  MdAccountTree,
} from "react-icons/md";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const SECTION_TITLE = "One surface, composed from building blocks";
const SECTION_SUBTITLE =
  "Every capability in equin is a plugin. Agents assemble them into the apps you need — the same primitives, recomposed for how you work.";

interface Feature {
  icon: IconType;
  title: string;
  blurb: string;
}

const FEATURES: Feature[] = [
  {
    icon: MdAutoAwesome,
    title: "Agent manager",
    blurb:
      "A nested to-do list where each agent works in its own isolated worktree, racing to close tasks faster than they are created.",
  },
  {
    icon: MdDescription,
    title: "Pages",
    blurb:
      "A Notion-like block editor with databases, views, and full-text search — the composable document surface at the core of the workspace.",
  },
  {
    icon: MdMail,
    title: "Mail",
    blurb:
      "A Gmail-class client with on-demand sync, a privacy-safe HTML reader, and a fast keyset-paginated inbox — mail as just another app.",
  },
  {
    icon: MdPalette,
    title: "Theming engine",
    blurb:
      "Design tokens, swappable presets, and per-app themes. Retheme typography, color, and density across the whole surface in one move.",
  },
  {
    icon: MdExtension,
    title: "Plugin architecture",
    blurb:
      "A slot-based extension system with strict boundaries. Features snap together from shared primitives — the foundation for a plugin marketplace.",
  },
  {
    icon: MdAccountTree,
    title: "Workflows",
    blurb:
      "Author multi-step automations from pluggable steps — branch, prompt, HTTP, and templates — and run them against your live data.",
  },
];

/**
 * The features band — a section heading over a responsive grid of feature
 * cards, each an icon + title + one-liner grounded in what equin actually
 * ships today.
 */
export function FeaturesSection() {
  return (
    <section>
      <Inset x="xl" y="2xl">
        <Stack gap="xl" className="mx-auto w-full max-w-5xl">
          <Stack gap="sm" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              Building blocks
            </Text>
            <Text as="h2" variant="heading" className="tracking-tight">
              {SECTION_TITLE}
            </Text>
            <Text as="p" variant="body" tone="muted" className="max-w-2xl">
              {SECTION_SUBTITLE}
            </Text>
          </Stack>
          <Grid minCellWidth="16rem" gap="lg">
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </Grid>
        </Stack>
      </Inset>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
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
            {feature.title}
          </Text>
          <Text as="p" variant="body" tone="muted">
            {feature.blurb}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}
