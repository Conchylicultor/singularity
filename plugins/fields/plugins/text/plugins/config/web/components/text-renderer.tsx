import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { textFieldType } from "@plugins/fields/plugins/text/core";
import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * `useShape` is a hook, so the draft lives here: the same debounced autosave
 * (flush on blur, external writes adopted or reported) as every other text
 * field in the app, rather than a save that only happens on blur.
 */
const TextRenderer = defineFieldShape({
  type: textFieldType,
  useShape: ({ field, value, onChange }) => {
    const draft = useEditableField({
      value,
      onSave: onChange,
      label: field.meta.label,
    });
    return {
      kind: "value",
      fit: "field",
      control: (
        <Input
          value={draft.value}
          placeholder={field.meta.placeholder}
          onFocus={draft.onFocus}
          onBlur={draft.onBlur}
          onChange={(e) => draft.onChange(e.target.value)}
        />
      ),
    };
  },
});

export { TextRenderer };
