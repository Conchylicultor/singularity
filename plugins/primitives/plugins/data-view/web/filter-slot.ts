import { useCallback } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { resolveTypeChain } from "@plugins/fields/core";
import type { FilterContribution } from "../core";
import { useFieldIdentities } from "./internal/use-field-identities";

/**
 * Per-type filter slot. A plain slot — it carries the pure predicate/isActive
 * functions (applied in the row pipeline today) plus the `Control` (rendered by
 * the future filter bar; not rendered this task).
 */
const Filter = defineSlot<FilterContribution>("data-view.filter", {
  docLabel: (c) => c.match,
});

/** Resolve a field type id → its FilterContribution, honoring `extends`. */
export function useResolveFilter(): (
  typeId: string,
) => FilterContribution | undefined {
  const identities = useFieldIdentities();
  const contributions = Filter.useContributions();
  return useCallback(
    (typeId) => {
      const chain = resolveTypeChain(typeId, identities);
      for (const id of chain) {
        const c = contributions.find((x) => x.match === id);
        if (c) return c as unknown as FilterContribution;
      }
      return undefined;
    },
    [identities, contributions],
  );
}

export { Filter };
