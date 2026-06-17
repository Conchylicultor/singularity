import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { CUSTOM_UTILITY_REGISTRY, type CustomGroupId } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/custom-utilities";

// Derive the twMerge extension from the single-source registry so adding a custom
// @utility never requires a separate hand-edit of the conflict map (the coupling
// that let role utilities like `text-caption` get silently stripped). See
// custom-utilities.ts for the wiring semantics.
const classGroups: Record<string, string[]> = {};
const conflictingClassGroups: Record<string, string[]> = {};
for (const entry of CUSTOM_UTILITY_REGISTRY) {
  if ("extend" in entry) {
    (classGroups[entry.extend] ??= []).push(...entry.classes);
  } else if ("group" in entry) {
    classGroups[entry.group] = [...entry.classes];
    for (const conflict of entry.conflictsWith) {
      (conflictingClassGroups[conflict] ??= []).push(entry.group);
    }
  }
  // standalone entries are intentionally invisible to twMerge.
}

const twMerge = extendTailwindMerge<CustomGroupId>({
  extend: { classGroups, conflictingClassGroups },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
