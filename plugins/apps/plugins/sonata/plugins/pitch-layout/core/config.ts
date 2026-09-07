import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import type { PitchLayoutId } from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Every keyboard layout the pitch axis can be laid in, in picker order.
 *
 *  - `piano` — the 88-key piano: naturals tile the width edge-to-edge and the
 *              accidentals ride the boundaries between them, narrower and
 *              shorter. The default, and what Sonata has always drawn.
 *  - `janko` — the Jankó (isomorphic) keyboard: uniform pads in four rows, each
 *              semitone offset half a pad, so a chord shape is the same shape in
 *              every key. Fits a piano roll because its x position stays LINEAR
 *              in pitch (hex layouts like Wicki-Hayden do not, and are out).
 *
 * A `Record<PitchLayoutId, string>` and not an array: {@link PitchLayoutId} is
 * the closed set, declared once in `score/core` where every consumer already
 * reads it. A layout added there is a tsc error here until it is labelled — and
 * again in `geometry.ts` until it has geometry, and again in the keyboard
 * primitive's chrome table until it can be painted.
 */
export const PITCH_LAYOUT_LABELS: Record<PitchLayoutId, string> = {
  piano: "Piano",
  janko: "Jankó (isomorphic)",
};

/**
 * The layout a fresh install renders in, spelled once. It is the config's
 * default AND the fallback anything holding a layout before its first config
 * read must use, so the two cannot drift.
 */
export const PITCH_LAYOUT_DEFAULT: PitchLayoutId = "piano";

export const pitchLayoutConfig = defineConfig({
  fields: {
    layout: enumField({
      label: "Keyboard layout",
      description:
        "How pitch is laid across the roll — the falling notes, the grid, the keys below them, and the chord readouts.",
      options: (Object.keys(PITCH_LAYOUT_LABELS) as PitchLayoutId[]).map(
        (value) => ({ value, label: PITCH_LAYOUT_LABELS[value] }),
      ),
      default: PITCH_LAYOUT_DEFAULT,
    }),
  },
});

/**
 * Narrow a config read to {@link PitchLayoutId}. `enumField` types as `string`
 * (its zod schema is what rejects an unknown value, at the config layer), so
 * every consumer funnels its read through this instead of casting.
 *
 * Throws on an unrecognised id rather than falling back to the default: the
 * descriptor's `z.enum` — built from this same table — has already refused
 * anything else, so a value arriving here that isn't a layout is a defect to
 * see, not to paper over.
 */
export function asPitchLayoutId(value: string): PitchLayoutId {
  if (!Object.hasOwn(PITCH_LAYOUT_LABELS, value)) {
    throw new Error(
      `asPitchLayoutId: unknown pitch layout "${value}" (expected one of ${Object.keys(
        PITCH_LAYOUT_LABELS,
      ).join(", ")})`,
    );
  }
  return value as PitchLayoutId;
}
