import { registerNodeExtension } from "@plugins/primitives/plugins/text-editor/web";
import {
  UI_CONTEXT_RE,
  parseUiContext,
  serializeUiContext,
} from "../../core";
import {
  UiContextNode,
  $createUiContextNode,
  $isUiContextNode,
} from "./ui-context-node";

registerNodeExtension({
  node: UiContextNode,
  serializeNode: (n) =>
    $isUiContextNode(n) ? serializeUiContext(n.getMeta()) : null,
  deserializePattern: UI_CONTEXT_RE,
  createNodeFromMatch: (m) => {
    const meta = parseUiContext(m);
    return meta ? $createUiContextNode(meta) : null;
  },
});
