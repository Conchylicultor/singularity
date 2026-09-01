import {
  useOpenPane,
  type PaneObject,
} from "@plugins/primitives/plugins/pane/web";
import { appsPane } from "@plugins/apps/plugins/website/plugins/questions/plugins/apps/web";
import { harnessPane } from "@plugins/apps/plugins/website/plugins/questions/plugins/harness/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

interface Fork {
  eyebrow: string;
  heading: string;
  body: string;
  pane: PaneObject;
}

/**
 * Two questions, by definition — the site's whole information architecture, not
 * an extensible collection. Plain data, not a slot.
 */
const FORKS: Fork[] = [
  {
    eyebrow: "The applications",
    heading: "What will apps evolve into?",
    body: "Most people are using agents to rebuild the software we already had, faster. That's the smallest thing they're good for. An application can now change shape while you use it — one app that composes itself around one person, instead of a hundred apps built for the average of everyone.",
    pane: appsPane,
  },
  {
    eyebrow: "The engineering",
    heading:
      "What does software engineering look like when no human reviews the code?",
    body: "500,000 lines, most of them written by agents and read by nobody. It holds together because the mistakes are unwritable, not because someone checked them. That's the harness.",
    pane: harnessPane,
  },
];

/**
 * The fork — the homepage's only interactive element. Two columns, each one
 * click target opening its question's page, side by side on a wide viewport and
 * stacked on a narrow one (`Grid` wraps at `minCellWidth`).
 *
 * The two headings are lopsided on purpose (five words against twelve), and the
 * layout treats that as a fact rather than something to pad the copy around.
 * Both columns are the same box: a `Grid` cell stretches to the tallest of the
 * row, so the eyebrows and the headings start on one shared line at the top,
 * and the empty `<Fill>` pushes each paragraph down to a shared line at the
 * bottom. All the difference between a five-word heading and a twelve-word one
 * therefore collects in the middle, as air — which reads as composition, where
 * a ragged bottom edge would read as a rendering accident. Do not pad either
 * heading to balance them.
 */
export function ForkSection() {
  return (
    <section>
      <Inset x="xl" y="2xl">
        <Grid
          minCellWidth="22rem"
          gap="lg"
          className="mx-auto w-full max-w-5xl"
        >
          {FORKS.map((fork) => (
            <ForkColumn key={fork.heading} fork={fork} />
          ))}
        </Grid>
      </Inset>
    </section>
  );
}

function ForkColumn({ fork }: { fork: Fork }) {
  const openPane = useOpenPane();
  return (
    <Card
      as="button"
      interactive
      // A `<button>` centers its own text; the column is a paragraph of prose.
      className="h-full text-left"
      onClick={() => openPane(fork.pane, {}, { mode: "root" })}
    >
      <Stack gap="md" className="h-full">
        <Text variant="eyebrow" tone="muted">
          {fork.eyebrow}
        </Text>
        <Text as="h2" variant="heading" className="tracking-tight">
          {fork.heading}
        </Text>
        {/* The slack between the two shared baselines. */}
        <Fill axis="y" />
        <Text as="p" variant="body" tone="muted">
          {fork.body}
        </Text>
      </Stack>
    </Card>
  );
}
