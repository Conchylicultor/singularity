import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { reviewConfig } from "../shared/config";

export default {
  description:
    "File-by-file code review section for the review pane.",
  contributions: [
    ConfigV2.Register({ descriptor: reviewConfig }),
  ],
} satisfies ServerPluginDefinition;
