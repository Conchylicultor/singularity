import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { reviewConfig } from "../shared/config";

export default {
  name: "Review: Code Review",
  description:
    "File-by-file code review section for the review pane.",
  contributions: [
    ConfigV2.Register({ descriptor: reviewConfig }),
  ],
} satisfies ServerPluginDefinition;
