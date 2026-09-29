import type { ReactElement } from "react";
import {
  Pane,
  PaneChrome,
  resolveRow,
  type ResolveResult,
} from "@plugins/primitives/plugins/pane/web";
import { useLiveRow } from "@plugins/network/plugins/live/web";
import { deployApp } from "@plugins/apps/plugins/deploy/plugins/shell/core";
import { deploymentDetailRoute, deployments } from "../core";
import { DeploymentDetail } from "./slots";

function useResolveDeployment({
  deploymentId,
}: {
  deploymentId: string;
}): ResolveResult {
  return resolveRow(useLiveRow(deployments, deploymentId));
}

/** The deployment's composition — the only name a person recognises it by. */
function useDeploymentTitle({
  deploymentId,
}: {
  deploymentId: string;
}): string | undefined {
  const row = useLiveRow(deployments, deploymentId);
  // Loading or failed: no title of its own yet; the chrome's title stands in.
  if (row.status === "loading" || row.status === "error") return undefined;
  return row.found ? row.row.compositionId : undefined;
}

/**
 * One deployment, drilled into from the server page's list.
 *
 * The list used to be the app's one dead end: the deploy surface — a primary
 * action, a phase report, what is built and how it relates to HEAD, the public
 * URLs, and the log — does not fit a row's rigid trailing region (already three
 * action buttons and a run chip), so the row navigates here instead.
 *
 * `titleOwner` is deliberately NOT set — the server page keeps the tab title; a
 * deployment is a drill-in under it, not a new main surface.
 */
export const deploymentDetailPane = Pane.define({
  route: deploymentDetailRoute,
  app: deployApp,
  component: DeploymentDetailBody,
  width: 460,
  useResolve: useResolveDeployment,
  title: { useText: useDeploymentTitle },
});

function DeploymentDetailBody(): ReactElement {
  const { deploymentId } = deploymentDetailPane.useParams();
  return (
    <PaneChrome pane={deploymentDetailPane}>
      <DeploymentDetail.Host deploymentId={deploymentId} />
    </PaneChrome>
  );
}
