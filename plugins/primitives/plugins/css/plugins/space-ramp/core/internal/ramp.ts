import { RAMP_CLASSES, SPACE_STEPS } from "../ramp.generated";

/**
 * The closed spacing ramp. Each step maps to a `gap-<step>` / `p-<step>` /
 * `rail-<step>` … `@utility` backed by the density token group's `--space-*`
 * runtime vars, so every gap, inset and rail scales together with the active
 * density preset. Pick a step, never a raw `gap-2`/`p-3` — the
 * `no-adhoc-spacing` lint rule enforces this repo-wide.
 */
export type SpaceStep = (typeof SPACE_STEPS)[number];

/** A step-keyed `@utility` family — `gap`, `p`, `px`, `rail-x`, … */
export type RampFamily = keyof typeof RAMP_CLASSES;

/**
 * The class one family gives one step.
 *
 * A step is NEVER spliced into a class name at a call site. Tailwind emits an
 * `@utility` only when its source scanner finds the literal token, so
 * `` `pl-${step}` `` compiles to nothing scannable and "works" only when some
 * other file happens to spell the same class. The literals live in
 * `ramp.generated.ts`, which is generated from the `@utility` declarations
 * themselves — so "the class is in the table" and "the utility exists" are the
 * same fact rather than two that can drift.
 *
 * Both arguments are checked: a family or step that is not on the ramp is a tsc
 * error, not a class name that silently resolves to nothing.
 */
export function rampClass(family: RampFamily, step: SpaceStep): string {
  return RAMP_CLASSES[family][step];
}

/**
 * A step as a CSS length, for the two places a class cannot reach: an inline
 * `style` offset (`<Sticky>`'s edge distance, `<Pin>`'s corner inset). The
 * semantic ramp declares no inset (`top-*`/`left-*`) utilities, only gap /
 * padding / rail ones.
 *
 * Deliberately a formula rather than a generated table: this is a custom-property
 * reference, not a class name, so nothing has to scan it, and the `--space-*`
 * spelling is already load-bearing on the CSS side — app.css's own fallback-less
 * `var(--space-<step>)` references are checked against the density token group by
 * the `css-vars-supplied` check. `none` is a literal `0`: it is the constant zero
 * step and has no token.
 */
export function spaceLength(step: SpaceStep): string {
  return step === "none" ? "0" : `var(--space-${step})`;
}
