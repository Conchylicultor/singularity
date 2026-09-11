import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  WebsiteArrow,
  WebsiteBand,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { CONTACT_MAILTO } from "@plugins/apps/plugins/website/plugins/shell/core";

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
 * The page's closing band: two reasons to write.
 *
 * Both cards lead to the same address on purpose. The split is not two inboxes,
 * it is two readers — someone who wants to back this, and someone who is stuck on
 * the same problem — and naming which one you are is what makes an email easy to
 * start writing. The address itself, and the source on GitHub, sit in the site
 * footer just below, which every page wears.
 *
 * The filled button is the site's INVERTED fill (the foreground colour with dark
 * type — `secondary` in the site's palette), the other an outline; the brand
 * accent stays for identity and hover.
 */
export function ContactSection() {
  return (
    <WebsiteBand divider rhythm="closing">
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
                variant={offer.emphasis === "filled" ? "secondary" : "outline"}
                className="font-semibold"
                render={<a href={CONTACT_MAILTO} />}
              >
                {offer.action}
                {offer.emphasis === "filled" && <WebsiteArrow />}
              </Button>
            </Stack>
          </Card>
        ))}
      </Grid>
    </WebsiteBand>
  );
}
