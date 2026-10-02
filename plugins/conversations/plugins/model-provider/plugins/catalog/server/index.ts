import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  startCliVersionTrigger,
  stopCliVersionTrigger,
} from "./internal/cli-version-trigger";
import { modelsDiscoverJob } from "./internal/discover-job";
import { modelUnrecognizedKind } from "./internal/report-kinds";
import {
  modelCatalogServed,
  modelCatalogWatcher,
  startCatalogWatcher,
  stopCatalogWatcher,
} from "./internal/store";

export { getModelCatalog } from "./internal/store";

export default {
  description:
    "The host-global model catalog: getModelCatalog() (catalog.json in memory, re-read by a file watcher, the baseline until the first discovery), the model-provider.catalog live value, and the models.discover job — daily and on every new Claude CLI version, it reads the CLI's model menu (the Agent SDK `initialize` control request, answered locally: no model call), makes each family run what its alias resolves to (with a bell line when that moves), appends new versions, retires versions the menu no longer offers, and files model-unrecognized for an entry it cannot place.",
  register: [modelsDiscoverJob, modelCatalogWatcher],
  contributions: [...modelCatalogServed.declare, modelUnrecognizedKind],
  onReady: async () => {
    await startCatalogWatcher();
    startCliVersionTrigger();
  },
  onShutdown: async () => {
    stopCliVersionTrigger();
    await stopCatalogWatcher();
  },
} satisfies ServerPluginDefinition;
