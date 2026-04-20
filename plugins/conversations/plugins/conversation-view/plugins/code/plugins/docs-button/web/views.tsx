import type { RightPaneDescriptor } from "@plugins/conversations/plugins/conversation-view/web";
import { DocsPane } from "./components/docs-pane";

export const DOCS_PANE_ID = "code.docs-pane";

export function docsRightPane(): RightPaneDescriptor {
  return { id: DOCS_PANE_ID, component: DocsPane };
}

const MD_RE = /\.mdx?$/i;

export function isDocFile(path: string): boolean {
  return MD_RE.test(path);
}
