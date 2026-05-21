import { Pane, type } from "@plugins/primitives/plugins/pane/web";
import { DocsPane } from "./components/docs-pane";

export const convDocsPane = Pane.define({
  id: "conv-docs",
  segment: "docs",
  input: type<{ convId: string }>(),
  component: DocsPane,
  chrome: { history: false },
});

const MD_RE = /\.mdx?$/i;

export function isDocFile(path: string): boolean {
  return MD_RE.test(path);
}
