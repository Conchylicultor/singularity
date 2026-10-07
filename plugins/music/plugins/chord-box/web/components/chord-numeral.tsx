import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import "../chord-box.css";

/**
 * A chord's Roman numeral in the display serif: the degree (`numeral`) at full
 * size, its quality mark and inversion figure (`mark`) small and raised, in
 * the sans. Its size and colour come from where it sits — a chord box, a
 * button, a chip.
 */
export function ChordNumeral({
  numeral,
  mark,
  className,
}: {
  /** The degree in Roman numerals, cased by quality: `I`, `ii`, `♭VII`. */
  numeral: string;
  /** The quality mark and inversion figure set beside it (`°`, `7`, `⁶₄`); `""` for none. */
  mark: string;
  className?: string;
}) {
  return (
    <span className={cn("chord-num", className)}>
      {numeral}
      {mark !== "" && <span className="chord-num-mark">{mark}</span>}
    </span>
  );
}
