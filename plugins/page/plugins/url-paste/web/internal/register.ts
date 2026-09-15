import { registerBlockTextExtension } from "@plugins/page/plugins/editor/web";
import { UrlPastePlugin } from "../components/url-paste-plugin";

// Side-effect: teach every block text editor to turn a bare URL pasted at the
// caret (or dropped into an empty block) into a link, and offer Keep as link /
// Mention / Bookmark / Embed beside it. Plugin-only — it contributes no inline
// node (the link is an ordinary LinkNode), just the paste/drop handlers + menu.
registerBlockTextExtension({
  id: "url-paste",
  Plugin: UrlPastePlugin,
});
