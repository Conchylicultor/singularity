import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { PageReference } from "@plugins/page/plugins/page-reference/web";
import {
  agentPageDecoration,
  agentPageInsertAction,
} from "./internal/contributions";

export default {
  description:
    "Agent-authored pages in the page editor: a sub-page whose data marks it `author: \"agent\"` is tinted with the agent-notes wash wherever it is referenced (its row in the parent page, the Pages sidebar), carries a chip naming the conversation that created it, and can be made from the caret's line with `/agent-page` (the line's other words become its title). Declares no block type — the page is an ordinary `page` row.",
  contributions: [
    PageReference.Decoration(agentPageDecoration),
    Editor.InsertAction(agentPageInsertAction),
  ],
} satisfies PluginDefinition;
