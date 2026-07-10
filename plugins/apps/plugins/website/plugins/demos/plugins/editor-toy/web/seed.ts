import type { SerializedBlock } from "@plugins/page/plugins/editor/core";

/**
 * The insertable-type allowlist for the demo palette: the text/document block
 * family only. Attachment/media blocks (image, video, audio, file, bookmark,
 * embed, page-link) are excluded — they need a server to store their blobs,
 * which the in-memory demo deliberately has no access to. Every id is a real
 * registered `Editor.Block` `type`.
 */
export const TEXT_BLOCKS = [
  "text",
  "heading-1",
  "heading-2",
  "heading-3",
  "bulleted-list",
  "numbered-list",
  "to-do",
  "toggle",
  "quote",
  "callout",
  "code-block",
  "divider",
  "equation",
] as const;

/** A plain-text block. `data.text` accepts a bare string (coerced to runs). */
function text(type: string, value: string): SerializedBlock {
  return { type, data: { text: value }, expanded: false, children: [] };
}

/**
 * An equin-flavored seed document for the landing-page editor demo. Nothing here
 * persists — it is materialized fresh into the in-memory store on every mount
 * (and on Reset), so visitors always start from this doc.
 */
export const SEED_DOC: SerializedBlock[] = [
  text("heading-1", "Try the editor"),
  text(
    "text",
    "This is a real block editor — the same one that powers pages in equin. Type below, press Enter to split, or hit / for the block menu.",
  ),
  text("heading-2", "What you can do"),
  {
    type: "to-do",
    data: { text: "Type a line and press Enter", checked: true },
    expanded: false,
    children: [],
  },
  {
    type: "to-do",
    data: { text: "Press / to open the block menu", checked: false },
    expanded: false,
    children: [],
  },
  {
    type: "to-do",
    data: { text: "Drag a block by its handle to reorder", checked: false },
    expanded: false,
    children: [],
  },
  {
    type: "callout",
    data: {
      text: "Everything here is in-memory — nothing you type is saved or sent anywhere.",
      icon: null,
      iconSvgNodes: null,
      color: "info",
    },
    expanded: false,
    children: [],
  },
];
