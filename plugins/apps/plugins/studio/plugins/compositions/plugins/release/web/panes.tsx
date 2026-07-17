import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { compositionDetailPane } from "@plugins/apps/plugins/studio/plugins/compositions/web";
import { ReleaseDetail } from "./slots";

export const releaseDetailPane = Pane.define({
  id: "release-detail",
  defaultAncestors: [compositionDetailPane],
  // Segments are GLOBALLY unique across all panes (not path-scoped): build's
  // run-detail already owns "r/:runId", so the release run-detail uses "rel/…".
  segment: "rel/:runId",
  component: ReleaseDetailBody,
  width: 480,
  resolve: false,
});

function ReleaseDetailBody(): ReactElement | null {
  const { runId } = releaseDetailPane.useParams();
  if (!runId) return null;

  return (
    <PaneChrome pane={releaseDetailPane} title="Release Run">
      <ReleaseDetail.Host runId={runId} />
    </PaneChrome>
  );
}
