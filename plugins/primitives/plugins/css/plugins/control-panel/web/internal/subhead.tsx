import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type React from "react";

export interface ControlPanelSubheadProps {
  /** The run's name — "Common", "Build", "Deploy". */
  children: React.ReactNode;
  className?: string;
}

/**
 * THE LABEL THAT NAMES A RUN OF ROWS INSIDE ONE BAND — "Common", "Build",
 * "Deploy" over the fields each of them contributed. The author places it before
 * the run; it is a bare line, not a container, so it composes into a `cp-band`
 * (block flow) and into a `Stack` (flex) unchanged, and the surface keeps owning
 * the spacing between its own rows.
 *
 * It is deliberately NOT a `Section`: a section carries `cp-band`, and that band
 * hairline would be ruled BETWEEN a heading and the rows it names — the inverse
 * of what a heading is for. Same reason `RuleList`, `Empty` and `Block` are not
 * bands.
 *
 * It is NOT an eyebrow either. A second small-caps line directly under a
 * `Section`'s reads as a peer band rather than as something inside it, so this
 * takes the vocabulary's third rung for in-band non-row text — the one
 * `SettingNote`, `SettingDescription`, a `Section`'s `description` and `Empty`
 * already share — rather than minting a fourth.
 *
 * And it is NOT a field label: that rung names ONE control and is drawn in a
 * row's label cell, on the TEXT rail. This names a RUN, which is the eyebrow's
 * side of invariant #1's split — so it carries no rail class at all and lands on
 * whatever region hosts it by doing nothing, beside the eyebrow above it and an
 * icon column back from the labels below. Gated by the `subhead-rail` fixture
 * rather than by this paragraph.
 *
 * The block padding is asymmetric on purpose: more above separates the run from
 * the previous run's last row, less below binds the heading to the rows it
 * names. Both are ramp tokens, so the member tightens under Compact along with
 * everything else.
 */
export function ControlPanelSubhead({
  children,
  className,
}: ControlPanelSubheadProps) {
  return (
    <Text
      as="div"
      variant="caption"
      tone="muted"
      className={cn("pt-xs pb-2xs", className)}
    >
      {children}
    </Text>
  );
}
