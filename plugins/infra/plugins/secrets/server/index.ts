import type { ServerPluginDefinition } from "@server/types";

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
  id: "secrets",
  name: "Secrets",
  loadBearing: true,
} satisfies ServerPluginDefinition;
