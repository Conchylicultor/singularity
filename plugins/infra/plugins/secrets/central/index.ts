import type { CentralPluginDefinition } from "@central/types";
import { onReady } from "./internal/boot";
import {
  handleDelete,
  handleGet,
  handleHas,
  handleList,
  handleMeta,
  handleSet,
} from "./internal/handlers";

export {
  getSecret,
  setSecret,
  deleteSecret,
  hasSecret,
  getSecretMetadata,
  listKeysInNamespace,
} from "./internal/api";
export { ready } from "./internal/boot";
export type { SecretRef, SecretMetadata } from "@plugins/infra/plugins/secrets/shared";
export {
  SecretsError,
  SecretsKeychainLockedError,
} from "@plugins/infra/plugins/secrets/shared";

export default {
  id: "secrets",
  name: "Secrets",
  description:
    "Encrypted key-value primitive. AES-256-GCM blob at ~/.singularity/secrets.json.enc with the master key in the OS keychain (fallback to ~/.singularity/secrets/.key). Hosted on the central runtime; consumers (auth, config) call /api/secrets/* via the gateway.",
  loadBearing: true,
  httpRoutes: {
    "POST /api/secrets/get": handleGet,
    "POST /api/secrets/set": handleSet,
    "POST /api/secrets/delete": handleDelete,
    "POST /api/secrets/has": handleHas,
    "POST /api/secrets/meta": handleMeta,
    "POST /api/secrets/list": handleList,
  },
  onReady,
} satisfies CentralPluginDefinition;
