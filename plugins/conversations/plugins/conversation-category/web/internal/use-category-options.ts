import { useMemo } from "react";
import type { DynamicEnumOption } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import { useCategories } from "./use-categories";

/**
 * Options for the "Avatar category" setting: the user's own categories, resolved
 * at config-render time because they cannot be known when the field is declared.
 *
 * The leading "None" entry is load-bearing twice over — it is how the choice is
 * cleared, and without it a fresh install (no categories yet) renders an empty
 * picker that reads as broken.
 */
export function useCategoryOptions(): readonly DynamicEnumOption[] {
  const categories = useCategories();
  return useMemo(
    () => [
      { value: "", label: "None" },
      ...categories.map((c) => ({ value: c.id, label: c.name || c.id })),
    ],
    [categories],
  );
}
