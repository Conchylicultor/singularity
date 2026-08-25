import {
  defineFieldShape,
  useLocalValue,
} from "@plugins/config_v2/plugins/fields/web";
import { textFieldType } from "@plugins/fields/plugins/text/core";
import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * `useShape` is a hook, so the focus-aware local buffer lives here exactly as it
 * did before — what left is the label, the stack and the padding.
 */
const TextRenderer = defineFieldShape({
  type: textFieldType,
  useShape: ({ field, value, onChange }) => {
    const { local, setLocal, focus } = useLocalValue(value);
    return {
      kind: "value",
      fit: "field",
      control: (
        <Input
          value={local}
          placeholder={field.meta.placeholder}
          onFocus={focus.onFocus}
          onBlur={() => {
            focus.onBlur();
            if (local !== value) onChange(local);
          }}
          onChange={(e) => setLocal(e.target.value)}
        />
      ),
    };
  },
});

export { TextRenderer };
