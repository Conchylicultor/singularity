import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { dynamicEnumFieldType } from "@plugins/fields/plugins/dynamic-enum/core";
import { DynamicEnumControl } from "./dynamic-enum-control";

/**
 * The one field type whose shape is a `value` rather than a `choice`, and the
 * reason is in `DynamicEnumControl`: its options come from a contributed hook
 * that only exists once a contribution matches, which a `useShape` hook cannot
 * call conditionally. The branch that remains is about the CONTROL, never about
 * the frame.
 */
const DynamicEnumRenderer = defineFieldShape({
  type: dynamicEnumFieldType,
  useShape: ({ field, value, onChange }) => ({
    kind: "value",
    fit: "field",
    control: (
      <DynamicEnumControl
        field={field}
        value={value}
        onChange={onChange}
        placeholder={field.meta.placeholder}
      />
    ),
  }),
});

export { DynamicEnumRenderer };
