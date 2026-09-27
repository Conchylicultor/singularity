import type { IconRef } from "@plugins/ui/plugins/icons/core";
import { useCallback } from "react";
import { resolveTypeChain } from "@plugins/fields/core";
import { useFieldIdentities } from "./use-field-identities";

/**
 * Resolve a field type id → its registered identity icon, honoring `extends`
 * (an `int` field shows the `number` icon when `int` declares no icon of its
 * own). The filter builder's FieldPicker uses this to render each field's icon
 * next to its label — reading the `fields.identity` registry by id, the same
 * sanctioned no-`fields/web`-import practice as `useResolveOperatorSet`.
 */
export function useResolveFieldIcon(): (typeId: string) => IconRef | undefined {
  const identities = useFieldIdentities();
  return useCallback(
    (typeId) => {
      const chain = resolveTypeChain(typeId, identities);
      for (const id of chain) {
        const icon = identities.get(id)?.icon;
        if (icon) return icon;
      }
      return undefined;
    },
    [identities],
  );
}
