import { useCallback } from "react";
import { resolveTypeChain } from "@plugins/fields/core";
import { useFieldIdentities } from "./use-field-identities";

/** Generic fallback when a field type registers no `directionLabels`. */
const GENERIC_LABELS = { asc: "Ascending", desc: "Descending" } as const;

export type DirectionLabels = { asc: string; desc: string };

/**
 * Resolve a field type id → its registered sort-direction labels, honoring
 * `extends` (an `int` field reuses `number`'s "1 → 9" / "9 → 1" when `int`
 * declares none of its own). The sort builder's DirectionPicker uses this to
 * render type-aware menu labels ("A → Z", "Newest first") in place of the
 * generic "Ascending" / "Descending" — reading the `fields.identity` registry
 * by id, the same sanctioned no-`fields/web`-import practice as
 * `useResolveFieldIcon` / `useResolveOperatorSet`.
 */
export function useResolveDirectionLabels(): (
  typeId: string | undefined,
) => DirectionLabels {
  const identities = useFieldIdentities();
  return useCallback(
    (typeId) => {
      const chain = resolveTypeChain(typeId ?? "text", identities);
      for (const id of chain) {
        const labels = identities.get(id)?.directionLabels;
        if (labels) return labels;
      }
      return GENERIC_LABELS;
    },
    [identities],
  );
}
