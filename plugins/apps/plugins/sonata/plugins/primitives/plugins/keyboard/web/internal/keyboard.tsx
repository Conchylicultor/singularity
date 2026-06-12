import { type ReactNode, useMemo } from "react";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { type KeyLane, keyLayout } from "./key-layout";

/**
 * Resting key colors. A piano is a physical object — white keys are always
 * ivory, black keys always near-black — so these stay fixed in both light and
 * dark themes rather than tracking the UI's foreground/background tokens (which
 * flip in dark mode and would invert the keys). The lit state uses the theme's
 * accent (`bg-primary`) or a caller-supplied color. Inline styles keep these out
 * of the className-only `no-hardcoded-colors` check.
 */
const WHITE_KEY = { bg: "#fafafa", border: "#d4d4d8" };
const BLACK_KEY = { bg: "#1c1c1c", border: "#0a0a0a" };

/**
 * Which keys are highlighted and how:
 *  - array form: each listed pitch lights in the theme accent (`bg-primary`).
 *  - map form: each pitch lights in its mapped CSS color (e.g. per-track
 *    colors); an empty-string value falls back to the accent.
 */
export type KeyHighlight = ReadonlyArray<number> | ReadonlyMap<number, string>;

export interface KeyboardProps {
  /** Lowest MIDI pitch to render (inclusive). Use a C for a flush left edge. */
  low: number;
  /** Highest MIDI pitch to render (inclusive). Use a B for a flush right edge. */
  high: number;
  /** Pitches to highlight (e.g. a chord voicing or the keys sounding now). */
  lit: KeyHighlight;
  /**
   * Optional content drawn inside each key, bottom-centered (e.g. a note
   * label). Receives the key and whether it is currently lit, so the caller
   * owns all content styling.
   */
  renderKey?: (key: KeyLane, lit: boolean) => ReactNode;
  className?: string;
}

/**
 * Stateless piano keyboard: the single source of truth for how a piano key is
 * laid out and drawn. Renders the keys in `[low, high]` and lights the `lit`
 * pitches; knows nothing about chords, scores, or playback — the caller supplies
 * the range, which pitches to light (and in what color), and any per-key
 * content. The full projection-driven `PianoKeyboard` and the chord readout both
 * compose this. Height is set by the caller via `className` (e.g. `h-16`); keys
 * fill it.
 */
export function Keyboard({ low, high, lit, renderKey, className }: KeyboardProps) {
  const lanes = useMemo(() => keyLayout(low, high), [low, high]);

  // Normalize both highlight forms to a pitch → color lookup. A present entry
  // with an empty string means "lit in the theme accent"; a non-empty value is
  // an explicit CSS color; an absent pitch is at rest.
  const litColors = useMemo<ReadonlyMap<number, string>>(() => {
    if ("get" in lit) return lit; // already a pitch → color map
    const m = new Map<number, string>();
    for (const pitch of lit) m.set(pitch, "");
    return m;
  }, [lit]);

  const whites = lanes.filter((k) => !k.isBlack);
  const blacks = lanes.filter((k) => k.isBlack);

  const renderLane = (k: KeyLane) => {
    const color = litColors.get(k.pitch); // undefined → rest, "" → accent, else color
    const isLit = color !== undefined;
    const palette = k.isBlack ? BLACK_KEY : WHITE_KEY;
    return (
      <div
        key={k.pitch}
        className={cn(
          "absolute flex items-end justify-center rounded-b-sm border",
          k.isBlack ? "top-0 z-raised" : "bottom-0 top-0",
          // Accent only when lit with no explicit color; an explicit color is
          // applied inline below.
          isLit && !color ? "bg-primary" : "",
        )}
        style={{
          left: `${(k.center - k.width / 2) * 100}%`,
          width: `${k.width * 100}%`,
          ...(k.isBlack ? { height: "62%" } : null),
          borderColor: palette.border,
          backgroundColor: isLit ? color || undefined : palette.bg,
        }}
      >
        {renderKey?.(k, isLit)}
      </div>
    );
  };

  return (
    <div className={cn("relative overflow-hidden rounded-sm", className)}>
      {/* White keys (back layer). */}
      {whites.map(renderLane)}
      {/* Black keys (front layer), ~62% height. */}
      {blacks.map(renderLane)}
    </div>
  );
}
