import type { ChoiceOption } from "@plugins/config_v2/plugins/fields/core";
import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { tagsFieldType } from "@plugins/fields/plugins/tags/core";
import type { TagsFieldDef, TagsOption } from "../../core";

/**
 * The whole option set as it must be SHOWN: the declared menu, plus every
 * selected value the menu no longer offers, appended in the order it was stored.
 *
 * The appended half is the point. `tagsField`'s value is an open `string[]`
 * precisely so a re-copied catalogue cannot invalidate a saved selection — and a
 * kept value that nothing renders would be worse than a discarded one: it would
 * keep filtering, invisibly, with no control to turn it off. A stale value says
 * so in its own `hint`, which the panel renders as the row's tooltip.
 */
function shownOptions(
  options: readonly TagsOption[],
  value: readonly string[],
): ChoiceOption[] {
  const known = new Set(options.map((o) => o.value));
  return [
    ...options.map((option) => ({ value: option.value, label: option.label })),
    ...value
      .filter((v) => !known.has(v))
      .map((v) => ({
        value: v,
        label: `${v} ?`,
        hint: "Selected, but no longer offered by this source. Click to remove it.",
      })),
  ];
}

const TagsRenderer = defineFieldShape({
  type: tagsFieldType,
  useShape: ({ field, value, onChange }) => {
    const { options } = field as TagsFieldDef;
    // The dispatch slot is value-erased, and a config written before this field
    // existed reaches the renderer with nothing in it. Anything that is not an
    // array is "nothing selected", which is also what the field's default says.
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const selectedSet = new Set(selected);
    return {
      kind: "choice",
      select: "many",
      options: shownOptions(options, selected),
      value: selected,
      onSelect: (v) =>
        onChange(
          selectedSet.has(v)
            ? selected.filter((s) => s !== v)
            : // Appended, never re-sorted: the order is the user's own record of
              // what they picked, and re-sorting would move chips under the
              // cursor.
              [...selected, v],
        ),
    };
  },
});

export { TagsRenderer };
