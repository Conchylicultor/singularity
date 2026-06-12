import { useMemo } from "react";
import {
  accidentalGlyph,
  effectiveKeyAt,
  makeKeySpeller,
  type KeyLane,
  type KeySpeller,
  type Projection,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Keyboard } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import {
  useCursorBeat,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  useHiddenTrackIds,
  useMutedTrackIds,
  useTrackColorMap,
} from "@plugins/apps/plugins/sonata/plugins/track-mixer/web";
import { useConfig } from "@plugins/config_v2/web";
import { pianoKeyboardConfig } from "../../shared/config";

type LabelScope = "diatonic" | "whites-plus-in-key" | "all";

/**
 * Resting label text colors. The key chrome (ivory / near-black caps) is owned
 * by the shared keyboard primitive; only the per-key label color lives here. A
 * piano is a physical object, so these stay fixed across light/dark themes;
 * inline styles keep them out of the className-only `no-hardcoded-colors` check.
 */
const LABEL_COLOR = { white: "#52525b", black: "#d4d4d4" };

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
 * use) through the shared keyboard primitive, so each note column lands exactly
 * on its key. Key labels follow the score's key signature (`score.meta.key`) —
 * configurable via the plugin's `labelScope` — and keys sounding at the playback
 * cursor light up in their per-track color, connecting the falling notes to the
 * keys they land on.
 */
export function PianoKeyboard({ projection }: { projection: Projection }) {
  const keys = projection.keys;
  const { score } = useSonata();
  // Which pitches are sounding changes every frame, so the keyboard re-renders
  // per frame during playback (a linear scan over notes, trivial at this scale).
  const cursorBeat = useCursorBeat();
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
  // notes and the audio. The first eligible note per pitch picks the tint. This
  // is exactly the keyboard primitive's map-form `lit`: pitch → CSS color ("" →
  // theme accent). Recomputed each frame while playing (cursorBeat advances); a
  // linear scan over notes is trivial at keyboard scale.
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

  if (!keys?.length) return null; // defensive: host only mounts us with pitch-plane.

  const scope = labelScope as LabelScope;
  const low = keys[0]!.pitch;
  const high = keys[keys.length - 1]!.pitch;

  return (
    <Keyboard
      low={low}
      high={high}
      lit={sounding}
      className="absolute inset-0 rounded-none bg-muted/30"
      renderKey={(k, lit) => {
        const text = keyLabel(k, speller, scope);
        if (!text) return null;
        return (
          <span
            // eslint-disable-next-line text/no-adhoc-typography, type-scale-tokens/no-arbitrary-font-size -- 9px/7px labels tuned to fit a narrow key cap; below the 10px token floor, tight leading centers them on the key
            className={`select-none leading-none ${k.isBlack ? "mb-0.5 text-[7px]" : "mb-1 text-[9px]"} ${lit ? "text-primary-foreground" : ""}`}
            style={
              lit
                ? undefined
                : { color: k.isBlack ? LABEL_COLOR.black : LABEL_COLOR.white }
            }
          >
            {text}
          </span>
        );
      }}
    />
  );
}
