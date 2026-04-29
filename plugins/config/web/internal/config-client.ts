import { z } from "zod";
import { useResource, resourceDescriptor } from "@plugins/primitives/plugins/live-state/web";
import type { ConfigDescriptor, Schema, Values } from "@plugins/config/shared";
import { getDefault } from "@plugins/config/shared";

export const configResource = resourceDescriptor<Record<string, unknown>>(
  "config",
  z.record(z.unknown()),
);

export interface SecretFieldState {
  set: boolean;
  updatedAt?: number;
}

const SecretFieldStateSchema = z.object({
  set: z.boolean(),
  updatedAt: z.number().optional(),
});

export const configSecretsResource =
  resourceDescriptor<Record<string, SecretFieldState>>(
    "config-secrets",
    z.record(SecretFieldStateSchema),
  );

/**
 * Read-only typed view of a plugin's config values. Plugins pass their own
 * descriptor and plugin-id (typically the plugin's own `id`).
 *
 * Secret fields are never exposed — they always read as `""` on the client.
 * Use `useSecretFieldSet(fullKey)` instead to show "is this configured?" UI.
 */
export function useConfigValues<S extends Schema>(
  descriptor: ConfigDescriptor<S>,
  pluginId: string,
): Values<S> {
  const { data } = useResource(configResource);
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(descriptor.schema)) {
    const meta = typeof raw === "object" && raw !== null && !Array.isArray(raw) && "default" in raw
      ? (raw as { secret?: boolean; default: unknown })
      : null;
    if (meta?.secret) {
      out[key] = "";
      continue;
    }
    const stored = data?.[`${pluginId}.${key}`];
    out[key] = stored ?? getDefault(raw);
  }
  return out as Values<S>;
}

/** "Is this secret field currently set?" + timestamp. */
export function useSecretFieldSet(fullKey: string): SecretFieldState {
  const { data } = useResource(configSecretsResource);
  return data?.[fullKey] ?? { set: false };
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
