import { registerBlockTextExtension } from "@plugins/page/plugins/editor/web";
import { LinkHoverPlugin } from "../components/link-hover-plugin";

// Side-effect: give every block text editor the link hover card — rest the
// pointer on a link to see its URL, copy it, or edit / remove it. Plugin-only:
// it contributes no inline node (links are Lexical's own `LinkNode`), just the
// hover tracking + the card.
registerBlockTextExtension({
  id: "link-hover",
  Plugin: LinkHoverPlugin,
});
