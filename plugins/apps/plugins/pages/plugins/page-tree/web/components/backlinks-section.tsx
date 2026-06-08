import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Backlinks } from "@plugins/page/plugins/links/web";
import { pageDetailPane } from "../panes";

// "Linked from" section contributed into PageDetail.Section. The slot passes
// `{ pageId }`; navigation is injected so the pure Backlinks domain
// component stays decoupled from this app's panes.
export function BacklinksSection({ pageId }: { pageId: string }) {
  const openPane = useOpenPane();
  return (
    <Backlinks
      documentId={pageId}
      onOpenPage={(id) => openPane(pageDetailPane, { pageId: id }, { mode: "swap" })}
    />
  );
}
