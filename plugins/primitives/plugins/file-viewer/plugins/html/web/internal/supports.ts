import { fileExtension } from "@plugins/primitives/plugins/file-viewer/core";

const HTML_EXT = new Set(["html", "htm", "xhtml"]);

export function supportsHtml(path: string): "native" | false {
  return HTML_EXT.has(fileExtension(path)) ? "native" : false;
}
