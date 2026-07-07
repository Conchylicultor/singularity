import type { IconType } from "react-icons";
import {
  MdDescription,
  MdMail,
  MdMusicNote,
  MdAccountTree,
} from "react-icons/md";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const SECTION_TITLE = "The apps equin ships today";
const SECTION_SUBTITLE =
  "Not templates or mockups — full apps, each composed from the same plugin building blocks the rest of the workspace uses.";

interface AppEntry {
  icon: IconType;
  title: string;
  blurb: string;
}

const APPS: AppEntry[] = [
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
    icon: MdMusicNote,
    title: "Sonata",
    blurb:
      "An extensible piano and music studio: falling-note piano roll, notation, and real sampled instruments — proof the platform reaches far beyond productivity tools.",
  },
  {
    icon: MdAccountTree,
    title: "Workflows",
    blurb:
      "Author multi-step automations from pluggable steps — branch, prompt, HTTP, and templates — and run them against your live data.",
  },
];

/**
 * The app showcase band — a section heading over a responsive grid of app
 * cards, one per real app equin ships.
 */
export function AppsShowcase() {
  return (
    <section>
      <Inset x="xl" y="2xl">
        <Stack gap="xl" className="mx-auto w-full max-w-5xl">
          <Stack gap="sm" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              Included
            </Text>
            <Text as="h2" variant="heading" className="tracking-tight">
              {SECTION_TITLE}
            </Text>
            <Text as="p" variant="body" tone="muted" className="max-w-2xl">
              {SECTION_SUBTITLE}
            </Text>
          </Stack>
          {/* 14rem cells so all four apps sit on one row at desktop width. */}
          <Grid minCellWidth="14rem" gap="lg">
            {APPS.map((app) => (
              <AppCard key={app.title} app={app} />
            ))}
          </Grid>
        </Stack>
      </Inset>
    </section>
  );
}

function AppCard({ app }: { app: AppEntry }) {
  const Icon = app.icon;
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
            {app.title}
          </Text>
          <Text as="p" variant="body" tone="muted">
            {app.blurb}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}
