import type { FieldsRecord } from "@plugins/fields/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";

/**
 * Sibling config field the data-view host injects into view-core's
 * `viewsDescriptor`. Lives in `shared/` so the web descriptor map and the server
 * registrations import the SAME field def (one definition, two runtimes).
 * view-core never names this — it is an opaque consumer-owned extra field merged
 * next to `views` in the per-id config doc.
 *
 * Nested `listField` is proven (`review/code-review` config uses it). `enumField`
 * constrains `direction` to `"asc" | "desc"` via `z.enum`; its config-core barrel
 * is pure (`zod` + `fields/core` + `fields/enum/core`) so the descriptor stays
 * server-import-safe when built on the server runtime.
 */
export const sortPresetsExtraFields: FieldsRecord = {
  sortPresets: listField({
    label: "Sort presets",
    itemFields: {
      label: textField({ label: "Label" }),
      rules: listField({
        label: "Rules",
        itemFields: {
          fieldId: textField({ label: "Field" }),
          direction: enumField({
            label: "Direction",
            options: ["asc", "desc"],
            default: "asc",
          }),
        },
      }),
    },
  }),
};
