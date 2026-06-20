import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { getSecretMetadata } from "@plugins/infra/plugins/secrets/server";
import { SecretsMainOfflineError } from "@plugins/infra/plugins/secrets/core";
import { getAllDescriptors, hasFieldStorageProvider } from "@plugins/config_v2/server";
import { configV2SecretMetaSchema } from "../../core";
import type { ConfigV2SecretMeta } from "../../core";

export const secretMetaServerResource = defineExternalResource<ConfigV2SecretMeta, { path: string }>({
  key: "config-v2.secret-meta",
  mode: "push",
  schema: configV2SecretMetaSchema,
  loader: async ({ path }) => {
    const allDescriptors = getAllDescriptors();
    const entry = allDescriptors.find(([p]) => p === path);
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
