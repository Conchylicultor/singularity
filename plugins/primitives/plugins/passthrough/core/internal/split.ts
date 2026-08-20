/**
 * One passthrough, split by DESTINATION.
 *
 * The contract on {@link Passthrough} says the bag lands on the node `ref`
 * names. A few primitives genuinely have a second destination: `Row`
 * synthesizes a `<button>`/`<a>` and the attributes that describe *that
 * control* — `onClick`, `href`, `role`, `tabIndex`, any `aria-*` — have to
 * reach it rather than the row box, because a `disabled` button must swallow
 * its own `onClick` and `aria-expanded` describes the disclosure control, not
 * the strip around it.
 *
 * Splitting is therefore allowed — but only by NAME. `anchored` is the part
 * that keeps the promise and must land on the `ref` element; `routed` is the
 * part the primitive deliberately sends elsewhere, and saying so out loud is
 * the entire difference between a routed passthrough and the `Row` bug. It is
 * also what `passthrough/no-unanchored-passthrough` keys on: the raw bag may
 * not be picked apart by hand (a `for (const [k, v] of Object.entries(rest))`
 * loop is unreadable to the rule and was how `Row` did it), so this is the one
 * sanctioned way to derive from it.
 *
 * The predicate rather than a key list, because the realistic split has an
 * open family in it — `Row` routes every `aria-*` by prefix and would
 * otherwise be maintaining a list that can never be complete.
 *
 * @param rest the primitive's own rest bag
 * @param isRouted true for the keys that describe the OTHER destination
 */
export function splitPassthrough(
  rest: Record<string, unknown>,
  isRouted: (key: string) => boolean,
): { anchored: Record<string, unknown>; routed: Record<string, unknown> } {
  const anchored: Record<string, unknown> = {};
  const routed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    (isRouted(key) ? routed : anchored)[key] = value;
  }
  return { anchored, routed };
}
