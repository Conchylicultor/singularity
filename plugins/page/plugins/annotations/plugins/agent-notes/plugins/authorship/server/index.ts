import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { agentNotesAuthorsServerResource } from "./internal/resource";
// Boot-fatal assertion that the FK cascade really reclaims this table's rows.
import "./internal/growth-bound";

export { _pageBlocksAgentAuthors } from "./internal/tables";
export { recordAgentNotesAuthor } from "./internal/mutations";
export { agentNotesAuthorsServerResource } from "./internal/resource";

export default {
  description:
    "Owns page_blocks_agent_authors: which conversations wrote into an agent-notes card. A race-free (block, conversation) link table, the recordAgentNotesAuthor stamp any writer calls, and the per-card keyed live read behind the card's provenance popover.",
  contributions: [Resource.Declare(agentNotesAuthorsServerResource)],
} satisfies ServerPluginDefinition;
