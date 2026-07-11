import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DocsPane } from "./components/docs-pane";

export const convDocsPane = Pane.define({
  id: "conv-docs",
  segment: "docs",
  component: DocsPane,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { history: false, promote: false },
});

const MD_RE = /\.mdx?$/i;

export function isDocFile(path: string): boolean {
  return MD_RE.test(path);
}
