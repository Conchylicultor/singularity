// Public API for other plugins.

import type { ConfigDescriptor, Schema, Values } from "@plugins/config/shared";
import { fullKey, getDefault, normalize } from "@plugins/config/shared";
import { configResource } from "./internal/resource";
import { getValue } from "./internal/read-cache";
import { pluginIdOf } from "./internal/registry";

export { configResource };

/**
 * Read the current values for a plugin's config. Return type is inferred from
 * the descriptor's schema. Missing fields fall back to declared defaults.
 *
 * The descriptor must have been registered via a plugin's `config` field —
 * registration happens in the config plugin's `onReady`, so callers should
 * only invoke `readConfig` after the server has finished starting up (i.e.
 * from inside an HTTP/WS handler, never at module top-level).
 */
export async function readConfig<S extends Schema>(
  descriptor: ConfigDescriptor<S>,
): Promise<Values<S>> {
  const pluginId = pluginIdOf(descriptor as ConfigDescriptor);
  if (!pluginId) {
    throw new Error(
      "readConfig: descriptor not registered. Ensure the owning plugin sets `config: <descriptor>` on its ServerPluginDefinition and that the config plugin's onReady has run.",
    );
  }
  const fields = normalize(descriptor.schema);
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const stored = await getValue(fullKey(pluginId, f.key));
    out[f.key] = stored ?? f.default;
  }
  // Include any schema fields that failed normalization, falling back to their
  // raw default so callers never see `undefined` for a declared key.
  for (const [k, raw] of Object.entries(descriptor.schema)) {
    if (!(k in out)) out[k] = getDefault(raw);
  }
  return out as Values<S>;
}
