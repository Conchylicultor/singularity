import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleList } from "./internal/handle-list";
import {
  reportStrandedConfig,
  strandedConfigKind,
} from "./internal/report-kind";
import { configOrphans } from "../shared/endpoints";

export default {
  description:
    "Read-only audit of orphaned user-layer config files whose defineConfig descriptor is no longer live. Files one rolling `config-orphans-stranded` report at boot when any real user override is stranded.",
  contributions: [strandedConfigKind],
  httpRoutes: {
    [configOrphans.route]: handleList,
  },
  // After every plugin's onReady: the audit reads the full live config registry.
  async onAllReady() {
    await reportStrandedConfig();
  },
} satisfies ServerPluginDefinition;
