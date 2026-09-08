import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
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
 * The homepage's opening statement, and everything above the fork: one sentence
 * saying what equin is, and one paragraph saying why that is worth a bet.
 *
 * Centred, and the only band on the site that is — a page whose whole job is one
 * sentence reads best with nothing beside it. Everything below returns to the
 * left edge, which is what makes the hero feel like a title page rather than the
 * house style.
 *
 * The accent half of the headline is a gradient painted through the glyphs, over
 * a wash of the same two colours behind the band. Both live in
 * `hero-section.css` and both read theme tokens — see that file before pinning a
 * colour here.
 */
export function HeroSection() {
  return (
    <Clip className="relative">
      <Layer decorative className="website-hero-wash" />
      <WebsiteBand y="2xl" className="max-w-3xl text-center">
        {/* A second block step on top of the band's own. The spacing ramp tops
            out at 2xl (2rem) because it is sized for app chrome, and a title page
            wants roughly double that above and below its one sentence — so the
            hero stacks two ramp steps rather than reaching outside the ramp. */}
        <Inset y="2xl">
          <Stack gap="lg">
            <Text as="h1" variant="display">
              {HEADLINE_LEAD}
              <span className="website-hero-accent">{HEADLINE_ACCENT}</span>.
            </Text>
            <Text
              as="p"
              variant="subheading"
              tone="muted"
              className="font-normal"
            >
              {LEDE_LEAD}
              <Text className="text-foreground font-semibold">
                {LEDE_BRAND}
              </Text>
              {LEDE_TAIL}
            </Text>
          </Stack>
        </Inset>
      </WebsiteBand>
    </Clip>
  );
}
