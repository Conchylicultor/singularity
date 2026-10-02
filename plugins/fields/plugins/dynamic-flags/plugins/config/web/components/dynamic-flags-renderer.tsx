import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { dynamicFlagsFieldType } from "@plugins/fields/plugins/dynamic-flags/core";
import { DynamicFlagsControl } from "./dynamic-flags-control";

/**
 * A `block`, not a `choice`: the options come from a contributed hook that only
 * exists once a contribution matches, which `useShape` cannot call
 * conditionally (see `DynamicFlagsControl`). A set of switches is wider than a
 * row, so the block is the panel's own answer for it.
 */
const DynamicFlagsRenderer = defineFieldShape({
  type: dynamicFlagsFieldType,
  useShape: ({ field, value, onChange }) => ({
    kind: "block",
    control: (
      <DynamicFlagsControl field={field} value={value} onChange={onChange} />
    ),
  }),
});

export { DynamicFlagsRenderer };
