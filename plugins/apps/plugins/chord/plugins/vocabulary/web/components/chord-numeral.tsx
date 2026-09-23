import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { chordLabel } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import "../chord-paint.css";

/**
 * A chord's Roman numeral in the display serif (Bodoni Moda): the degree at
 * full size, its quality mark and inversion figure small and raised, in the
 * sans. Its size and colour come from where it sits: a box, a chord button, a
 * chip, the Path card's chips and map rows.
 */
export function ChordNumeral({
  token,
  className,
}: {
  token: ChordToken;
  className?: string;
}) {
  const { numeral, suffix, figure } = chordLabel(token);
  const mark = suffix + figure;
  return (
    <span className={cn("chord-num", className)}>
      {numeral}
      {mark !== "" && <span className="chord-num-mark">{mark}</span>}
    </span>
  );
}
