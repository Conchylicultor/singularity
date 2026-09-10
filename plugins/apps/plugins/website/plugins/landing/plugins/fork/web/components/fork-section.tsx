import {
  useOpenPane,
  type PaneObject,
} from "@plugins/primitives/plugins/pane/web";
import { appsPane } from "@plugins/apps/plugins/website/plugins/questions/plugins/apps/web";
import { harnessPane } from "@plugins/apps/plugins/website/plugins/questions/plugins/harness/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WebsiteBand } from "@plugins/apps/plugins/website/plugins/shell/web";
import "./fork-section.css";

interface Fork {
  /** Who this column is addressed to — the reader picks a column by picking themselves. */
  audience: string;
  /**
   * The audience dot's colour, as a background AND a text colour: the halo
   * behind it is painted from `currentColor` (see `fork-section.css`).
   */
  dotClass: string;
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
    audience: "For users",
    dotClass: "bg-primary text-primary",
    heading: "What will apps evolve into?",
    body: "Most people are using agents to rebuild the software we already had, faster. That's the smallest thing they're good for. An application can now change shape while you use it — one app that composes itself around one person, instead of a hundred apps built for the average of everyone.",
    pane: appsPane,
  },
  {
    audience: "For developers",
    dotClass: "bg-chart-1 text-chart-1",
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
 * Each column is addressed to a reader rather than titled: the eyebrow names who
 * it is for, so choosing a branch is choosing which of the two you are, and the
 * question underneath is what that reader gets an answer to.
 *
 * The two headings are lopsided on purpose (five words against twelve), and the
 * layout treats that as a fact rather than something to pad the copy around.
 * Both columns are the same box — a `Grid` cell stretches to the tallest of the
 * row — and each reads top-down: eyebrow, question, paragraph, then whatever air
 * is left. The shorter column ends early and leaves its card's lower part empty,
 * which is the design's own choice: the cards match as panels, and the text
 * inside them is simply two paragraphs of different length. Do not pad either
 * heading to balance them, and do not push the paragraphs to a shared baseline.
 */
export function ForkSection() {
  return (
    <WebsiteBand rhythm="continuation">
      <Grid minCellWidth="22rem" mode="fit" gap="lg">
        {FORKS.map((fork) => (
          <ForkColumn key={fork.heading} fork={fork} />
        ))}
      </Grid>
    </WebsiteBand>
  );
}

function ForkColumn({ fork }: { fork: Fork }) {
  const openPane = useOpenPane();
  return (
    <Card
      as="button"
      interactive
      // The card is a flat panel — the site's cards carry no elevation shadow.
      // (That it is a `<button>` changes nothing about the box: Surface owns the
      // display, so the column packs to the top and reads left like prose.)
      className="h-full rounded-2xl shadow-none"
      onClick={() => openPane(fork.pane, {}, { mode: "root" })}
    >
      <Stack gap="xl">
        <Inline gap="sm">
          <StatusDot
            colorClass={fork.dotClass}
            className="website-audience-dot"
          />
          {/* The eyebrow sits in the tertiary grey — a step below the muted
              paragraph text, so the label defers to the question it introduces.
              The palette has one muted tier; the step down is the same token at
              60% over the card. */}
          <Text
            variant="eyebrow"
            tone="muted"
            className="text-muted-foreground/60 font-semibold tracking-widest"
          >
            {fork.audience}
          </Text>
        </Inline>
        <Stack gap="md">
          <Text as="h2" variant="title" className="tracking-tight">
            {fork.heading}
          </Text>
          <Text as="p" variant="body" tone="muted">
            {fork.body}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}
