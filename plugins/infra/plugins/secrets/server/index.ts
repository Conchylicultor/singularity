export {
  getSecret,
  setSecret,
  deleteSecret,
  hasSecret,
  getSecretMetadata,
  listKeysInNamespace,
} from "./internal/operations";
export { ready } from "./internal/ready";
export type { SecretRef, SecretMetadata } from "@plugins/infra/plugins/secrets/shared";
export {
  SecretsError,
  SecretsMainOfflineError,
  SecretsKeychainLockedError,
} from "@plugins/infra/plugins/secrets/shared";
