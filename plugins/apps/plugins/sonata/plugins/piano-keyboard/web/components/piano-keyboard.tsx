import { useMemo } from "react";
import {
  accidentalGlyph,
  effectiveKeyAt,
  makeKeySpeller,
  type KeyLane,
  type KeySpeller,
  type Projection,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  useHiddenTrackIds,
  useMutedTrackIds,
  useTrackColorMap,
} from "@plugins/apps/plugins/sonata/plugins/track-mixer/web";
import { useConfig } from "@plugins/config_v2/web";
import { pianoKeyboardConfig } from "../../shared/config";

type LabelScope = "diatonic" | "whites-plus-in-key" | "all";

/** White pitch-class → natural letter (for keys outside the key signature). */
const NATURAL_LETTER: Record<number, string> = {
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
 * The label for one key under the active scope, spelled for the key signature.
 * Returns null when this key should stay blank. The octave number is appended
 * only on a natural C, matching the prior keyboard's orientation markers.
 */
function keyLabel(
  k: KeyLane,
  speller: KeySpeller,
  scope: LabelScope,
): string | null {
  const render = (s: { step: string; alter: number }): string => {
    const base = `${s.step}${accidentalGlyph(s.alter)}`;
    return s.step === "C" && s.alter === 0 ? `${base}${octaveOf(k.pitch)}` : base;
  };

  const dia = speller.diatonic(k.pitch);
  if (scope === "diatonic") return dia ? render(dia) : null;
  if (scope === "whites-plus-in-key") {
    if (k.isBlack) return dia ? render(dia) : null;
    const pc = ((k.pitch % 12) + 12) % 12;
    return render(dia ?? { step: NATURAL_LETTER[pc] ?? "", alter: 0 });
  }
  return render(speller.spell(k.pitch)); // "all"
}

/**
 * Full 88-key piano keyboard, rendered in the roll's pitch-axis gutter. Draws
 * every key from `projection.keys` (the single layout the falling notes also
 * use), so each note column lands exactly on its key. Key labels follow the
 * score's key signature (`score.meta.key`) — configurable via the plugin's
 * `labelScope` — and keys sounding at the playback cursor light up in the
 * accent color, connecting the falling notes to the keys they land on.
 */
export function PianoKeyboard({ projection }: { projection: Projection }) {
  const keys = projection.keys;
  const { score, cursorBeat } = useSonata();
  const { labelScope } = useConfig(pianoKeyboardConfig);

  const speller = useMemo(() => makeKeySpeller(effectiveKeyAt(score, 0)), [score]);

  // Per-track view-state, shared with the falling notes (color + hidden) and the
  // audio engine (muted). Memo-stable across frames, so folding it into the
  // per-frame `sounding` recompute below is free.
  const colorMap = useTrackColorMap();
  const hiddenIds = useHiddenTrackIds();
  const mutedIds = useMutedTrackIds();

  // Pitches sounding at the cursor → the color to light each with. A key lights
  // only for notes on a track that is neither hidden (gone from the roll) nor
  // muted (silent), so the keyboard tracks the same view-state as the falling
  // notes and the audio. The first eligible note per pitch picks the tint.
  // Recomputed each frame while playing (cursorBeat advances); a linear scan
  // over notes is trivial at keyboard scale.
  const sounding = useMemo(() => {
    const m = new Map<number, string>();
    for (const n of score.notes) {
      if (hiddenIds.has(n.track) || mutedIds.has(n.track)) continue;
      if (
        n.start <= cursorBeat &&
        cursorBeat < n.start + n.duration &&
        !m.has(n.pitch)
      ) {
        m.set(n.pitch, colorMap.get(n.track) ?? "");
      }
    }
    return m;
  }, [score.notes, cursorBeat, colorMap, hiddenIds, mutedIds]);

  if (!keys) return null; // defensive: host only mounts us with pitch-plane.

  const scope = labelScope as LabelScope;
  const whites = keys.filter((k) => !k.isBlack);
  const blacks = keys.filter((k) => k.isBlack);

  return (
    <div className="absolute inset-0 overflow-hidden bg-muted/30">
      {/* White keys (back layer). */}
      {whites.map((k) => {
        const color = sounding.get(k.pitch); // undefined → not lit
        const lit = color !== undefined;
        return (
          <div
            key={k.pitch}
            className={`absolute bottom-0 top-0 flex items-end justify-center rounded-b-sm border border-border pb-1 ${
              lit ? "bg-primary" : "bg-background"
            }`}
            style={{
              left: k.center - k.width / 2,
              width: k.width,
              ...(color ? { backgroundColor: color } : null),
            }}
          >
            <span
              className={`select-none text-[9px] leading-none ${
                lit ? "text-primary-foreground" : "text-muted-foreground/70"
              }`}
            >
              {keyLabel(k, speller, scope)}
            </span>
          </div>
        );
      })}
      {/* Black keys (front layer), ~62% height. */}
      {blacks.map((k) => {
        const color = sounding.get(k.pitch); // undefined → not lit
        const lit = color !== undefined;
        return (
          <div
            key={k.pitch}
            className={`absolute top-0 z-10 flex items-end justify-center rounded-b-sm border border-border pb-0.5 ${
              lit ? "bg-primary" : "bg-foreground"
            }`}
            style={{
              left: k.center - k.width / 2,
              width: k.width,
              height: "62%",
              ...(color ? { backgroundColor: color } : null),
            }}
          >
            <span
              className={`select-none text-[7px] leading-none ${
                lit ? "text-primary-foreground" : "text-background/80"
              }`}
            >
              {keyLabel(k, speller, scope)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
