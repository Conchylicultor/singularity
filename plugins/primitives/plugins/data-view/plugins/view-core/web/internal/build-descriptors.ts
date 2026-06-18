import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { viewsDescriptor } from "../../shared";

/**
 * Build the per-id `views` descriptors for the web runtime, parameterized by the
 * caller's id list (the consumer owns the manifest — the engine never scrapes
 * markers).
 *
 * `useConfig`/`useSetConfig` match a config registration by descriptor
 * *reference identity* (`reg.descriptor === descriptor`). So the descriptor
 * passed to `ConfigV2.WebRegister` and the one looked up by `useViewsConfig` MUST
 * be the same object. Building both off this single map (the consumer registers
 * the `entries`, the model resolves via `map.get(id)`) guarantees that.
 * (`viewsDescriptor` also caches per id, so this is belt-and-suspenders; the map
 * is the canonical lookup.)
 */
export function buildViewDescriptors(ids: string[]): {
  map: Map<string, ConfigDescriptor>;
  entries: Array<{ id: string; descriptor: ConfigDescriptor }>;
} {
  const map = new Map<string, ConfigDescriptor>(
    ids.map((id) => [id, viewsDescriptor(id)]),
  );
  const entries = ids.map((id) => ({ id, descriptor: map.get(id)! }));
  return { map, entries };
}
