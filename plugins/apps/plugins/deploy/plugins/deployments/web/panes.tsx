import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { serverDetailPane } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { deployApp } from "@plugins/apps/plugins/deploy/plugins/shell/core";
import { deploymentsResource } from "../core";
import { DeploymentDetail } from "./slots";

function useResolveDeployment({ deploymentId }: { deploymentId: string }) {
  const result = useResource(deploymentsResource);
  if (result.pending) return { pending: true, found: false };
  return {
    pending: false,
    found: result.data.some((d) => d.id === deploymentId),
  };
}

/** The deployment's composition — the only name a person recognises it by. */
function useDeploymentTitle({
  deploymentId,
}: {
  deploymentId: string;
}): string | undefined {
  const result = useResource(deploymentsResource);
  if (result.pending) return undefined;
  return result.data.find((d) => d.id === deploymentId)?.compositionId;
}

/**
 * One deployment, drilled into from the server page's list.
 *
 * The list used to be the app's one dead end: the deploy surface — a primary
 * action, a phase report, what is built and how it relates to HEAD, the public
 * URLs, and the log — does not fit a row's rigid trailing region (already three
 * `RowActionButton`s and a run chip), so the row navigates here instead.
 *
 * `titleOwner` is deliberately NOT set — the server page keeps the tab title; a
 * deployment is a drill-in under it, not a new main surface.
 */
export const deploymentDetailPane = Pane.define({
  id: "deploy-deployment-detail",
  app: deployApp,
  defaultAncestors: [serverDetailPane],
  // Segments are GLOBALLY unique across all panes after param-name erasure —
  // `d/:sha` is the diff pane's, so a deployment uses `dep/…`.
  segment: "dep/:deploymentId",
  component: DeploymentDetailBody,
  width: 460,
  resolve: useResolveDeployment,
  useTitle: useDeploymentTitle,
});

function DeploymentDetailBody(): ReactElement {
  const { deploymentId } = deploymentDetailPane.useParams();
  return (
    <PaneChrome pane={deploymentDetailPane}>
      <DeploymentDetail.Host deploymentId={deploymentId} />
    </PaneChrome>
  );
}
