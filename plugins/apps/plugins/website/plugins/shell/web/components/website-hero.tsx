import type { ReactNode } from "react";
import { Placed } from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WebsiteBand } from "./website-band";
import "./website-hero.css";

/**
 * The wash's geometry, as the design measured it: a 1100×700 ellipse tile
 * centred on the page, its top 120px above the document's top edge. The
 * document's top edge is the site header's top — the header floats over the
 * page, 72px tall above this band, and is clear at rest so the wash shows
 * through it — so the tile starts 192px above the band.
 * Measurements, not ramp steps, which is what `<Placed>` is for. The width
 * caps at the pane's so a narrow viewport never scrolls sideways to reach it
 * (the blur beyond the box is ink, not scrollable overflow).
 */
const WASH_WIDTH = "min(68.75rem, 100%)";
const WASH_HEIGHT = "43.75rem";
const WASH_TOP = "-12rem";

export interface WebsiteHeroProps {
  /**
   * `home` is the homepage's title page (the tall hero rhythm); `page` is an
   * inner page's heading, which sits closer to the text it introduces.
   */
  kind: "home" | "page";
  /** The heading's plain run, before the accent. */
  lead: string;
  /** The heading's emphasised run, painted with the accent gradient. */
  accent: string;
  /** What closes the heading after the accent — the homepage's full stop. */
  trail?: string;
  /** The paragraph under the heading. */
  lede: ReactNode;
  /** Anything the heading introduces directly, below the lede (the homepage's three properties). */
  children?: ReactNode;
}

/**
 * The heading every page opens with: one sentence with its accent half painted
 * through a gradient, a lede under it, and the site's ambient glow behind both.
 *
 * Centred — the one place on the site that is. Everything below returns to the
 * left edge, which is what makes the heading read as a title rather than as the
 * house style. The headline and the lede each cap their own measure inside the
 * band's (900px and 720px), centred by the stack.
 *
 * The glow is part of the heading rather than of the page because the heading is
 * what it lights: every page has exactly one, so every page has the glow. It is
 * deliberately NOT clipped to the band: its tail softens the top of the band
 * below, and it sits under the text because the band is positioned after it.
 */
export function WebsiteHero({
  kind,
  lead,
  accent,
  trail,
  lede,
  children,
}: WebsiteHeroProps) {
  return (
    <div className="relative">
      <Placed
        x={{ center: "50%", size: WASH_WIDTH }}
        y={{ start: WASH_TOP, size: WASH_HEIGHT }}
        decorative
        className="website-hero-wash"
      />
      <WebsiteBand
        rhythm={kind === "home" ? "hero" : "page-hero"}
        className="relative text-center"
      >
        <Stack gap="2xl" align="center">
          <Text
            as="h1"
            variant="display"
            className="max-w-[56.25rem] tracking-tighter"
          >
            {lead}
            <span className="website-hero-accent">{accent}</span>
            {trail}
          </Text>
          <Text
            as="p"
            variant="subheading"
            tone="muted"
            className="max-w-[45rem] font-normal"
          >
            {lede}
          </Text>
          {children}
        </Stack>
      </WebsiteBand>
    </div>
  );
}
