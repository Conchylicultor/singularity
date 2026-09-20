// ── How much a chord shows of itself ─────────────────────────────────────────
//
// `off` ⊂ `names` ⊂ `keyboard`: the keyboard value shows everything the names
// value shows, and a piano on top of it. So this is ONE three-valued choice,
// not two switches.
//
// A pair of booleans ("name the chords" / "show the keyboard") would have a
// fourth combination — a keyboard with no names — that nobody wants, and would
// then need a rule somewhere to suppress it. Naming the ladder as one axis
// leaves that combination with no spelling at all. This is the same reasoning
// that folded Sonata's lane look and key style into one value; the long version
// is written out in `sonata/plugins/look/core/config.ts`.

/**
 * Every value of the reveal ladder, in picker order and in increasing order of
 * what it shows. This array is the single source: {@link RevealMode} is derived
 * from it, and the config's options, the panel's switch and
 * {@link asRevealMode} all read it, so they cannot list different values.
 */
export const REVEAL_MODES = ["off", "names", "keyboard"] as const;

/** How much of a chord the trainer reveals. */
export type RevealMode = (typeof REVEAL_MODES)[number];

/**
 * Narrow a config read to {@link RevealMode}. `enumField` types as `string`
 * (its zod schema, built from this same list, is what rejects an unknown
 * value), so every consumer funnels its read through this instead of casting.
 *
 * Throws on an unrecognised id rather than falling back to `off`: the
 * descriptor has already refused anything else, so a value arriving here that
 * is not a mode is a defect to see, not to paper over. (Same shape as
 * `asSonataLook`.)
 */
export function asRevealMode(value: string): RevealMode {
  const mode = REVEAL_MODES.find((m) => m === value);
  if (mode === undefined) {
    throw new Error(
      `asRevealMode: unknown reveal mode "${value}" (expected one of ${REVEAL_MODES.join(", ")})`,
    );
  }
  return mode;
}
