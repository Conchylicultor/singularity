import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { depsUpdatesConfig } from "../shared/config";

export default {
  description:
    "Registers the dependency-upgrade schedule (the Dependency upgrades automation's cron, weekly by default) for Settings → Config.",
  contributions: [ConfigV2.WebRegister({ descriptor: depsUpdatesConfig })],
} satisfies PluginDefinition;
