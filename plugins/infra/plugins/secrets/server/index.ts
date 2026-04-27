import type { ServerPluginDefinition } from "@server/types";
import { onReady } from "./internal/boot";

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

export default {
  id: "secrets",
  name: "Secrets",
  description:
    "Encrypted key-value primitive. AES-256-GCM blob at ~/.singularity/secrets.json.enc with the master key in the OS keychain (fallback to ~/.singularity/secrets/.key). Consumers: auth (tokens), config (secret fields).",
  onReady,
} satisfies ServerPluginDefinition;
