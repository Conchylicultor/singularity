import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConversationArtifacts } from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/web";
import { extractPageHits, PAGE_KIND } from "./internal/extract";
import { PageSection, PAGE_ICON } from "./components/page-section";

export default {
  description:
    "Singularity pages as a conversation artifact: every page the transcript's edit_page / write_agent_note / read_page calls acted on, listed as a row that opens the page beside the chat. A write edited it — created, when the text it wrote mints an <agent-page> — and a read referenced it. Keyed by the page id the apply report names, falling back to the block the call was scoped to; titles come from the live pages list.",
  contributions: [
    ConversationArtifacts.Kind({
      id: PAGE_KIND,
      label: "Pages",
      icon: PAGE_ICON,
      extract: extractPageHits,
      Section: PageSection,
    }),
  ],
} satisfies PluginDefinition;
