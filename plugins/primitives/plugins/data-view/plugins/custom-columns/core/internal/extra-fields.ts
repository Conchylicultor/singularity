import type { FieldsRecord } from "@plugins/fields/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";

/**
 * Sibling config field the data-view host merges into view-core's
 * `viewsDescriptor` next to `sortPresets` — the per-surface custom-column SCHEMA
 * (definitions). Mirrors `sortPresetsExtraFields`: an opaque consumer-owned extra
 * field stored in the SAME per-id config doc, so it is git-promotable +
 * per-app-scopable with zero new registration machinery. view-core never names
 * it.
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
    },
  }),
};
