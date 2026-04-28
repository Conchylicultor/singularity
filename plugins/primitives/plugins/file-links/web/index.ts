import type { PluginDefinition } from "@core";

export { FILE_PATH_RE, parseFileLinks } from "./internal/parse";
export type { FileLinkSegment } from "./internal/parse";
export { FileLinkText } from "./internal/file-link-text";
export type { FileLinkTextProps } from "./internal/file-link-text";
export { linkifyChildren } from "./internal/linkify-children";

export default {
  id: "file-links",
  name: "File Links",
  description:
    "Parses inline file paths (e.g. `research/foo.md`) in plain text and renders them as clickable buttons that fire onFileOpen. Exposes <FileLinkText/>, parseFileLinks(), and linkifyChildren() for use inside ReactMarkdown component overrides.",
  contributions: [],
} satisfies PluginDefinition;
