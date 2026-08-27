import { registerNodeExtension } from "@plugins/primitives/plugins/text-editor/web";
import { imageWebNode } from "./image-node";
import { ATTACHMENT_MARKDOWN_RE } from "./markdown";

// Side-effect: teach the text editor about pasted attachment images. The token
// format and the fields it carries are declared once in `core/node.ts`, so the
// markdown this writes and the markdown it reads back cannot disagree.
registerNodeExtension({
  id: "paste-image",
  node: imageWebNode,
  pattern: ATTACHMENT_MARKDOWN_RE,
});
