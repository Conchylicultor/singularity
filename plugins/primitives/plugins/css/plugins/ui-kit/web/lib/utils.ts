import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import {
  CUSTOM_UTILITY_REGISTRY,
  type CustomGroupId,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/custom-utilities.generated";

// Derive the twMerge extension from the single-source registry so adding a custom
// @utility never requires a separate hand-edit of the conflict map (the coupling
// that let role utilities like `text-caption` get silently stripped). The registry
// is GENERATED from the `/* twmerge: … */` markers in app.css (the single source of
// truth) — see custom-utilities-types.ts for the wiring semantics.
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

/**
 * The one minter of a `ClassName` (see ui-kit's `core`). A field typed
 * `ClassName` cannot be filled with a bare literal, so its author has to route
 * the literal through here — which is precisely the `cn()` call anchor the
 * `no-adhoc-*` class rules already read tokens out of.
 *
 * `as ClassName` is deliberately the SINGLE cast to that type in the repo: grep
 * `as ClassName` and you have enumerated every way a class string can be minted
 * without passing the merge. Do not add a second one — call `cn()` instead.
 */
export function cn(...inputs: ClassValue[]): ClassName {
  return twMerge(clsx(inputs)) as ClassName;
}
