import { registerBlockTextExtension } from "@plugins/page/plugins/editor/web";
import { MENTION_TOKEN_PATTERN, dateToken, reminderToken } from "../../core";
import {
  $createDateMentionNode,
  $isDateMentionNode,
  DateMentionNode,
} from "../components/date-mention-node";
import { InlineDatePlugin } from "../components/inline-date-plugin";

// Side-effect: teach every block text editor about inline date mentions — the
// node, how to (de)serialize its `[[date:<iso>]]` / `[[reminder:<id>:<iso>]]`
// token (one combined pattern, branched by capture group), and the `@` typeahead.
registerBlockTextExtension({
  id: "date-mention",
  node: DateMentionNode,
  deserializePattern: MENTION_TOKEN_PATTERN,
  createNodeFromMatch: (m) =>
    m[1]
      ? $createDateMentionNode(m[1]) // [[date:<iso>]]
      : $createDateMentionNode(m[3]!, m[2]!), // [[reminder:<id>:<iso>]]
  serializeNode: (n) => {
    if (!$isDateMentionNode(n)) return null;
    const id = n.getReminderId();
    return id !== null ? reminderToken(id, n.getIso()) : dateToken(n.getIso());
  },
  Plugin: InlineDatePlugin,
});
