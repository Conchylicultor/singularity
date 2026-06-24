import type { ReactElement } from "react";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { ReleaseLauncher } from "./components/release-launcher";
import { ReleaseDetail } from "./slots";

export const releasePane = Pane.define({
  id: "release",
  segment: "release",
  component: ReleasePaneBody,
  width: 380,
});

export const releaseDetailPane = Pane.define({
  id: "release-detail",
  defaultAncestors: [releasePane],
  // Segments are GLOBALLY unique across all panes (not path-scoped): build's
  // run-detail already owns "r/:runId", so the release run-detail uses "rel/…".
  segment: "rel/:runId",
  component: ReleaseDetailBody,
  width: 480,
  resolve: false,
});

function ReleasePaneBody(): ReactElement {
  const openPane = useOpenPane();
  const selectedRunId = releaseDetailPane.useRouteEntry()?.params.runId;

  return (
    <PaneChrome pane={releasePane} title="Release">
      <ReleaseLauncher
        selectedRunId={selectedRunId}
        onRunClick={(runId) => openPane(releaseDetailPane, { runId }, { mode: "push" })}
      />
    </PaneChrome>
  );
}

function ReleaseDetailBody(): ReactElement | null {
  const { runId } = releaseDetailPane.useParams();
  if (!runId) return null;

  return (
    <PaneChrome pane={releaseDetailPane} title="Release Run">
      <ReleaseDetail.Host runId={runId} />
    </PaneChrome>
  );
}
