import type { ServerPluginDefinition } from "@server/types";
import { initRegistry, shutdownRegistry } from "./internal/registry";

export { ConfigV2 } from "./internal/contribution";
export { getConfig, setConfig, watchConfig } from "./internal/registry";

export default {
  id: "config-v2",
  name: "Config v2",
  description: "Typed JSONC config handles for server plugins.",
  async onReady() {
    await initRegistry();
  },
  async onShutdown() {
    shutdownRegistry();
  },
} satisfies ServerPluginDefinition;
