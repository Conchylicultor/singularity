import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { commitsGraphResource } from "./internal/resources";

export default {
  description:
    "Toolbar chip showing commits ahead/behind main; opens a side pane with the chain of commits between merge-base and HEAD.",
  contributions: [Resource.Declare(commitsGraphResource)],
} satisfies ServerPluginDefinition;
