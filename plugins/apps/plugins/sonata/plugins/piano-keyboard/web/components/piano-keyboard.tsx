import type { Projection } from "@plugins/apps/plugins/sonata/plugins/score/core";

/** White pitch-class → letter (black keys are unlabeled). */
const WHITE_LETTER: Record<number, string> = {
  0: "C",
  2: "D",
  4: "E",
  5: "F",
  7: "G",
  9: "A",
  11: "B",
};

/** Scientific octave: MIDI 60 = C4. */
function octaveOf(pitch: number): number {
  return Math.floor(pitch / 12) - 1;
}

/**
 * Full 88-key piano keyboard, rendered in the roll's pitch-axis gutter. Draws
 * every key from `projection.keys` (the single layout the falling notes also
 * use), so each note column lands exactly on its key. White keys tile the full
 * height with letter labels (octave number on each C); black keys sit on top,
 * shorter and darker.
 */
export function PianoKeyboard({ projection }: { projection: Projection }) {
  const keys = projection.keys;
  if (!keys) return null; // defensive: host only mounts us with pitch-plane.

  const whites = keys.filter((k) => !k.isBlack);
  const blacks = keys.filter((k) => k.isBlack);

  return (
    <div className="absolute inset-0 overflow-hidden bg-muted/30">
      {/* White keys (back layer). */}
      {whites.map((k) => {
        const pc = ((k.pitch % 12) + 12) % 12;
        const letter = WHITE_LETTER[pc] ?? "";
        return (
          <div
            key={k.pitch}
            className="absolute bottom-0 top-0 flex items-end justify-center rounded-b-sm border border-border bg-background pb-1"
            style={{ left: k.center - k.width / 2, width: k.width }}
          >
            <span className="select-none text-[9px] leading-none text-muted-foreground/70">
              {pc === 0 ? `${letter}${octaveOf(k.pitch)}` : letter}
            </span>
          </div>
        );
      })}
      {/* Black keys (front layer), ~62% height. */}
      {blacks.map((k) => (
        <div
          key={k.pitch}
          className="absolute top-0 z-10 rounded-b-sm border border-border bg-foreground"
          style={{
            left: k.center - k.width / 2,
            width: k.width,
            height: "62%",
          }}
        />
      ))}
    </div>
  );
}
