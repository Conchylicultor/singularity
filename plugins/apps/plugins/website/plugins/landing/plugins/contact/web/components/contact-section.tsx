import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  WebsiteArrow,
  WebsiteBand,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { SiGithub } from "react-icons/si";
import {
  CONTACT_MAILTO,
  ISSUES_URL,
} from "@plugins/apps/plugins/website/plugins/shell/core";

const OFFERS = [
  {
    heading: "Interested in supporting this vision?",
    body: "Investors, collaborators, and anyone who thinks software should evolve itself.",
    action: "Get in touch",
    href: CONTACT_MAILTO,
    external: false,
    emphasis: "filled" as const,
  },
  {
    heading: "Have feedback?",
    body: "Send your bug reports, feature requests and questions on GitHub.",
    action: "Open an issue",
    href: ISSUES_URL,
    external: true,
    emphasis: "outline" as const,
  },
];

/**
 * The page's closing band: two ways to reach the project, one per reader.
 *
 * Someone who wants to back this writes an email; someone using equin files
 * their bug, feature request or question on GitHub, where it can be tracked.
 * Two readers, two different destinations — never the same address twice. The
 * address itself, and the source on GitHub, sit in the site footer just below,
 * which every page wears.
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
          card missing. */}
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
                render={
                  <a
                    href={offer.href}
                    // GitHub opens beside the site; an email stays in place.
                    target={offer.external ? "_blank" : undefined}
                    rel={offer.external ? "noreferrer noopener" : undefined}
                  />
                }
              >
                {offer.external && <SiGithub />}
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
