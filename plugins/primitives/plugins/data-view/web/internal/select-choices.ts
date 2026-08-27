import type { FieldOption } from "../../core";

/**
 * One chip in an option-select operand editor: the option it draws, and whether
 * the field actually lists it.
 */
export interface SelectChoice {
  option: FieldOption;
  /** False → the value is selected but absent from `field.options`. */
  listed: boolean;
}

/**
 * The chips an option-select filter input draws: every selected value the field
 * does NOT list, then the field's own options in their declared order.
 *
 * The unlisted half is the point. A saved view outlives the option set that
 * produced it, and some field types deliberately keep a persisted value out of
 * the picker (`model` hides the print-only models) — so a value missing from
 * `options` is not necessarily wrong, it is merely unlisted, which is why the
 * caller's chip says exactly that rather than calling it invalid.
 *
 * Drawing options alone leaves such a value **unreachable**: the closed trigger
 * counts it ("2 selected") while the grid offers nothing to click off, so the
 * only way out is to clear the whole rule. Its raw value IS its label — there is
 * no option to read one off — and it sorts first so it is seen rather than
 * searched for.
 */
export function selectChoices(
  options: readonly FieldOption[],
  selected: readonly string[],
): SelectChoice[] {
  const listedValues = new Set(options.map((o) => o.value));
  return [
    ...selected
      .filter((value) => !listedValues.has(value))
      .map((value) => ({ option: { value, label: value }, listed: false })),
    ...options.map((option) => ({ option, listed: true })),
  ];
}
