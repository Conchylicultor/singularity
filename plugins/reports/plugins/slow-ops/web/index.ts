import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { slowOpConfig } from "../shared/config";
import { SlowOpCollector } from "./components/slow-op-collector";

export default {
  collapsed: true,
  description:
    "Records slow client operations (page load, element appearance) as deduped slow-op reports.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: slowOpConfig }),
    Core.Root({ component: SlowOpCollector }),
  ],
} satisfies PluginDefinition;
