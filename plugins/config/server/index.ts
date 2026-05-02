import type { ServerPluginDefinition } from "@server/types";
import { plugins as allPlugins } from "@server/plugins";
import { ready as secretsReady } from "@plugins/infra/plugins/secrets/server";
import { configResource } from "./internal/resource";
import { configSecretsResource } from "./internal/secrets-resource";
import { buildRegistry } from "./internal/registry";
import { migratePlaintextSecretsToSecretStore } from "./internal/migrate-secrets";
import { isMain } from "@plugins/infra/plugins/paths/server";
import {
  handleDelete,
  handleGet,
  handlePatch,
  handleSpecs,
} from "./internal/handlers";

export { configResource } from "./internal/resource";
export { configSecretsResource } from "./internal/secrets-resource";
export { readConfig } from "./internal/read-config";

export default {
  id: "config",
  name: "Config",
  description:
    "Per-worktree key/value config. Plugins declare typed fields via defineConfig; values expose in the Settings pane.",
  httpRoutes: {
    "GET /api/config": handleGet,
    "GET /api/config/specs": handleSpecs,
    "PATCH /api/config": handlePatch,
    "DELETE /api/config/:key": handleDelete,
  },
  resources: [configResource, configSecretsResource],
  async onReady() {
    buildRegistry(allPlugins);
    // Plaintext→secrets migration is main-only: the secrets store is
    // centralized on main, and running per-worktree would race multiple
    // writers against each other via RPC.
    if (!isMain()) return;
    try {
      await secretsReady;
      await migratePlaintextSecretsToSecretStore();
    } catch (err) {
      console.error(
        "[config] failed to migrate plaintext secrets into secrets store:",
        err,
      );
    }
  },
} satisfies ServerPluginDefinition;
