import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  commitDeltaResource,
  commitsGraphResource,
} from "./internal/resources";

export default {
  id: "conversation-commits-graph",
  name: "Conversation: Commits Graph",
  description:
    "Toolbar chip showing commits ahead/behind main; opens a side pane with the chain of commits between merge-base and HEAD.",
  contributions: [Resource.Declare(commitDeltaResource), Resource.Declare(commitsGraphResource)],
} satisfies ServerPluginDefinition;
