import { useEffect } from "react";
import { useSurfaceTabId } from "@plugins/primitives/plugins/surface-id/web";
import type { ShortcutDescriptor } from "./types";
import { registerShortcuts } from "./dynamic-registry";

/**
 * Register surface-scoped shortcuts from inside a surface subtree. Each becomes
 * eligible ONLY while its surface is the focused surface. `defineShortcut` is a
 * static contribution and can't read React context, so surface scoping must
 * register dynamically from where the surface id is known.
 */
export function useSurfaceShortcuts(descriptors: Omit<ShortcutDescriptor, "surfaceId">[]): void {
  const surfaceId = useSurfaceTabId(); // from @plugins/primitives/plugins/surface-id/web
  useEffect(() => {
    const tagged = descriptors.map((d) => ({
      ...d,
      surfaceId,
      id: surfaceId ? `${d.id}:${surfaceId}` : d.id, // unique per surface → no combo-warning/key collisions
    }));
    return registerShortcuts(tagged);
  }, [descriptors, surfaceId]);
}
