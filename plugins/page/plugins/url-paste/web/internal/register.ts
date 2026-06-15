import { registerBlockTextExtension } from "@plugins/page/plugins/editor/web";
import { UrlPastePlugin } from "../components/url-paste-plugin";

// Side-effect: teach every block text editor to intercept a bare-URL paste into
// an empty text block and offer Bookmark / Embed / Plain link. Plugin-only — it
// contributes no inline node, just the paste handler + inline menu.
registerBlockTextExtension({
  id: "url-paste",
  Plugin: UrlPastePlugin,
});
