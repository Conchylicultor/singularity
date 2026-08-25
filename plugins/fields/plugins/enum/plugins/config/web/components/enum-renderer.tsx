import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { enumFieldType } from "@plugins/fields/plugins/enum/core";
import type { EnumFieldDef } from "../../core";

/**
 * A closed option set, as data. Whether that becomes a band of radio rows or a
 * picker is not this file's business — it is the panel's, decided once against
 * one threshold. The `options.length <= 3` heuristic (and the `display` override
 * beside it) used to live here, and the same heuristic lived again in
 * `dynamic-enum`; two copies of one presentation rule inside two field types is
 * exactly what this contract deletes.
 *
 * `EnumOption` is `{ value, label }` and `ChoiceOption` is `{ value, label,
 * icon?, hint? }`, so the option list is handed over as it stands.
 */
const EnumRenderer = defineFieldShape({
  type: enumFieldType,
  useShape: ({ field, value, onChange }) => ({
    kind: "choice",
    select: "one",
    options: (field as EnumFieldDef).options,
    value: [value],
    onSelect: onChange,
  }),
});

export { EnumRenderer };
