import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { multilineTextFieldType } from "@plugins/fields/plugins/multiline-text/core";
import { type MultilineTextFieldDef } from "../../core";

/** A textarea is wider than a row, so it is a `block` — the panel draws the
 *  label above it and the control lands on the panel's rail by doing nothing. */
const MultilineTextRenderer = defineFieldShape({
  type: multilineTextFieldType,
  useShape: ({ field, value, onChange }) => {
    // Debounced autosave (flush on blur), like every other text field in the app.
    const draft = useEditableField({
      value,
      onSave: onChange,
      label: field.meta.label,
    });
    const rows = (field as MultilineTextFieldDef).rows ?? 4;
    return {
      kind: "block",
      control: (
        <textarea
          value={draft.value}
          rows={rows}
          placeholder={field.meta.placeholder}
          onFocus={draft.onFocus}
          onBlur={draft.onBlur}
          onChange={(e) => draft.onChange(e.target.value)}
          className="focus-ring w-full resize-y rounded-lg border border-input bg-transparent px-sm py-xs text-body placeholder:text-muted-foreground dark:bg-input/30"
        />
      ),
    };
  },
});

export { MultilineTextRenderer };
