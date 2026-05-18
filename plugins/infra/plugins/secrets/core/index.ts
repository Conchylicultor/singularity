export type { SecretRef, SecretMetadata } from "./internal/types";
export {
  SecretsError,
  SecretsMainOfflineError,
  SecretsKeychainLockedError,
} from "./internal/errors";
export {
  secretsGet,
  secretsSet,
  secretsDelete,
  secretsHas,
  secretsMeta,
  secretsList,
} from "./endpoints";
