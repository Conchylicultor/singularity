import { Pane } from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { DocsPane } from "./components/docs-pane";

export const convDocsPane = Pane.define({
  id: "conv-docs",
  app: agentManagerApp,
  segment: "docs",
  component: DocsPane,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { history: false, promote: false },
});

const MD_RE = /\.mdx?$/i;

export function isDocFile(path: string): boolean {
  return MD_RE.test(path);
}
