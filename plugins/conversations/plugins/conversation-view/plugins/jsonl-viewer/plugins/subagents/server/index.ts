import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { subagentActivityResource } from "./internal/activity-resource";
import { subagentTranscriptResource } from "./internal/transcript-resource";

export default {
  description:
    "Discovers a conversation's sub-agents from the `subagents/` directory beside each of its anchored session transcripts, and serves two live resources: what every sub-agent is doing right now (one bounded tail read per change), and one sub-agent's own transcript, parsed by the same reader as the main conversation.",
  contributions: [
    Resource.Declare(subagentActivityResource),
    Resource.Declare(subagentTranscriptResource),
  ],
} satisfies ServerPluginDefinition;
