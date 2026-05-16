import type { ServerPluginDefinition } from "@server/types";
import { initConfigStore, shutdownConfigStore } from "./internal/instance";

export { getConfigStore } from "./internal/instance";

export default {
  id: "config-v2-store",
  name: "Config Store",
  description:
    "ConfigStore abstraction and JSONC-on-disk backend. Reads/writes formatted JSONC files under ~/.singularity/config/ with atomic writes and file-watching.",
  async onReady() {
    await initConfigStore();
  },
  async onShutdown() {
    await shutdownConfigStore();
  },
} satisfies ServerPluginDefinition;
