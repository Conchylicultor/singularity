// The import below is load-bearing: it installs the AsyncLocalStorage-backed
// ambient-context runtime as a module side effect when the plugin registry
// loads this barrel at boot (before Bun.serve). The plugin has no routes — its
// sole server responsibility is wiring that runtime into the recorder.
import "./internal/install";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export default {
  loadBearing: true,
} satisfies ServerPluginDefinition;
