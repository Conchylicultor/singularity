import { useMemo, type ReactElement } from "react";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Icon } from "@plugins/ui/plugins/icons/web";
import {
  useAutomations,
  type AutomationView,
} from "../internal/use-automations";
import { NextRunWords, ScheduleWords, useAutomationJob } from "./schedule";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
const AUTOMATIONS_VIEW = defineDataView("tasks.automations");

const NO_ROWS: AutomationView[] = [];

type AutomationState = "on" | "off";
type OpenState = "open" | "none";

const stateOf = (r: AutomationView): AutomationState =>
  r.settings.enabled ? "on" : "off";
const openOf = (r: AutomationView): OpenState =>
  r.entry.openTaskId === null ? "none" : "open";

/**
 * Every automation — what files a task and launches its agent with nobody
 * clicking anything — one row each: what it is, when it runs, whether it is on,
 * and whether a task it filed is still open. The set is declared in code, so
 * the catalog is loaded whole.
 */
export function AutomationsView({
  selectedId,
  onOpen,
}: {
  selectedId: string | undefined;
  onOpen: (automationId: string) => void;
}): ReactElement {
  const result = useAutomations();
  const rows = foldResource(result, {
    loading: () => NO_ROWS,
    error: () => NO_ROWS,
    ready: (d) => d,
  });

  const fields = useMemo<FieldDef<AutomationView>[]>(
    () => [
      {
        id: "label",
        label: "Automation",
        type: "text",
        primary: true,
        value: (r) => r.entry.label,
        sortable: true,
      },
      {
        id: "state",
        label: "State",
        type: "enum",
        value: stateOf,
        options: [
          { value: "on", label: "On", variant: "success" },
          { value: "off", label: "Off", variant: "muted" },
        ],
        filterable: true,
        groupable: true,
        visible: false,
      },
      {
        id: "open",
        label: "Open task",
        type: "enum",
        value: openOf,
        options: [
          { value: "open", label: "Has an open task" },
          { value: "none", label: "Nothing open" },
        ],
        filterable: true,
        visible: false,
      },
      {
        id: "description",
        label: "What it does",
        type: "text",
        value: (r) => r.entry.description,
        visible: false,
      },
    ],
    [],
  );

  return (
    <DataView<AutomationView>
      rows={rows}
      fields={fields}
      rowKey={(r) => r.entry.id}
      views={["list"]}
      storageKey={AUTOMATIONS_VIEW}
      readiness={result}
      selectedRowId={selectedId}
      onRowActivate={(r) => onOpen(r.entry.id)}
      searchAccessor={(r) => `${r.entry.label} ${r.entry.description}`}
      searchPlaceholder="Search automations…"
      viewOptions={{
        list: {
          leading: (r: AutomationView) => <Icon icon={r.entry.icon} />,
          renderRow: (r: AutomationView) => <AutomationRowBody view={r} />,
        },
      }}
      emptyState={<>No automation is installed.</>}
    />
  );
}

/**
 * One automation: its name over when it runs, then its open task and its
 * state. Each line is its own line container, so a long schedule ellipsizes
 * instead of pushing the chips out.
 */
function AutomationRowBody({ view }: { view: AutomationView }): ReactElement {
  const { entry, settings } = view;
  const job = useAutomationJob(entry.trigger);
  return (
    <>
      <Fill>
        <Stack gap="none">
          <Line>
            <Text variant="label" tone={settings.enabled ? "default" : "muted"}>
              {entry.label}
            </Text>
          </Line>
          <Line>
            <Text variant="caption" tone="muted">
              <ScheduleWords trigger={entry.trigger} job={job} />
              {settings.enabled ? (
                <NextRunWords job={job} prefix=" · " />
              ) : null}
            </Text>
          </Line>
        </Stack>
      </Fill>
      <Stack direction="row" gap="xs" align="center" className={rigidClass()}>
        {entry.openTaskId !== null ? (
          <Badge variant="info">Task open</Badge>
        ) : null}
        {settings.enabled ? (
          <Badge variant="success">On</Badge>
        ) : (
          <Badge variant="muted">Off</Badge>
        )}
      </Stack>
    </>
  );
}
