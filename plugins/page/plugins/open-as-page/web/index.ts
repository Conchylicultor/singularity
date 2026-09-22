import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { OpenAsPageItem } from "./components/open-as-page-item";

export default {
  description:
    "Open as page, in the block ⋮⋮ menu: opens one block — a card, a heading with its nested lines, a toggle — as a page of its own beside the current one, editable and saving to the page that holds it. Contributed into Editor.BlockMenuItem, and absent where the host declared no PageNavigation.openBlock, on a sub-page row (which already opens), and on the block a view is already zoomed into.",
  contributions: [
    Editor.BlockMenuItem({ id: "open-as-page", component: OpenAsPageItem }),
  ],
} satisfies PluginDefinition;
