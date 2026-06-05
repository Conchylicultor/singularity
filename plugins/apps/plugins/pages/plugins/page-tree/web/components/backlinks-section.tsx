import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Backlinks } from "@plugins/page/plugins/links/web";
import { pageDetailPane } from "../panes";

// "Linked from" section contributed into PageDetail.Section. The slot passes
// `{ documentId }`; navigation is injected so the pure Backlinks domain
// component stays decoupled from this app's panes.
export function BacklinksSection({ documentId }: { documentId: string }) {
  const openPane = useOpenPane();
  return (
    <Backlinks
      documentId={documentId}
      onOpenPage={(id) => openPane(pageDetailPane, { pageId: id }, { mode: "swap" })}
    />
  );
}
