import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import {
  Stack,
  insetClass,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WebsiteBand } from "@plugins/apps/plugins/website/plugins/shell/web";
import { MdArrowForward } from "react-icons/md";
import { SiGithub } from "react-icons/si";
import { SOURCE_URL } from "@plugins/apps/plugins/website/plugins/shell/core";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "../internal/contact";

const OFFERS = [
  {
    heading: "Interested in supporting this vision?",
    body: "Investors, collaborators, and anyone who thinks software should evolve itself.",
    action: "Get in touch",
    emphasis: "filled" as const,
  },
  {
    heading: "Asking for help?",
    body: "Building an agentic harness, or lost in a large codebase? Every email gets read.",
    action: "Send an email",
    emphasis: "outline" as const,
  },
];

/**
 * The page's closing band: two reasons to write, and the two places the site can
 * be reached at.
 *
 * Both cards lead to the same address on purpose. The split is not two inboxes,
 * it is two readers — someone who wants to back this, and someone who is stuck on
 * the same problem — and naming which one you are is what makes an email easy to
 * start writing.
 *
 * The filled button is the site's INVERTED fill (the foreground colour with dark
 * type — `secondary` in the site's palette), the other an outline; the brand
 * accent stays for identity and hover.
 */
export function ContactSection() {
  return (
    <WebsiteBand divider rhythm="closing">
      <Stack gap="2xl">
        {/* `fit` collapses the empty trailing track: at the site's measure a 20rem
            minimum packs three, and two cards in a three-track row read as one
            card missing. Same minimum as the fork above, so the two card rows on
            the page break at the same width. */}
        <Grid minCellWidth="22rem" mode="fit" gap="lg">
          {OFFERS.map((offer) => (
            <Card key={offer.heading} className="rounded-2xl shadow-none">
              <Stack gap="xl" align="start">
                <Stack gap="sm">
                  <Text as="h2" variant="heading" className="tracking-tight">
                    {offer.heading}
                  </Text>
                  <Text as="p" variant="body" tone="muted">
                    {offer.body}
                  </Text>
                </Stack>
                <Button
                  variant={
                    offer.emphasis === "filled" ? "secondary" : "outline"
                  }
                  className="font-semibold"
                  render={<a href={CONTACT_MAILTO} />}
                >
                  {offer.action}
                  {offer.emphasis === "filled" && <MdArrowForward />}
                </Button>
              </Stack>
            </Card>
          ))}
        </Grid>
        <Inline gap="sm" wrap>
          {/* The anchor must ITSELF be the padded box (a wrapper would make the
              ring bigger than the click target), and `Inset` names no `href` —
              so this is the class-helper half of the own-it/don't rule. */}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Source on GitHub"
            className={cn(
              insetClass({ pad: "sm" }),
              "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground rounded-full border",
            )}
          >
            <SiGithub className="size-4.5" />
          </a>
          {/* The address sits in the tertiary grey — the muted token, stepped
              down to 60% over the page — like the footer's signature. */}
          <Text
            variant="caption"
            tone="muted"
            className="text-muted-foreground/60"
          >
            {CONTACT_EMAIL}
          </Text>
        </Inline>
      </Stack>
    </WebsiteBand>
  );
}
