import { useState, type FormEvent } from "react";
import {
  useOpenPane,
  type PaneObject,
} from "@plugins/primitives/plugins/pane/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Button,
  Input,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { WebsiteBand } from "@plugins/apps/plugins/website/plugins/shell/web";
import { downloadPane } from "@plugins/apps/plugins/website/plugins/pages/plugins/download/web";
import { visionPane } from "@plugins/apps/plugins/website/plugins/pages/plugins/vision/web";
import { foundationsPane } from "@plugins/apps/plugins/website/plugins/pages/plugins/foundations/web";

/**
 * "Missing an app?" — the gallery's answer to an app it does not have: install
 * equin, then describe it, and an agent composes it. The field is there so the
 * reader can start describing; Build it goes to the download page, because the
 * building happens in equin, not on the site.
 */
export function AppsCompose() {
  const openPane = useOpenPane();
  const [idea, setIdea] = useState("");
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    openPane(downloadPane, {}, { mode: "root" });
  };
  return (
    <WebsiteBand rhythm="page">
      <Card className="border-foreground/20 rounded-2xl border-dashed bg-transparent shadow-none">
        <Grid minCellWidth="18rem" mode="fit" gap="xl" align="center">
          <Stack gap="2xs">
            <Text as="h3" variant="heading" className="tracking-tight">
              Missing an app?
            </Text>
            <Text as="p" variant="body" tone="muted">
              Install equin, then describe it: an agent composes it from
              existing plugins and builds what is missing.
            </Text>
          </Stack>
          <Stack as="form" direction="row" gap="xs" onSubmit={onSubmit}>
            <Fill>
              <Input
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="A habit tracker that reads my calendar…"
                aria-label="Describe the app"
              />
            </Fill>
            <Button type="submit" variant="secondary" className="font-semibold">
              Build it
            </Button>
          </Stack>
        </Grid>
      </Card>
    </WebsiteBand>
  );
}

interface NextPage {
  /** The reader's own question. */
  question: string;
  /** The page that answers it, named on the card's link line. */
  answer: string;
  pane: PaneObject;
}

const NEXT: NextPage[] = [
  { question: "Where is this going?", answer: "The vision", pane: visionPane },
  {
    question: "How is this different from other agentic builders?",
    answer: "The foundations",
    pane: foundationsPane,
  },
];

/**
 * The page's end: the two questions a reader who got through the gallery is
 * likely to have — where the apps are going, and what sets them apart — each
 * as a card that opens the page answering it.
 */
export function AppsReadNext() {
  const openPane = useOpenPane();
  return (
    <WebsiteBand rhythm="closing">
      <Grid
        as="nav"
        aria-label="Read next"
        minCellWidth="18rem"
        mode="fit"
        gap="lg"
      >
        {NEXT.map((next) => (
          <Card
            key={next.answer}
            as="button"
            interactive
            className="website-app-next hover:bg-card rounded-2xl text-left shadow-none"
            onClick={() => openPane(next.pane, {}, { mode: "root" })}
          >
            <Stack gap="md" align="start">
              <Text as="span" variant="heading" className="tracking-tight">
                {next.question}
              </Text>
              <Text
                as="span"
                variant="body"
                className="website-app-next-go font-semibold"
              >
                {next.answer} →
              </Text>
            </Stack>
          </Card>
        ))}
      </Grid>
    </WebsiteBand>
  );
}
