import { MdCallSplit } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

/**
 * A discriminated/polymorphic object value. The `type` discriminant selects
 * which "variant" the rest of the keys belong to; every other key is opaque
 * per-type payload owned by the chosen variant.
 *
 * Storage is opaque/passthrough at the config boundary (mirroring a
 * `reorder-tree` node `{ type, ...payload }`): the config schema validates only
 * the `type` discriminant and preserves the payload verbatim. Per-type
 * validation of the payload happens downstream, against an injected per-type
 * field registry (see `validateVariant` / `useVariants` in the config
 * sub-plugin).
 */
export type VariantValue = { type: string } & Record<string, unknown>;

export const variantFieldType = defineFieldType<VariantValue>("variant");

export const variantIdentity = defineFieldIdentity<VariantValue>({
  type: variantFieldType,
  label: "Variant",
  icon: MdCallSplit,
  // no coerce — not a sortable/filterable scalar (like reorder-tree/object).
});
