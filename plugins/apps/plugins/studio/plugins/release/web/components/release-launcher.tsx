import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { MdLanguage, MdPlayArrow } from "react-icons/md";
import type { IconType } from "react-icons";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useManifestItems } from "@plugins/plugin-meta/plugins/composition/web";
import {
  RELEASE_TARGETS,
  triggerReleaseEndpoint,
  releaseHistoryResource,
  type ReleaseRun,
} from "@plugins/release/core";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
const RELEASE_HISTORY_VIEW = defineDataView("studio.release.history");

// Web-only icon decoration for the core target list (the engine carries no icon —
// the server must not import a UI component, so the web attaches a glyph by id).
const TARGET_ICONS: Record<string, IconType> = { web: MdLanguage };

// Closed status set (the `release_runs.status` enum), labelled for the enum
// filter chip and group-by.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
];

function statusBadge(run: ReleaseRun): ReactNode {
  if (run.status === "running") {
    return (
      <Badge variant="warning" icon={<StatusDot colorClass="bg-warning animate-pulse" />}>
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
    <Badge variant="destructive" icon={<StatusDot colorClass="bg-destructive" />}>
      Failed
    </Badge>
  );
}

function TargetPicker({
  target,
  onPick,
}: {
  target: string | null;
  onPick: (id: string) => void;
}): ReactElement {
  return (
    <Cluster gap="sm">
      {RELEASE_TARGETS.map((t) => {
        const Icon = TARGET_ICONS[t.id];
        return (
          <ToggleChip
            key={t.id}
            active={target === t.id}
            disabled={!t.implemented}
            icon={Icon ? <Icon /> : undefined}
            onClick={() => onPick(t.id)}
            title={t.implemented ? t.label : `${t.label} (coming soon)`}
          >
            {t.implemented ? t.label : `${t.label} (soon)`}
          </ToggleChip>
        );
      })}
    </Cluster>
  );
}

function ReleaseControls({
  pending,
  onRun,
}: {
  pending: boolean;
  onRun: (composition: string, target: string) => void;
}): ReactElement {
  const items = useManifestItems();
  const apps = items.filter((item) => item.category === "app");

  const [composition, setComposition] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  const compositionItems: Record<string, string> = Object.fromEntries(
    apps.map((item) => [item.name, item.name]),
  );

  const canRun = composition !== null && target !== null && !pending;

  return (
    <Stack gap="sm" className="border-b px-md py-sm">
      <Stack gap="2xs">
        <Text as="span" variant="label" className="text-muted-foreground">
          Composition
        </Text>
        <Select
          items={compositionItems}
          value={composition ?? ""}
          onValueChange={(v: string | null) => {
            if (v) setComposition(v);
          }}
        >
          <SelectTrigger aria-label="Composition" className="w-full">
            <SelectValue placeholder="Select a composition…" />
          </SelectTrigger>
          <SelectContent>
            {apps.map((item) => (
              <SelectItem key={item.id} value={item.name}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Stack>

      <Stack gap="2xs">
        <Text as="span" variant="label" className="text-muted-foreground">
          Target
        </Text>
        <TargetPicker target={target} onPick={setTarget} />
      </Stack>

      <Button
        variant="default"
        loading={pending}
        disabled={!canRun}
        onClick={() => {
          if (composition && target) onRun(composition, target);
        }}
      >
        <MdPlayArrow className="size-4" />
        Run release
      </Button>
    </Stack>
  );
}

function ReleaseHistoryList({
  selectedRunId,
  onRunClick,
}: {
  selectedRunId?: string;
  onRunClick: (runId: string) => void;
}): ReactNode {
  const result = useResource(releaseHistoryResource);
  // One render path for both states (mirrors the reports/sonata-library
  // precedent): while loading, DataView renders its own skeleton via `loading`
  // and the field schema is still built from the (empty) rows.
  return matchResource(result, {
    pending: () => (
      <ReleaseHistoryTable rows={[]} loading selectedRunId={selectedRunId} onRunClick={onRunClick} />
    ),
    error: () => (
      <ReleaseHistoryTable rows={[]} loading selectedRunId={selectedRunId} onRunClick={onRunClick} />
    ),
    ready: (runs) => (
      <ReleaseHistoryTable
        rows={runs}
        loading={false}
        selectedRunId={selectedRunId}
        onRunClick={onRunClick}
      />
    ),
  });
}

function ReleaseHistoryTable({
  rows,
  loading,
  selectedRunId,
  onRunClick,
}: {
  rows: ReleaseRun[];
  loading: boolean;
  selectedRunId?: string;
  onRunClick: (runId: string) => void;
}): ReactElement {
  const fields: FieldDef<ReleaseRun>[] = useMemo(() => {
    // Platform is an open string set (e.g. "darwin-arm64"), so its enum options
    // come from the live rows — exactly what reports does for `source`.
    const platforms = [...new Set(rows.map((r) => r.platform).filter((p): p is string => !!p))]
      .sort()
      .map((p) => ({ value: p, label: p }));

    return [
      {
        id: "composition",
        label: "Composition",
        type: "text",
        value: (r) => r.composition,
        primary: true,
        sortable: true,
        width: "minmax(0,2fr)",
      },
      {
        id: "target",
        label: "Target",
        type: "enum",
        value: (r) => r.target,
        options: RELEASE_TARGETS.map((t) => ({ value: t.id, label: t.label })),
        cell: (r) => <Badge variant="muted">{r.target}</Badge>,
        sortable: true,
        filterable: true,
        width: "9rem",
      },
      {
        id: "status",
        label: "Status",
        type: "enum",
        value: (r) => r.status,
        options: STATUS_OPTIONS,
        cell: (r) => statusBadge(r),
        sortable: true,
        filterable: true,
        width: "8rem",
      },
      {
        id: "platform",
        label: "Platform",
        type: "enum",
        value: (r) => r.platform,
        options: platforms,
        cell: (r) =>
          r.platform ? (
            <span className="font-mono text-muted-foreground">{r.platform}</span>
          ) : null,
        sortable: true,
        filterable: true,
        width: "10rem",
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
        id: "finishedAt",
        label: "Finished",
        type: "date",
        value: (r) => r.finishedAt,
        cell: (r) =>
          r.finishedAt ? (
            <span className="text-muted-foreground">
              <RelativeTime date={r.finishedAt} />
            </span>
          ) : null,
        sortable: true,
        width: "8rem",
      },
    ];
  }, [rows]);

  return (
    <DataView<ReleaseRun>
      rows={rows}
      fields={fields}
      rowKey={(r) => r.id}
      views={["list", "table"]}
      defaultView="list"
      storageKey={RELEASE_HISTORY_VIEW}
      loading={loading}
      selectedRowId={selectedRunId}
      onRowActivate={(r) => onRunClick(r.id)}
      emptyState={<>No releases yet.</>}
    />
  );
}

export function ReleaseLauncher({
  selectedRunId,
  onRunClick,
}: {
  selectedRunId?: string;
  onRunClick: (runId: string) => void;
}): ReactElement {
  const trigger = useEndpointMutation(triggerReleaseEndpoint);

  const handleRun = (composition: string, target: string) => {
    trigger.mutate({ body: { composition, target } });
  };

  return (
    <Stack gap="none">
      <ReleaseControls pending={trigger.isPending} onRun={handleRun} />
      <ReleaseHistoryList selectedRunId={selectedRunId} onRunClick={onRunClick} />
    </Stack>
  );
}
