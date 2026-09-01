import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  deployRunsRevisionResource,
  queryDeployRuns,
  type DeployRunRecord,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import { DeployRunItemActions } from "../slots";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
const DEPLOY_HISTORY_VIEW = defineDataView("deploy.deployment.history");

// The closed `deploy_runs.status` set, labelled for the enum filter chip and
// group-by. `running` is a real, readable state here — a row whose backend went
// away mid-run keeps it forever, which is the honest record of what happened.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
];

// The closed `DeployVerb` set. Spelled as options rather than derived from the
// loaded rows, because the rows are a server-paginated window: deriving would
// give a filter that offers only the verbs on the current page.
const VERB_OPTIONS: { value: string; label: string }[] = [
  { value: "update", label: "Update" },
  { value: "converge", label: "Converge" },
  { value: "ship", label: "Ship" },
];

function outcomeBadge(run: DeployRunRecord): ReactNode {
  if (run.status === "running") {
    return (
      <Badge
        variant="warning"
        icon={<StatusDot colorClass="bg-warning animate-pulse" />}
      >
        Running
      </Badge>
    );
  }
  if (run.status === "succeeded") {
    return (
      <Badge variant="success" icon={<StatusDot colorClass="bg-success" />}>
        Succeeded
      </Badge>
    );
  }
  return (
    <Badge
      variant="destructive"
      icon={<StatusDot colorClass="bg-destructive" />}
    >
      {/* The leg names the failure when there is one: "failed on build" is a
          different fact from "failed on ship", and it is free to say. */}
      {run.phaseFailed ? `Failed on ${run.phaseFailed}` : "Failed"}
    </Badge>
  );
}

/**
 * Wall-clock time a run took, or how long the one in flight has been going.
 *
 * Local because the three formatters in the repo are all plugin-private to debug
 * surfaces; a shared `formatDuration` primitive would retire all four.
 */
function durationLabel(run: DeployRunRecord): string {
  const end = run.finishedAt ?? new Date();
  const ms = end.getTime() - run.startedAt.getTime();
  if (ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** The first 7 chars of a sha — what git itself abbreviates to. */
function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

// Static by construction: the rows are a server-paginated window, so nothing here
// may be derived from what happens to be loaded. `duration` is the one derived
// field and is deliberately neither sortable nor filterable — there is no
// `duration` column for the server to compile those onto, and the query compiler
// drops an unmapped rule fail-soft, which would read as a control that silently
// does nothing.
const fields: FieldDef<DeployRunRecord>[] = [
  {
    id: "status",
    label: "Outcome",
    type: "enum",
    value: (r) => r.status,
    options: STATUS_OPTIONS,
    cell: (r) => outcomeBadge(r),
    primary: true,
    sortable: true,
    filterable: true,
    width: "12rem",
  },
  {
    id: "verb",
    label: "Verb",
    type: "enum",
    value: (r) => r.verb,
    options: VERB_OPTIONS,
    cell: (r) => <Badge variant="muted">{r.verb}</Badge>,
    sortable: true,
    filterable: true,
    width: "8rem",
  },
  {
    id: "commitSha",
    label: "Commit",
    type: "text",
    value: (r) => r.commitSha,
    cell: (r) =>
      r.commitSha ? (
        <span className="font-mono text-muted-foreground" title={r.commitSha}>
          {shortSha(r.commitSha)}
        </span>
      ) : null,
    sortable: true,
    width: "8rem",
  },
  {
    id: "releaseRunId",
    label: "Release",
    type: "text",
    value: (r) => r.releaseRunId,
    cell: (r) =>
      r.releaseRunId ? (
        <span className="font-mono text-muted-foreground">
          {r.releaseRunId}
        </span>
      ) : null,
    sortable: true,
    width: "16rem",
  },
  {
    id: "duration",
    label: "Took",
    type: "text",
    value: (r) => durationLabel(r),
    cell: (r) => (
      <span className="text-muted-foreground">{durationLabel(r)}</span>
    ),
    width: "6rem",
  },
  {
    id: "startedAt",
    label: "Started",
    type: "date",
    value: (r) => r.startedAt,
    cell: (r) => (
      <span className="text-muted-foreground">
        <RelativeTime date={r.startedAt} />
      </span>
    ),
    sortable: true,
    width: "8rem",
  },
  {
    id: "message",
    label: "Message",
    type: "text",
    value: (r) => r.message,
    cell: (r) =>
      r.message ? (
        <span className="whitespace-pre-wrap" title={r.message}>
          {r.message}
        </span>
      ) : null,
    filterable: true,
    width: "24rem",
  },
];

/**
 * **History** — every run ever launched for this deployment, from the durable
 * `deploy_runs` ledger.
 *
 * This is the section that makes *"what is live on this box, and what happened
 * before"* answerable after a reboot. The `deploy.runs` resource the sections
 * above render from is in-memory and empty after a restart — deliberately, it is
 * the live view — and this is the record beside it. So the pane no longer has to
 * caveat that it forgets.
 *
 * Server-delegated and keyset-paginated (no cap, infinite scroll); the cheap
 * `deploy.runs-revision` scalar tick refreshes the loaded window in place when a
 * run opens or ends.
 */
export function DeployHistorySection({
  deploymentId,
}: {
  deploymentId: string;
}): ReactNode {
  // The tick drives an in-place refetch of the loaded window; the keyset query is
  // the source of truth. While pending, hand a null tick (no refetch) — the first
  // settled `rev` then refreshes once.
  const tick = useResource(deployRunsRevisionResource);
  const changeTick = matchResource(tick, {
    pending: () => null,
    ready: (d) => d.rev,
  });

  return (
    <DataView<DeployRunRecord>
      storageKey={DEPLOY_HISTORY_VIEW}
      rows={[]}
      fields={fields}
      rowKey={(r) => r.id}
      views={["list", "table"]}
      defaultView="list"
      viewOptions={{
        list: { renderRow: (r: DeployRunRecord) => <HistoryRow run={r} /> },
      }}
      itemActions={DeployRunItemActions}
      emptyState={<>Nothing has been deployed from here yet.</>}
      dataSource={{
        changeTick,
        fetchPage: (args) =>
          fetchEndpoint(queryDeployRuns, { id: deploymentId }, { body: args }),
      }}
    />
  );
}

/**
 * One ledger row.
 *
 * The list view's field-driven row joins every non-primary field into ONE
 * truncated subtitle line, which is the right default and the wrong one for a
 * failure: the `message` is the CLI's own refusal, and this section exists partly
 * so those words survive the restart that used to eat them. So the row is
 * rendered through the list view's `renderRow` escape hatch — identity on the
 * first line, the message wrapped in full underneath — while the field schema
 * above still drives sort / filter / search and the table view.
 */
function HistoryRow({ run }: { run: DeployRunRecord }): ReactNode {
  return (
    <Fill>
      <Stack gap="2xs">
        <Cluster gap="xs">
          {outcomeBadge(run)}
          <Badge variant="muted">{run.verb}</Badge>
          {run.commitSha && (
            <Badge variant="muted" mono title={run.commitSha}>
              {shortSha(run.commitSha)}
            </Badge>
          )}
          {run.releaseRunId && (
            <Badge
              variant="muted"
              mono
              title={`Release run ${run.releaseRunId}`}
            >
              {run.releaseRunId}
            </Badge>
          )}
          <Text as="span" variant="caption" tone="muted">
            {durationLabel(run)} · <RelativeTime date={run.startedAt} />
          </Text>
        </Cluster>
        {run.status === "failed" && run.message && (
          <Text
            as="p"
            variant="caption"
            tone="destructive"
            className="whitespace-pre-wrap"
          >
            {run.message}
          </Text>
        )}
      </Stack>
    </Fill>
  );
}
