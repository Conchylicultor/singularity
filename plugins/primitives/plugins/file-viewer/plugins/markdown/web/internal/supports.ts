import { fileExtension } from "@plugins/primitives/plugins/file-viewer/core";

const MD_EXT = new Set(["md", "mdx", "markdown"]);

export function supportsMarkdown(path: string): "native" | false {
  return MD_EXT.has(fileExtension(path)) ? "native" : false;
}
