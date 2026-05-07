import type { PluginDefinition } from "@core";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import {
  useFileLinksTransform,
  useFileLinksCodeHandler,
  useFileLinksComponents,
} from "./internal/md-extension";

export { FILE_PATH_RE, URL_RE, parseFileLinks } from "./internal/parse";
export type { FileLinkSegment } from "./internal/parse";
export { FileLinkText } from "./internal/file-link-text";
export type { FileLinkTextProps } from "./internal/file-link-text";
export { linkifyChildren } from "./internal/linkify-children";
export { FileOpenContext, useFileOpen } from "./internal/file-open-context";

export default {
  id: "file-links",
  name: "File Links",
  description:
    "Parses inline file paths (e.g. `research/foo.md`) in plain text and renders them as clickable buttons that fire onFileOpen. Exposes <FileLinkText/>, parseFileLinks(), and linkifyChildren() for use inside ReactMarkdown component overrides.",
  contributions: [
    Markdown.Extension({
      id: "file-links",
      priority: 200,
      useTransform: useFileLinksTransform,
      useCodeHandler: useFileLinksCodeHandler,
      useComponents: useFileLinksComponents,
    }),
  ],
} satisfies PluginDefinition;
