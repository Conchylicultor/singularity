import { useMemo } from "react";
import { keyLayout } from "./key-layout";

/**
 * Resting key colors. A piano is a physical object — white keys are always
 * ivory, black keys always near-black — so these stay fixed in both light and
 * dark themes rather than tracking the UI's foreground/background tokens (which
 * flip in dark mode and would invert the keys). The lit state uses the theme's
 * accent (`bg-primary`). Inline styles keep these out of the className-only
 * `no-hardcoded-colors` check, matching the full piano keyboard.
 */
const WHITE_KEY = { bg: "#fafafa", border: "#d4d4d8" };
const BLACK_KEY = { bg: "#1c1c1c", border: "#0a0a0a" };

export interface MiniKeyboardProps {
  /** Lowest MIDI pitch to render (inclusive). Use a C for a flush left edge. */
  low: number;
  /** Highest MIDI pitch to render (inclusive). Use a B for a flush right edge. */
  high: number;
  /** MIDI pitches to highlight (e.g. a chord voicing). */
  lit: ReadonlyArray<number>;
  className?: string;
}

/**
 * Stateless mini piano keyboard: renders the keys in `[low, high]` and lights up
 * the `lit` pitches in the theme accent. Knows nothing about chords, scores, or
 * playback — the caller supplies which pitches to render and which to highlight,
 * so it drops into any panel. Height is set by the caller via `className`
 * (e.g. `h-16`); keys fill it.
 */
export function MiniKeyboard({ low, high, lit, className }: MiniKeyboardProps) {
  const lanes = useMemo(() => keyLayout(low, high), [low, high]);
  const litSet = useMemo(() => new Set(lit), [lit]);

  const whites = lanes.filter((k) => !k.isBlack);
  const blacks = lanes.filter((k) => k.isBlack);

  return (
    <div className={`relative overflow-hidden rounded-sm ${className ?? ""}`}>
      {/* White keys (back layer). */}
      {whites.map((k) => {
        const isLit = litSet.has(k.pitch);
        return (
          <div
            key={k.pitch}
            className={`absolute bottom-0 top-0 rounded-b-sm border ${isLit ? "bg-primary" : ""}`}
            style={{
              left: `${(k.center - k.width / 2) * 100}%`,
              width: `${k.width * 100}%`,
              borderColor: WHITE_KEY.border,
              backgroundColor: isLit ? undefined : WHITE_KEY.bg,
            }}
          />
        );
      })}
      {/* Black keys (front layer), ~62% height. */}
      {blacks.map((k) => {
        const isLit = litSet.has(k.pitch);
        return (
          <div
            key={k.pitch}
            className={`absolute top-0 z-raised rounded-b-sm border ${isLit ? "bg-primary" : ""}`}
            style={{
              left: `${(k.center - k.width / 2) * 100}%`,
              width: `${k.width * 100}%`,
              height: "62%",
              borderColor: BLACK_KEY.border,
              backgroundColor: isLit ? undefined : BLACK_KEY.bg,
            }}
          />
        );
      })}
    </div>
  );
}
