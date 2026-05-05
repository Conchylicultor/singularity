import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { DocsPane } from "./components/docs-pane";

export const convDocsPane = Pane.define({
  id: "conv-docs",
  after: [conversationPane],
  segment: "docs",
  component: DocsPane,
  chrome: { history: false },
});

const MD_RE = /\.mdx?$/i;

export function isDocFile(path: string): boolean {
  return MD_RE.test(path);
}
