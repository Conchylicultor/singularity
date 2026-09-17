import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { PageReference } from "@plugins/page/plugins/page-reference/web";
import {
  instructionsPageDecoration,
  instructionsPageInsertAction,
} from "./internal/contributions";

export default {
  description:
    "Instructions pages in the page editor: a sub-page whose data marks it `instructions: true` is tinted with the instructions card's wash wherever it is referenced (its row in the parent page, the Pages sidebar), carries a Global chip when it reaches every conversation, and can be made from the caret's line with `/instructions page`. Declares no block type — the page is an ordinary `page` row.",
  contributions: [
    PageReference.Decoration(instructionsPageDecoration),
    Editor.InsertAction(instructionsPageInsertAction),
  ],
} satisfies PluginDefinition;
