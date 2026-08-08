import type { ReactNode } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  EndpointError,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { useEventSourceRun } from "@plugins/apps/plugins/events/plugins/events-core/web";
import type { EventSourceRun } from "@plugins/apps/plugins/events/plugins/events-core/core";
import {
  RUN_OUTCOME_LABEL,
  RUN_OUTCOME_VARIANT,
  describeRun,
  formatDuration,
  eventSourceDetailPane,
} from "@plugins/apps/plugins/events/plugins/sources/web";
import { EventSourceRunDetail } from "./slots";

/**
 * One run: `/events/sources/source/:sourceId/run/:runId`.
 *
 * Pane params are **own-only** (`pane.ts` design decision 6): this pane sees
 * `runId` and nothing of its ancestor's `sourceId`. That is exactly why the run
 * is fetched by its OWN id (`GET /api/events/runs/:runId`) rather than reached
 * through the source's runs list — a deep link must resolve from the URL alone,
 * not from whatever window the parent's list happens to have loaded.
 *
 * `run/` is globally distinct after param-name erasure — segments are matched
 * across the whole app and param names do not disambiguate. `rg 'segment: "run'`
 * finds nothing else; the nearby `r/:runId` (build) and `rel/:runId` (Studio
 * release) are why the noun is spelled in full, the same call
 * `deploy/deployments` makes with `dep/:deploymentId`.
 *
 * `titleOwner` is deliberately NOT set — the source page keeps the tab title; a
 * run is a drill-in under it, not a new main surface.
 */
export const eventSourceRunPane = Pane.define({
  id: "event-source-run",
  defaultAncestors: [eventSourceDetailPane],
  segment: "run/:runId",
  component: EventSourceRunPaneView,
  resolve: useResolveRun,
  useTitle: useRunTitle,
  width: 460,
});

function useResolveRun({ runId }: { runId: string }): {
  pending: boolean;
  found: boolean;
} {
  const query = useEventSourceRun(runId);
  if (query.isPending) return { pending: true, found: false };
  // Absence and breakage are different answers, and only the status tells them
  // apart: a 404 is the server stating this run does not exist (swept by
  // retention, or its source deleted), so the route is genuinely stale. Every
  // other failure — offline, 500, a blipped socket — must NOT discard a deep
  // link, so it stays pending and the body renders what broke.
  if (query.isError) {
    const gone =
      query.error instanceof EndpointError && query.error.status === 404;
    return { pending: !gone, found: false };
  }
  return { pending: false, found: true };
}

/** The outcome plus when it ran — how a person picks one run out of a ledger. */
function useRunTitle({ runId }: { runId: string }): string | undefined {
  const query = useEventSourceRun(runId);
  if (query.data === undefined) return undefined;
  return `${RUN_OUTCOME_LABEL[query.data.outcome]} run`;
}

function EventSourceRunPaneView(): ReactNode {
  const { runId } = eventSourceRunPane.useParams();
  const query = useEventSourceRun(runId);

  if (query.isError) {
    return (
      <PaneChrome pane={eventSourceRunPane} title="Run">
        <Placeholder tone="error">
          {getEndpointErrorMessage(query.error)}
        </Placeholder>
      </PaneChrome>
    );
  }

  const run = query.data;
  const title = run ? `${RUN_OUTCOME_LABEL[run.outcome]} run` : "Run";

  // The summary is the pane's own header block, not a section: it is the run
  // itself, and the sections below are what OTHER plugins have to say about it.
  // Sections render while the fetch is still in flight — each owns its own
  // loading state, so the pane does not stall behind one gate.
  return (
    <PaneChrome pane={eventSourceRunPane} title={title}>
      <Stack gap="none">
        <Inset x="lg" t="lg">
          {run ? <RunSummary run={run} /> : <Loading variant="rows" />}
        </Inset>
        <EventSourceRunDetail.Host runId={runId} />
      </Stack>
    </PaneChrome>
  );
}

function SummaryField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Line className="gap-sm">
      <Text variant="label">{label}</Text>
      <Fill />
      <Text variant="caption" tone="muted">
        {children}
      </Text>
    </Line>
  );
}

function RunSummary({ run }: { run: EventSourceRun }): ReactNode {
  const duration = formatDuration(run.durationMs);
  return (
    <Stack gap="sm">
      <Line className="gap-sm">
        <Badge variant={RUN_OUTCOME_VARIANT[run.outcome]}>
          {RUN_OUTCOME_LABEL[run.outcome]}
        </Badge>
        <Fill>
          <Text variant="caption" tone="muted">
            {describeRun(run)}
          </Text>
        </Fill>
      </Line>

      <SummaryField label="Started">
        <RelativeTime date={run.startedAt} />
      </SummaryField>
      <SummaryField label="Duration">
        {duration ?? "Still running"}
      </SummaryField>
      <SummaryField label="Found">{run.eventsFound}</SummaryField>
      <SummaryField label="New">{run.eventsCreated}</SummaryField>
      <SummaryField label="Updated">{run.eventsUpdated}</SummaryField>
      <SummaryField label="Gone">{run.eventsDisappeared}</SummaryField>
      <SummaryField label="Fingerprint">
        {run.fingerprint ? `${run.fingerprint.slice(0, 12)}…` : "None"}
      </SummaryField>

      {/* Verbatim, never summarized away: on a failed run this IS the answer,
          and the ledger row only had room for its first line. */}
      {run.error && (
        <Stack gap="2xs">
          <Text as="p" variant="label" tone="destructive">
            Error
          </Text>
          <Text
            as="p"
            variant="caption"
            tone="destructive"
            className="break-words"
          >
            {run.error}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
