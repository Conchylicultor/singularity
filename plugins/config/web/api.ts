import { useResource, resourceDescriptor } from "@core";
import type { ConfigDescriptor, Schema, Values } from "@plugins/config/shared";
import { getDefault } from "@plugins/config/shared";

export const configResource = resourceDescriptor<Record<string, unknown>>("config");

/**
 * Read-only typed view of a plugin's config values. Plugins pass their own
 * descriptor and plugin-id (typically the plugin's own `id`).
 */
export function useConfigValues<S extends Schema>(
  descriptor: ConfigDescriptor<S>,
  pluginId: string,
): Values<S> {
  const { data } = useResource(configResource);
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(descriptor.schema)) {
    const stored = data?.[`${pluginId}.${key}`];
    out[key] = stored ?? getDefault(raw);
  }
  return out as Values<S>;
}

/** Imperative write — used by the Settings pane. */
export async function setConfigValue(
  fullKey: string,
  value: unknown,
): Promise<void> {
  const res = await fetch("/api/config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: fullKey, value }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PATCH /api/config failed: ${res.status} ${text}`);
  }
}

export async function resetConfigValue(fullKey: string): Promise<void> {
  const res = await fetch(`/api/config/${encodeURIComponent(fullKey)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DELETE /api/config failed: ${res.status} ${text}`);
  }
}
