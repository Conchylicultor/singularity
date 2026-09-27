import { serveValue } from "@plugins/network/plugins/live/server";
import { getSecretMetadata } from "@plugins/infra/plugins/secrets/server";
import { SecretsMainOfflineError } from "@plugins/infra/plugins/secrets/core";
import {
  getAllDescriptors,
  hasFieldStorageProvider,
} from "@plugins/config_v2/server";
import { configSecretMeta } from "../../core";
import type { ConfigV2SecretMeta } from "../../core";

// External: the truth is the central secrets store. `storage.ts` notifies the
// descriptor's path after every save / clear.
export const configSecretMetaServed = serveValue(configSecretMeta, {
  source: "external",
  loader: async ({ path }) => {
    const allDescriptors = getAllDescriptors();
    const entry = allDescriptors.find(([p]) => p === path);
    // An unknown path answers "no secret fields". That includes the `""` the
    // setup wizards subscribe with before their registration is known — a
    // value has no skip, so that sentinel stays until values get one
    // (research/2026-09-27-global-live-resources-phase3-bulk-migration.md,
    // "Sentinel params").
    if (!entry) return {};
    const [, descriptor] = entry;
    const result: ConfigV2SecretMeta = {};
    for (const [key, field] of Object.entries(descriptor.fields)) {
      if (!hasFieldStorageProvider(field.type.id)) continue;
      try {
        const meta = await getSecretMetadata({
          namespace: "config-fields",
          key: `${descriptor.name}.${key}`,
        });
        result[key] = meta;
      } catch (err) {
        if (err instanceof SecretsMainOfflineError) {
          result[key] = { set: false };
        } else {
          throw err;
        }
      }
    }
    return result;
  },
});
