import type { ReactElement } from "react";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { BuildPopoverContent } from "./components/build-popover-content";
import { BuildDetail } from "./slots";

export const buildPane = Pane.define({
  id: "build",
  segment: "build",
  component: BuildPaneBody,
});

export const buildDetailPane = Pane.define({
  id: "build-detail",
  defaultAncestors: [buildPane],
  segment: "r/:runId",
  component: BuildDetailBody,
  width: 480,
});

function BuildPaneBody(): ReactElement {
  const openPane = useOpenPane();
  const selectedRunId = buildDetailPane.useChainEntry()?.params.runId;

  return (
    <PaneChrome pane={buildPane} title="Build">
      <BuildPopoverContent
        variant="pane"
        selectedRunId={selectedRunId}
        onRunClick={(runId) => openPane(buildDetailPane, { runId }, { mode: "push" })}
      />
    </PaneChrome>
  );
}

function BuildDetailBody(): ReactElement {
  const { runId } = buildDetailPane.useParams();

  return (
    <PaneChrome pane={buildDetailPane} title="Build Run">
      <BuildDetail.Host runId={runId} />
    </PaneChrome>
  );
}
