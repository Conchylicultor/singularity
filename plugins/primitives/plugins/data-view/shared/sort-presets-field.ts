import type { FieldsRecord } from "@plugins/fields/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";
import { FilterGroupSchema, type FilterGroup } from "../core";

/** Default empty filter group for the `jsonField` (always app-written; the
 *  default only needs to be a valid `FilterGroup`). */
const EMPTY_FILTER_GROUP: FilterGroup = {
  kind: "group",
  id: "root",
  conjunction: "and",
  children: [],
};

/**
 * Sibling config fields the data-view host injects into view-core's
 * `viewsDescriptor`. Lives in `shared/` so the web descriptor map and the server
 * registrations import the SAME field defs (one definition, two runtimes).
 * view-core never names these — they are opaque consumer-owned extra fields
 * merged next to `views` in the per-id config doc.
 *
 * Holds BOTH prerecorded surfaces — saved **sort presets** (named `SortRule[]`)
 * and saved **filter presets** (named `FilterGroup`) — under one stable
 * module-level constant (the per-id descriptor cache keys by id alone, so the
 * field set must be a single stable object per runtime).
 *
 * Nested `listField` is proven (`review/code-review` config uses it). `enumField`
 * constrains `direction` to `"asc" | "desc"` via `z.enum`. A filter preset's
 * recursive `FilterGroup` tree is stored opaquely via `jsonField<FilterGroup>`
 * (the same idea as the view blob's `variantField`) — schema-validated as a whole
 * on read rather than field-by-field. Every config-core barrel used here is pure
 * (`zod` + `fields/core` + each field's config-core), so the descriptor stays
 * server-import-safe when built on the server runtime.
 */
export const presetsExtraFields: FieldsRecord = {
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
  filterPresets: listField({
    label: "Filter presets",
    itemFields: {
      label: textField({ label: "Label" }),
      // Recursive FilterGroup → opaque JSON blob (same idea as the view blob's
      // variantField). jsonField<T> stores arbitrary JSON validated by the schema.
      group: jsonField<FilterGroup>({
        label: "Filter",
        schema: FilterGroupSchema,
        default: EMPTY_FILTER_GROUP,
      }),
    },
  }),
};
