import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { z } from "zod";
import type { SecretMetadata } from "@plugins/infra/plugins/secrets/core";
import {
  getSecretMetadata,
  SecretsMainOfflineError,
} from "@plugins/infra/plugins/secrets/server";
import { fullKey } from "@plugins/config/core";
import { getRegistry } from "./registry";

export const CONFIG_SECRETS_NAMESPACE = "config-fields";

const SecretMetadataSchema = z.object({
  set: z.boolean(),
  updatedAt: z.number().optional(),
}) satisfies z.ZodType<SecretMetadata>;

/**
 * Pushes the "is this secret field set?" bit for every registered config
 * secret field, keyed by fullKey ("<pluginId>.<fieldName>"). Values never
 * leave main — this resource is metadata-only by design.
 *
 * On worktrees, metadata lookups RPC to main's secrets socket. If main is
 * offline we return whatever we've collected so far rather than failing the
 * whole resource — the UI can render Settings with secrets showing "not set"
 * until main comes back.
 */
export const configSecretsResource = defineResource<
  Record<string, SecretMetadata>
>({
  key: "config-secrets",
  mode: "push",
  schema: z.record(SecretMetadataSchema),
  async loader() {
    const out: Record<string, SecretMetadata> = {};
    for (const plugin of getRegistry()) {
      for (const f of plugin.fields) {
        if (f.kind !== "secret") continue;
        const fk = fullKey(plugin.pluginId, f.key);
        try {
          out[fk] = await getSecretMetadata({
            namespace: CONFIG_SECRETS_NAMESPACE,
            key: fk,
          });
        } catch (err) {
          if (err instanceof SecretsMainOfflineError) {
            // Fall through: leave fk out of the map; client treats as "not set".
            continue;
          }
          throw err;
        }
      }
    }
    return out;
  },
});
