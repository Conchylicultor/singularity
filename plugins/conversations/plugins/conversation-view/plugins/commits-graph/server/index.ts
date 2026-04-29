import type { ServerPluginDefinition } from "@server/types";
import {
  commitDeltaResource,
  commitsGraphResource,
} from "./internal/resources";

export default {
  id: "conversation-commits-graph",
  name: "Conversation: Commits Graph",
  description:
    "Toolbar chip showing commits ahead/behind main; opens a side pane with the chain of commits between merge-base and HEAD.",
  resources: [commitDeltaResource, commitsGraphResource],
} satisfies ServerPluginDefinition;
