import { Placed } from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WebsiteBand } from "@plugins/apps/plugins/website/plugins/shell/web";
import "./hero-section.css";

const HEADLINE_LEAD = "A self-evolving operating system, ";
const HEADLINE_ACCENT = "shaped by agents";
const LEDE_LEAD =
  "Most teams use agents to build the same applications, only faster. ";
const LEDE_BRAND = "equin";
const LEDE_TAIL =
  " is a bet that this misses the bigger picture: a harness exploring the future of software engineering, and an agentic operating system in daily use.";

/**
 * The wash's geometry, as the design measured it: a 1100×700 ellipse tile
 * centred on the page, its top 120px above the document's top edge. The
 * document's top edge is the site header's bottom, and the header is 72px of
 * pane chrome above this band — so the tile starts 192px above the band.
 * Measurements, not ramp steps, which is what `<Placed>` is for. The width
 * caps at the pane's so a narrow viewport never scrolls sideways to reach it
 * (the blur beyond the box is ink, not scrollable overflow).
 */
const WASH_WIDTH = "min(68.75rem, 100%)";
const WASH_HEIGHT = "43.75rem";
const WASH_TOP = "-12rem";

/**
 * The homepage's opening statement, and everything above the fork: one sentence
 * saying what equin is, and one paragraph saying why that is worth a bet.
 *
 * Centred, and the only band on the site that is — a page whose whole job is one
 * sentence reads best with nothing beside it. Everything below returns to the
 * left edge, which is what makes the hero feel like a title page rather than the
 * house style. The headline and the lede each cap their own measure inside the
 * band's (900px and 700px), centred by the stack.
 *
 * The accent half of the headline is a gradient painted through the glyphs, over
 * a wash of the same two colours behind the band. Both live in
 * `hero-section.css` and both read theme tokens — see that file before pinning a
 * colour here. The wash is deliberately NOT clipped to the band: its tail softens
 * the top of the cards below, as the design intends, and it sits under the text
 * because the band's measure box is positioned after it.
 */
export function HeroSection() {
  return (
    <div className="relative">
      <Placed
        x={{ center: "50%", size: WASH_WIDTH }}
        y={{ start: WASH_TOP, size: WASH_HEIGHT }}
        decorative
        className="website-hero-wash"
      />
      <WebsiteBand rhythm="hero" className="relative text-center">
        <Stack gap="2xl" align="center">
          <Text
            as="h1"
            variant="display"
            className="max-w-[56.25rem] tracking-tighter"
          >
            {HEADLINE_LEAD}
            <span className="website-hero-accent">{HEADLINE_ACCENT}</span>.
          </Text>
          <Text
            as="p"
            variant="subheading"
            tone="muted"
            className="max-w-[43.75rem] font-normal"
          >
            {LEDE_LEAD}
            <Text className="text-foreground font-semibold">{LEDE_BRAND}</Text>
            {LEDE_TAIL}
          </Text>
        </Stack>
      </WebsiteBand>
    </div>
  );
}
