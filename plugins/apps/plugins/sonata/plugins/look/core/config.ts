import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";

/**
 * Every look the Sonata roll can be drawn in, in picker order — the lane, the
 * grid, the falling notes, and the keys below them, all from one switch.
 *
 *  - `digital` — the Synthesia-style stage: a dark lane, faint white rules, and
 *    flat opaque note bars. The default, and the only look before this existed.
 *  - `sketch`  — the whole roll as a drawing on paper: cream ground with a paper
 *    grain, graphite rules, notes inked by a wobbling pen, and hand-drawn keys.
 *
 * ONE switch drives all four surfaces on purpose. Paper under glossy ivory keys
 * is not a combination worth reaching — so it is unreachable, not merely
 * discouraged: the keyboard's own Flat/Realistic choice simply stops being read
 * under `sketch`.
 *
 * The id is `digital`, not `synthesia`: both existing key skins (Flat *and*
 * Realistic) live under this look, and "Flat (Synthesia)" already uses that word
 * one level down, for a different axis.
 *
 * This array is the single source: {@link SonataLook} is derived from it, so the
 * palette table, the picker's options and the {@link asSonataLook} narrowing
 * cannot list different looks.
 */
export const SONATA_LOOKS = [
  { value: "digital", label: "Digital" },
  { value: "sketch", label: "Sketch" },
] as const;

/**
 * A look. NOT a theme: the roll is deliberately theme-independent — it reads the
 * same in light and dark — and stays that way. The look only decides WHICH fixed
 * palette those surfaces are pinned to (see `styles.ts`).
 */
export type SonataLook = (typeof SONATA_LOOKS)[number]["value"];

export const sonataLookConfig = defineConfig({
  fields: {
    look: enumField({
      label: "Look",
      description: "How the whole roll is drawn — lane, grid, notes, and keys.",
      options: SONATA_LOOKS.map((l) => ({ value: l.value, label: l.label })),
      default: "digital",
    }),
  },
});

/**
 * Narrow a config read to {@link SonataLook}. `enumField` types as `string`
 * (its zod schema is what rejects an unknown value, at the config layer), so
 * every consumer funnels its read through this instead of casting.
 *
 * Throws on an unrecognised id rather than falling back to `digital`: the
 * descriptor's `z.enum` — built from this same list — has already refused
 * anything else, so a value arriving here that isn't a look is a defect to see,
 * not to paper over.
 */
export function asSonataLook(value: string): SonataLook {
  const look = SONATA_LOOKS.find((l) => l.value === value);
  if (!look) {
    throw new Error(
      `asSonataLook: unknown Sonata look "${value}" (expected one of ${SONATA_LOOKS.map((l) => l.value).join(", ")})`,
    );
  }
  return look.value;
}
