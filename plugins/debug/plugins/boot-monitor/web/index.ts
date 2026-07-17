import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { bootMonitorConfig } from "../core";

export default {
  collapsed: true,
  description:
    "Boot-monitor web presence: registers the whole-boot budget config (enabled, totalBootBudgetMs) for Settings → Config. The minted signals flow through the existing slow-op report kind and the boot trace lane — no new renderer.",
  contributions: [ConfigV2.WebRegister({ descriptor: bootMonitorConfig })],
} satisfies PluginDefinition;
