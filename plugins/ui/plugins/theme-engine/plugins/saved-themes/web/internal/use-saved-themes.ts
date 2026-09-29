import {
  useEndpointResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import type { Theme } from "@plugins/ui/plugins/theme-engine/core";
import { listSavedThemes } from "../../core";

// The resident source's read: the saved rows are already `Theme`s on the wire.
// Loading only when the boot hydration missed — never a final empty list — and
// a failed read is its own state, so the gallery can say so instead of
// spinning forever.
export function useSavedThemes(): ResourceResult<Theme[]> {
  return useEndpointResource(listSavedThemes, {});
}
