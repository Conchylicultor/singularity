import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { tagsFieldType } from "@plugins/fields/plugins/tags/core";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import type { TagsFieldDef, TagsOption } from "../../core";

/**
 * The whole option set as it must be SHOWN: the declared menu, plus every
 * selected value the menu no longer offers, appended in the order it was stored.
 *
 * The appended half is the point. `tagsField`'s value is an open `string[]`
 * precisely so a re-copied catalogue cannot invalidate a saved selection — and a
 * kept value that nothing renders would be worse than a discarded one: it would
 * keep filtering, invisibly, with no control to turn it off.
 */
function shownOptions(
  options: readonly TagsOption[],
  value: readonly string[],
): { option: TagsOption; known: boolean }[] {
  const known = new Set(options.map((o) => o.value));
  return [
    ...options.map((option) => ({ option, known: true })),
    ...value
      .filter((v) => !known.has(v))
      .map((v) => ({ option: { value: v, label: v }, known: false })),
  ];
}

const TagsRenderer: FieldRendererComponent<string[]> = ({
  field,
  value,
  onChange,
}) => {
  const { options } = field as TagsFieldDef;
  // The dispatch slot is value-erased, and a config written before this field
  // existed reaches the renderer with nothing in it. Anything that is not an
  // array is "nothing selected", which is also what the field's default says.
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const selectedSet = new Set(selected);

  const toggle = (v: string): void => {
    onChange(
      selectedSet.has(v)
        ? selected.filter((s) => s !== v)
        : // Appended, never re-sorted: the order is the user's own record of
          // what they picked, and re-sorting would move chips under the cursor.
          [...selected, v],
    );
  };

  return (
    <Stack gap="xs" className="py-md">
      <FieldHeader field={field} />
      <Cluster gap="2xs">
        {shownOptions(options, selected).map(({ option, known }) => (
          <ToggleChip
            key={option.value}
            variant="ghost"
            active={selectedSet.has(option.value)}
            onClick={() => toggle(option.value)}
            title={
              known
                ? undefined
                : "Selected, but no longer offered by this source. Click to remove it."
            }
          >
            {known ? option.label : `${option.label} ?`}
          </ToggleChip>
        ))}
      </Cluster>
    </Stack>
  );
};
TagsRenderer.type = tagsFieldType;

export { TagsRenderer };
