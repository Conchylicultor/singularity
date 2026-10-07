import type { ReactElement, ReactNode } from "react";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import {
  EndpointError,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import { runBackgroundNowEndpoint } from "@plugins/infra/plugins/background/plugins/catalog/core";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import {
  ControlPanel,
  ControlPanelPane,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { ModelSelect } from "@plugins/conversations/plugins/model-provider/web";
import { Icon } from "@plugins/ui/plugins/icons/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import {
  useAutomation,
  useUpdateAutomationSettings,
  type AutomationView,
} from "../internal/use-automations";
import { NextRunWords, ScheduleWords, useAutomationJob } from "./schedule";
import { AutomationHistory } from "./automation-history";

const playIcon = symbol("play-arrow");

/** One automation, read from the (already loaded) catalog and settings. */
export function AutomationDetail({
  automationId,
}: {
  automationId: string;
}): ReactElement {
  const result = useAutomation(automationId);
  switch (result.status) {
    case "loading":
      return <Loading variant="rows" />;
    case "error":
      return (
        <ResourceErrorInline
          variant="block"
          subject="the automations"
          error={result.error}
          refetch={result.refetch}
        />
      );
    case "ready":
      break;
  }
  if (result.data === null) {
    return (
      <Placeholder tone="error">
        No automation named {automationId} is installed any more.
      </Placeholder>
    );
  }
  return <AutomationDetailBody view={result.data} />;
}

function AutomationDetailBody({
  view,
}: {
  view: AutomationView;
}): ReactElement {
  const { entry, settings } = view;
  const job = useAutomationJob(entry.trigger);
  return (
    <Stack gap="xl" className="rail-lg">
      <Stack gap="sm">
        <Stack direction="row" gap="sm" align="center">
          <Icon icon={entry.icon} className={`size-5 ${rigidClass()}`} />
          <Fill>
            <Line>
              <Text as="h2" variant="heading">
                {entry.label}
              </Text>
            </Line>
          </Fill>
          {settings.enabled ? (
            <Badge variant="success">On</Badge>
          ) : (
            <Badge variant="muted">Off</Badge>
          )}
        </Stack>
        <Text variant="body" tone="muted">
          {entry.description}
        </Text>
      </Stack>

      <Stack gap="sm">
        <Fact label="When">
          <ScheduleWords trigger={entry.trigger} job={job} />
          {settings.enabled ? <NextRunWords job={job} prefix=" · " /> : null}
        </Fact>
        <Fact label="Job">
          <Text variant="code" tone="muted">
            {entry.trigger.jobName}
          </Text>
        </Fact>
      </Stack>

      <RunNow view={view} />

      <Behavior view={view} />

      <AutomationHistory automationId={entry.id} />
    </Stack>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Stack direction="row" gap="md" align="start">
      <Text variant="caption" tone="muted" className={`w-20 ${rigidClass()}`}>
        {label}
      </Text>
      <Text variant="caption">{children}</Text>
    </Stack>
  );
}

/**
 * Run its job now, outside its schedule — through Background activity's Run
 * now, so it is the same run the schedule would start (settings, dedupe and
 * all). Offered only where the job's provider offers it, and only while the
 * automation is on: an off automation's run files nothing.
 */
function RunNow({ view }: { view: AutomationView }): ReactElement {
  const { entry, settings } = view;
  const job = useAutomationJob(entry.trigger);
  const runNow = useEndpointMutation(runBackgroundNowEndpoint);
  const canRun =
    job.status === "ready" && job.data !== null && job.data.canRunNow;
  const why = !settings.enabled
    ? "Turn it on to run it."
    : job.status === "loading"
      ? "Reading its job…"
      : job.status === "ready" && job.data !== null && !job.data.runsHere
        ? "Its job runs on main — start it from there."
        : !canRun
          ? "Its job cannot be started from here."
          : runNow.isSuccess
            ? "Queued — a task it files appears under History."
            : "Checks once now, outside its schedule.";
  return (
    <Stack direction="row" gap="md" align="center">
      <Button
        variant="outline"
        disabled={!settings.enabled || !canRun}
        onClick={() =>
          runNow
            .mutateAsync({
              body: { kind: "job", name: entry.trigger.jobName },
            })
            .then(
              () => undefined,
              (err: unknown) => {
                // Already shown (the endpoint layer toasts a failed request);
                // anything else is a bug and must stay loud.
                if (err instanceof EndpointError) return;
                throw err;
              },
            )
        }
      >
        <Icon icon={playIcon} />
        Run now
      </Button>
      <Text variant="caption" tone="muted">
        {why}
      </Text>
    </Stack>
  );
}

/**
 * How it behaves: on/off, whether its agent may push, which model it launches,
 * and which of its sources take part. Every control writes the automation's
 * whole settings item (`useUpdateAutomationSettings`).
 *
 * Two panels, not two sections of one: a panel reserves its icon column for
 * every row once any row draws a mark there, so the Sources checkboxes would
 * indent the Behavior labels past the eyebrow above them.
 */
function Behavior({ view }: { view: AutomationView }): ReactElement {
  const { entry, settings } = view;
  const update = useUpdateAutomationSettings();
  const excluded = new Set(settings.excludedSources);
  return (
    <Stack gap="md">
      <ControlPanelPane label={`${entry.label} behavior`}>
        <ControlPanel.Section label="Behavior">
          <ControlPanel.Row
            select="switch"
            checked={settings.enabled}
            onSelect={() => update(view, { enabled: !settings.enabled })}
            description={
              settings.enabled
                ? "Files a task and starts its agent when it finds work."
                : "Its job still runs on schedule, but files nothing."
            }
          >
            Enabled
          </ControlPanel.Row>
          <ControlPanel.Row
            select="switch"
            checked={settings.autoPush}
            disabled={!settings.enabled}
            onSelect={() => update(view, { autoPush: !settings.autoPush })}
            description={
              settings.autoPush
                ? "The agent lands its work on main by itself."
                : "The agent stops at a ready branch and waits for your review."
            }
          >
            Push when checks pass
          </ControlPanel.Row>
          <ControlPanel.Setting
            label="Model"
            hint="Used for every agent this automation launches."
            fit="field"
            disabled={!settings.enabled}
            control={
              <ModelSelect
                allowOff={false}
                value={settings.model}
                onChange={(model) => update(view, { model })}
                ariaLabel="Model"
                disabled={!settings.enabled}
              />
            }
          />
        </ControlPanel.Section>
      </ControlPanelPane>
      {entry.sources.length > 0 ? (
        <ControlPanelPane label={`${entry.label} sources`}>
          <ControlPanel.Section
            label="Sources"
            description="Only the included sources are checked. A source added later is included until you exclude it."
          >
            {entry.sources.map((source) => (
              <ControlPanel.Row
                key={source.id}
                select="check"
                checked={!excluded.has(source.id)}
                disabled={!settings.enabled}
                onSelect={() =>
                  update(view, {
                    excludedSources: excluded.has(source.id)
                      ? settings.excludedSources.filter(
                          (id) => id !== source.id,
                        )
                      : [...settings.excludedSources, source.id],
                  })
                }
              >
                {source.label}
              </ControlPanel.Row>
            ))}
          </ControlPanel.Section>
        </ControlPanelPane>
      ) : null}
    </Stack>
  );
}
