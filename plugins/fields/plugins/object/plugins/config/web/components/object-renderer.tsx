import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { objectFieldType } from "@plugins/fields/plugins/object/core";
import type { ObjectFieldDef } from "../../core";

/**
 * A field that IS other fields. Both the recursion and the layout are gone from
 * this file: the `group` arm hands the sub-record back to the dispatch, and how
 * a group presents — a drill row that pushes, or an indented labelled band — is
 * the HOST's answer, not this field's. The hand-rolled `ml-2 mt-1 border-l
 * border-border pl-lg` indent it used to draw is now the panel's own nested rail
 * region.
 *
 * This is also the answer to "how do I section my settings page": an
 * `objectField({ label: "Appearance", subFields })` IS a named section, and under
 * a pane host it renders as one.
 */
const ObjectRenderer = defineFieldShape({
  type: objectFieldType,
  useShape: ({ field, value, onChange }) => ({
    kind: "group",
    fields: (field as unknown as ObjectFieldDef).subFields,
    values: value,
    onChangeField: (key, next) => onChange({ ...value, [key]: next }),
  }),
});

export { ObjectRenderer };
