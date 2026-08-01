import { useMemo, type ReactElement, type ReactNode } from "react";
import { MdAdd, MdTerminal } from "react-icons/md";
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
import { SectionCard } from "@plugins/primitives/plugins/section-card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useServerHealth } from "@plugins/apps/plugins/deploy/plugins/health/web";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import {
  deploymentsResource,
  deployRunsResource,
  deriveInstall,
  updateDeployment,
  type Deployment,
  type DeployRun,
} from "../../core";
import { RUN_STATE_OPTIONS, runStateOf } from "../internal/deploy-runs";
import { DeploymentItemActions } from "./deployment-item-actions";
import { AddDeploymentDialog } from "./add-deployment-dialog";
import { DeployLogPanel } from "./deploy-log-panel";
import { RunCell, RunFailureNotice } from "./run-cell";

const DEPLOYMENTS_VIEW = defineDataView("deploy.deployments");

/**
 * The Deployments section of a server's page: which compositions this server
 * serves, and the two verbs over each.
 *
 * A deployment is `(composition × server) → { hostnames, loopbackPort }`, so on
 * this pane the server half is fixed and only the composition and its URL vary.
 * Three of the fields are the record; the rest are **derived** from the
 * composition name (`core/derive.ts`) and carry no `onEdit`, which is what makes
 * them read-only by construction rather than by convention — there is no second
 * place to author an install dir or a run user.
 *
 * The two resources are gated together (`useCombinedResources`), so the list and
 * the run chips can never render from a half-loaded snapshot — a deployment
 * showing "not run" only because the run map had not arrived would be exactly
 * the wrong-state-while-loading bug.
 *
 * Contributed as a `ServerDetail` section, so the card, its "Deployments" title
 * and its collapse state all belong to the host. The `SectionCard` below is NOT
 * that card: "Deploy output" is a sub-panel *inside* this section.
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
      <SectionCard title="Deploy output" icon={<MdTerminal />}>
        <DeployLogPanel />
      </SectionCard>
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
  const update = useEndpointMutation(updateDeployment);

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
        id: "hostnames",
        label: "Hostnames",
        type: "tags",
        values: (d) => d.hostnames,
        // Caddy serves these; the endpoint validates each against a DNS-label
        // regex, so a typo is a 400 naming the field rather than a broken site.
        onEditValues: async (d, next) => {
          await update.mutateAsync({ params: { id: d.id }, body: { hostnames: next } });
        },
        sortable: false,
      },
      {
        id: "loopbackPort",
        label: "Loopback port",
        type: "int",
        value: (d) => d.loopbackPort,
        onEdit: async (d, next) => {
          await update.mutateAsync({
            params: { id: d.id },
            body: { loopbackPort: Number(next) },
          });
        },
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
      // ── Derived. No `onEdit` on any of them, because none of them is a value
      //    anyone gets to choose: `runUser` in particular exists only to be
      //    non-root, and a field with a default is a field someone can set back
      //    to `root`.
      {
        id: "runUser",
        label: "Run user",
        type: "text",
        value: (d) => deriveInstall(d.compositionId).runUser,
      },
      {
        id: "installDir",
        label: "Install dir",
        type: "text",
        value: (d) => deriveInstall(d.compositionId).installDir,
      },
      {
        id: "unit",
        label: "systemd unit",
        type: "text",
        value: (d) => deriveInstall(d.compositionId).unit,
      },
      {
        id: "caddySite",
        label: "Caddy site",
        type: "text",
        value: (d) => deriveInstall(d.compositionId).caddySitePath,
      },
    ],
    [runs, update],
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
        rowKey={(d) => d.id}
        views={["list", "table"]}
        defaultView="list"
        storageKey={DEPLOYMENTS_VIEW}
        loading={loading}
        itemActions={DeploymentItemActions}
        creators={creators}
        emptyState="Nothing is deployed on this server yet."
      />
    </>
  );
}
