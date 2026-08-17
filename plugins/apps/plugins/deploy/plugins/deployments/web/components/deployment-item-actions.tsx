import type { ReactElement } from "react";
import { MdDelete, MdRocketLaunch, MdTune } from "react-icons/md";
import {
  defineItemActions,
  type ItemActionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  EndpointError,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import { openDialog } from "@plugins/primitives/plugins/imperative-dialog/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useServerHealth } from "@plugins/apps/plugins/deploy/plugins/health/web";
import {
  deleteDeployment,
  deployRunsResource,
  runDeployment,
  type Deployment,
} from "../../core";
import { runningOnServer } from "../internal/deploy-runs";
import { DeleteDeploymentDialog } from "./delete-deployment-dialog";

/** Trailing-action slot for the Deployments list rows. */
export const DeploymentItemActions = defineItemActions<Deployment>(
  "deploy.deployments.item-actions",
);

/**
 * Why a verb cannot be launched right now, as the sentence to put in the tooltip
 * — or `null` when it can.
 *
 * Two kinds of reason, and both are facts this app already holds: a run is
 * already in flight on the box, or the probe has not established a platform for
 * it (never checked / last check failed / reported something no release targets —
 * spelled out separately rather than folded into one null test).
 *
 * The probe ones deliberately MIRROR the CLI's own refusals rather than replacing
 * them: the platform a deploy needs is discovered by that probe, so a button that
 * would certainly be refused says so before it is pressed. Every other refusal
 * stays the CLI's, reported after the fact on the row.
 *
 * Exported because the deployment pane's Deploy button gates on the same facts.
 * Sharing the hook rather than the sentences is the point: a row tooltip and the
 * pane's primary action must never disagree about why something is blocked.
 */
export function useBlockedReason(deployment: Deployment): string | null {
  const runsResult = useResource(deployRunsResource);
  const health = useServerHealth(deployment.serverId);

  // Gated, not collapsed to an empty map: until the run state has arrived we do
  // not know whether something is already running on this box, and launching a
  // second converge into that gap is exactly what the exclusivity rule forbids.
  if (runsResult.pending) return "Loading deploy state…";

  const busy = runningOnServer(runsResult.data, deployment.serverId);
  if (busy) {
    // "The <verb>", never "A <verb>": the verb set now includes `update`, and an
    // indefinite article picked by hand is a sentence that reads wrong the first
    // time someone adds a vowel.
    return busy.deploymentId === deployment.id
      ? `The ${busy.verb} of this deployment is still running.`
      : `The ${busy.verb} of "${busy.compositionId}" is running on this server.`;
  }
  if (!health) {
    return "This server has never been verified — run Verify connection first.";
  }
  if (!health.ok) {
    return "This server failed its last reachability check — run Verify connection again.";
  }
  if (!health.platform) {
    return "This server reported a platform no release targets, so no bundle can be built for it.";
  }
  return null;
}

/**
 * Launch `converge` — make the host serve this composition (run user, dir
 * layout, `env`, Caddy, systemd unit, firewall). Idempotent: re-running repairs
 * drift, which is why it needs no confirmation.
 */
export function ConvergeAction({
  row,
}: ItemActionProps<Deployment>): ReactElement {
  const blocked = useBlockedReason(row);
  const run = useEndpointMutation(runDeployment);
  return (
    <IconButton
      icon={MdTune}
      label="Converge"
      tooltip={blocked ?? `Converge ${row.compositionId} on this server`}
      disabled={blocked !== null || run.isPending}
      onClick={(e) => {
        e.stopPropagation();
        run.mutate({ params: { id: row.id }, body: { verb: "converge" } });
      }}
    />
  );
}

/**
 * Launch `ship` — upload the `latest` bundle and activate it behind the CLI's
 * health gate. No release picker: the gate, the platform assertion and the
 * bundle discovery all live in the CLI, and `latest` is what it defaults to.
 */
export function ShipAction({ row }: ItemActionProps<Deployment>): ReactElement {
  const blocked = useBlockedReason(row);
  const run = useEndpointMutation(runDeployment);
  return (
    <IconButton
      icon={MdRocketLaunch}
      label="Ship"
      tooltip={
        blocked ?? `Ship the latest ${row.compositionId} bundle to this server`
      }
      disabled={blocked !== null || run.isPending}
      onClick={(e) => {
        e.stopPropagation();
        run.mutate({ params: { id: row.id }, body: { verb: "ship" } });
      }}
    />
  );
}

/** Forget the deployment record. The converged host is left untouched. */
export function DeleteDeploymentAction({
  row,
}: ItemActionProps<Deployment>): ReactElement {
  const remove = useEndpointMutation(deleteDeployment);
  return (
    <IconButton
      icon={MdDelete}
      label="Delete deployment"
      disabled={remove.isPending}
      onClick={(e) => {
        e.stopPropagation();
        // Fire-and-forget: returning the openDialog promise would pend the
        // button for the dialog's whole open lifetime rather than the delete's.
        void openDialog(
          (close) => (
            <DeleteDeploymentDialog
              deployment={row}
              onCancel={close}
              onConfirm={() =>
                remove
                  .mutateAsync({ params: { id: row.id } })
                  .then(() => close())
                  .catch((err: unknown) => {
                    // Expected failure — the global toast already reported it;
                    // keep the dialog open so the user can retry or cancel.
                    if (err instanceof EndpointError) return;
                    throw err;
                  })
              }
            />
          ),
          { size: "sm" },
        );
      }}
    />
  );
}
