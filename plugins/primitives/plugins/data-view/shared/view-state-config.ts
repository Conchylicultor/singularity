import { z } from "zod";
import { defineConfig } from "@plugins/config_v2/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";
import type { FilterNode } from "../core";

/**
 * Zod mirrors of the data-view core types (`SortState`, `FilterRule`,
 * `FilterGroup`, `FilterNode`). The durable per-view state lives in a single
 * `jsonField` keyed by `storageKey`; these schemas validate it at the config
 * boundary. The `value` operand is intentionally `z.unknown()` (a JSON-safe
 * operand, possibly absent), matching `FilterRule.value`.
 *
 * Plugin-private (`shared/`): only data-view's own web + server barrels import
 * this.
 */

const sortStateSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(["asc", "desc"]),
});

const filterRuleSchema = z.object({
  kind: z.literal("rule"),
  id: z.string(),
  fieldId: z.string(),
  operatorId: z.string(),
  value: z.unknown().optional(),
});

// Recursive: a group's children are FilterNodes (rule | group).
const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([filterRuleSchema, filterGroupSchema]),
);

const filterGroupSchema: z.ZodType<
  Extract<FilterNode, { kind: "group" }>
> = z.lazy(() =>
  z.object({
    kind: z.literal("group"),
    id: z.string(),
    conjunction: z.enum(["and", "or"]),
    children: z.array(filterNodeSchema),
  }),
);

const surfaceStateSchema = z.object({
  activeView: z.string().nullable(),
  views: z.record(
    z.string(),
    z.object({
      sort: sortStateSchema.nullable(),
      filter: filterGroupSchema.nullable(),
    }),
  ),
});

const surfacesSchema = z.record(z.string(), surfaceStateSchema);

export type SurfaceState = z.infer<typeof surfaceStateSchema>;
export type SurfacesState = z.infer<typeof surfacesSchema>;

export const viewStateDescriptor = defineConfig({
  name: "view-state",
  fields: {
    surfaces: jsonField<SurfacesState>({
      label: "Saved view filters & sorts",
      description:
        "Per-surface active view, sort, and filter state for Notion-like data views. Managed automatically by the app.",
      schema: surfacesSchema,
      default: {},
    }),
  },
});
