import {
  defineFieldShape,
  useLocalValue,
} from "@plugins/config_v2/plugins/fields/web";
import { multilineTextFieldType } from "@plugins/fields/plugins/multiline-text/core";
import { type MultilineTextFieldDef } from "../../core";

/** A textarea is wider than a row, so it is a `block` — the panel draws the
 *  label above it and the control lands on the panel's rail by doing nothing. */
const MultilineTextRenderer = defineFieldShape({
  type: multilineTextFieldType,
  useShape: ({ field, value, onChange }) => {
    const { local, setLocal, focus } = useLocalValue(value);
    const rows = (field as MultilineTextFieldDef).rows ?? 4;
    return {
      kind: "block",
      control: (
        <textarea
          value={local}
          rows={rows}
          placeholder={field.meta.placeholder}
          onFocus={focus.onFocus}
          onBlur={() => {
            focus.onBlur();
            if (local !== value) onChange(local);
          }}
          onChange={(e) => setLocal(e.target.value)}
          className="focus-ring w-full resize-y rounded-lg border border-input bg-transparent px-sm py-xs text-body placeholder:text-muted-foreground dark:bg-input/30"
        />
      ),
    };
  },
});

export { MultilineTextRenderer };
