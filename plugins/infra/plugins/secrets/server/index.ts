import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  getSecret,
  setSecret,
  deleteSecret,
  hasSecret,
  getSecretMetadata,
  listKeysInNamespace,
} from "./internal/operations";
export { ready } from "./internal/ready";
export type { SecretRef, SecretMetadata } from "@plugins/infra/plugins/secrets/core";
export {
  SecretsError,
  SecretsMainOfflineError,
  SecretsKeychainLockedError,
} from "@plugins/infra/plugins/secrets/core";

export default {
  name: "Secrets",
  loadBearing: true,
} satisfies ServerPluginDefinition;
