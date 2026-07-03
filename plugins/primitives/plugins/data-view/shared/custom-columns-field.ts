import { z } from "zod";
import type { FieldsRecord } from "@plugins/fields/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";

/**
 * Sibling config field the data-view host merges into view-core's
 * `viewsDescriptor` next to `presetsExtraFields` — the per-surface custom-column
 * SCHEMA (definitions). Lives in `shared/` (next to `sort-presets-field.ts`) so
 * the web descriptor map and the server registrations import the SAME field def
 * (one definition, two runtimes). It is **opaque storage owned by the
 * custom-columns sub-plugin**: data-view declares the config key here (a config_v2
 * write requires the field be declared on the descriptor — see the
 * dependency-inversion refactor), but never reads its shape; custom-columns owns
 * the `CustomColumnDef` type + `readCustomColumnDefs` normalizer. view-core never
 * names it either.
 *
 * Imports the PURE config-core field builders (`zod` + `fields/core` only), so
 * the descriptor stays server-import-safe when built on the server runtime.
 *
 * The explicit `id` item field is the stable join key to the values table — it
 * round-trips through `listField`'s per-item `id` slot.
 */
export const customColumnsExtraFields: FieldsRecord = {
  customColumns: listField({
    label: "Custom columns",
    itemFields: {
      id: textField({ label: "Id" }),
      label: textField({ label: "Label" }),
      type: textField({ label: "Type", default: "text" }),
      // Opaque per-type add-time config blob (e.g. an enum's option list).
      // Declared explicitly for clarity (the item schema is already
      // `.passthrough()`); `custom-columns` and the host never inspect its
      // shape — only the field type's own code (e.g. enum) reads it. A
      // `z.unknown()` `jsonField` is the sanctioned arbitrary-value config field.
      config: jsonField({ label: "Config", schema: z.unknown(), default: null }),
    },
  }),
};
