import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { chordLabel } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import { ChordNumeral as Numeral } from "@plugins/music/plugins/chord-box/web";

/**
 * A chord token's Roman numeral, drawn by the shared chord box's numeral: the
 * degree at full size, its quality mark and inversion figure small and raised.
 * Its size and colour come from where it sits: a box, a chord button, a chip,
 * the Chords section's chips.
 */
export function ChordNumeral({
  token,
  className,
}: {
  token: ChordToken;
  className?: string;
}) {
  const { numeral, suffix, figure } = chordLabel(token);
  return (
    <Numeral numeral={numeral} mark={suffix + figure} className={className} />
  );
}
