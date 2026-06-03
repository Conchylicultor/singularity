import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { floatingBarConfig } from "../shared/config";

export default {
  name: "Floating Bar",
  description:
    "Floating action bar (top-right) surfacing the main toolbar's actions in every app. Collapses to a status icon; expands on hover.",
  contributions: [
    ConfigV2.Register({ descriptor: floatingBarConfig }),
  ],
} satisfies ServerPluginDefinition;
