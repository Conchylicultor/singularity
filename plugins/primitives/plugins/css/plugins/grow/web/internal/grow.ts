/**
 * The pure grow class — single source of truth, exported so `fillClasses` and
 * the pure test share one definition.
 *
 * A growing cell answers ONE of the two space-sharing questions: it TAKES the
 * row's slack. It answers the other question with "no" — no `min-*-0`, so the
 * cell stays floored at its own content size (`min-width: auto`) and the leaves
 * inside it never truncate. That floor is the whole point of reaching for this
 * rather than `<Fill>`: the switcher whose chips must hug their content while
 * only the trailing empty space grows, the input that fills the row but stays
 * usable, the contentful track that must not be crushed by a neighbour.
 *
 * When the cell should ALSO fall below its content, you want both halves —
 * that is `fillClasses(axis)`, which is exactly `yieldClass(axis) + growClass()`.
 *
 * **No axis parameter, matching `rigidClass()` and unlike `yieldClass(axis)`.**
 * `flex-grow` is ONE property that already applies along whichever axis the
 * container declared as its main axis; `min-width: 0` and `min-height: 0` are
 * two different properties, which is the only reason yield needs an axis. An
 * axis argument here could only ever be ignored — or, worse, be believed.
 *
 * Emits Tailwind's `flex-1` (`flex: 1 1 0%`), the same basis-0 claimant
 * behaviour `Fill` has. That basis is not incidental: it is what makes a
 * claimant share the row by grow factor rather than by content size, and it is
 * precisely why a cell that must yield *in proportion with a sibling* wants
 * `yieldClass()` alone and not this.
 */
export function growClass(): string {
  return "flex-1";
}
