import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  CursorAnchoredMenu,
  type CursorAnchor,
  type CursorAnchoredMenuProps,
} from "./internal/cursor-anchored-menu";

export default {
  description:
    "Cursor-anchored DropdownMenu: a body-portaled zero-size anchor pinned at an (x,y) point, so position:fixed resolves against the viewport even inside a transformed ancestor.",
  contributions: [],
} satisfies PluginDefinition;
