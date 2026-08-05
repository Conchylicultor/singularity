import { useMemo, type ReactElement, type ReactNode } from "react";
import { MdAdd } from "react-icons/md";
import {
  DataView,
  defineDataView,
  type CreateOption,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { openDialog } from "@plugins/primitives/plugins/imperative-dialog/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useServerHealth } from "@plugins/apps/plugins/deploy/plugins/health/web";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import {
  deploymentsResource,
  deployRunsResource,
  type Deployment,
  type DeployRun,
} from "../../core";
import { RUN_STATE_OPTIONS, runStateOf } from "../internal/deploy-runs";
import { deploymentDetailPane } from "../panes";
import { Deployments } from "../slots";
import { DeploymentItemActions } from "./deployment-item-actions";
import { AddDeploymentDialog } from "./add-deployment-dialog";
import { RunCell, RunFailureNotice } from "./run-cell";

const DEPLOYMENTS_VIEW = defineDataView("deploy.deployments");

/**
 * The Deployments section of a server's page: which compositions this server
 * serves, and the two verbs over each.
 *
 * A deployment is `(composition × server) → { hostnames, loopbackPort }`, so on
 * this pane the server half is fixed and only the composition and its URL vary.
 * The row carries only what a person scans down the list — the composition, the
 * last run, and (contributed) the release state; the record's editable fields and
 * the derived install names live in the row's own pane, one click away.
 *
 * The two resources are gated together (`useCombinedResources`), so the list and
 * the run chips can never render from a half-loaded snapshot — a deployment
 * showing "not run" only because the run map had not arrived would be exactly
 * the wrong-state-while-loading bug.
 *
 * Contributed as a `ServerDetail` section, so the card, its "Deployments" title
 * and its collapse state all belong to the host.
 *
 * There is deliberately no log panel here any more. The deployment pane's Output
 * section subscribes to the same `deploy` channel, and a second live
 * subscription to one channel — under a heading, on a page that no longer hosts
 * the actions — was duplication rather than a view. Nothing is lost: the channel
 * replays its ring buffer on subscribe, so the pane shows the last run's tail on
 * open, and `RunFailureNotice` still surfaces a failed run here with the CLI's
 * own words.
 */
export function DeploymentsSection({ server }: { server: Server }): ReactElement {
  const serverId = server.id;
  const loaded = useCombinedResources({
    deployments: useResource(deploymentsResource),
    runs: useResource(deployRunsResource),
  });
  const health = useServerHealth(serverId);

  return (
    // No `pane-gutter-flush` here: the `ServerDetail` host already declares the
    // pane gutter spent for every section body, generically, so a DataView
    // dropped into one is correctly inset with zero per-section code.
    <Stack gap="md">
      <Text as="p" variant="caption" tone="muted">
        {health?.ok && health.platform
          ? `This server accepts ${health.platform} bundles.`
          : "This server has no verified platform yet — run Verify connection above; the platform a deploy needs is discovered by that probe."}
      </Text>
      {matchResource(loaded, {
        // The DataView owns the loading render (its own skeleton) and keeps its
        // chrome stable, so the "nothing is deployed" empty state always means
        // confirmed-empty. Same shape as the servers list next door.
        pending: () => <DeploymentsBody serverId={serverId} rows={[]} runs={{}} loading />,
        error: () => <DeploymentsBody serverId={serverId} rows={[]} runs={{}} loading />,
        ready: ({ deployments, runs }) => (
          <DeploymentsBody
            serverId={serverId}
            rows={deployments.filter((d) => d.serverId === serverId)}
            runs={runs}
            loading={false}
          />
        ),
      })}
    </Stack>
  );
}

function DeploymentsBody({
  serverId,
  rows,
  runs,
  loading,
}: {
  serverId: string;
  rows: readonly Deployment[];
  runs: Record<string, DeployRun>;
  loading: boolean;
}): ReactNode {
  const openPane = useOpenPane();
  // The selection is the ROUTE, never local state: the highlighted row and the
  // open column are then the same fact, and a deep link paints correctly.
  const selectedId = deploymentDetailPane.useRouteEntry()?.params.deploymentId;

  const fields = useMemo<FieldDef<Deployment>[]>(
    () => [
      {
        id: "composition",
        label: "Composition",
        type: "text",
        primary: true,
        value: (d) => d.compositionId,
      },
      {
        id: "run",
        label: "Last run",
        type: "enum",
        options: RUN_STATE_OPTIONS,
        value: (d) => runStateOf(runs[d.id]),
        cell: (d) => <RunCell run={runs[d.id]} />,
        // Trailing, so the list row keeps it out of the truncating subtitle line.
        align: "end",
      },
      // The `release` column is NOT here: it is contributed through
      // `Deployments.Fields` by whichever plugin owns the release pipeline, so
      // this list never names that feature (the `Servers.Fields` precedent).
    ],
    [runs],
  );

  const creators: CreateOption[] = [
    {
      id: "add",
      label: "Add deployment",
      icon: <MdAdd />,
      onSelect: () => {
        // Fire-and-forget: awaiting `openDialog` would hold the toolbar's busy
        // flag for the dialog's whole open lifetime.
        void openDialog((close) => (
          <AddDeploymentDialog serverId={serverId} existing={rows} close={close} />
        ));
      },
    },
  ];

  return (
    <>
      <RunFailureNotice
        runs={Object.values(runs).filter((r) => r.serverId === serverId)}
      />
      <DataView<Deployment>
        rows={rows}
        fields={fields}
        fieldExtensions={Deployments.Fields}
        rowKey={(d) => d.id}
        views={["list", "table"]}
        defaultView="list"
        storageKey={DEPLOYMENTS_VIEW}
        loading={loading}
        itemActions={DeploymentItemActions}
        creators={creators}
        selectedRowId={selectedId}
        onRowActivate={(d) =>
          openPane(
            deploymentDetailPane,
            { deploymentId: d.id },
            { mode: "push", side: "right" },
          )
        }
        emptyState="Nothing is deployed on this server yet."
      />
    </>
  );
}
