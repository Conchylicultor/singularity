import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { Theme } from "@plugins/ui/plugins/theme-engine/core";
import { listSavedThemes } from "../../core";

// The resident source's read: the saved rows are already `Theme`s on the wire.
// `undefined` while the list is still loading (only when the boot hydration
// missed) — pending, never a final empty list.
export function useSavedThemes(): Theme[] | undefined {
  return useEndpoint(listSavedThemes, {}).data;
}
