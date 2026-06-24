import { useState, type ReactElement, type ReactNode } from "react";
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
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useManifestItems } from "@plugins/plugin-meta/plugins/composition/web";
import {
  RELEASE_TARGETS,
  triggerReleaseEndpoint,
  releaseHistoryResource,
  type ReleaseRun,
} from "@plugins/release/core";

// Web-only icon decoration for the core target list (the engine carries no icon —
// the server must not import a UI component, so the web attaches a glyph by id).
const TARGET_ICONS: Record<string, IconType> = { web: MdLanguage };

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
}): ReactElement {
  const result = useResource(releaseHistoryResource);
  if (result.pending) return <Loading variant="rows" count={3} />;
  const runs = result.data;

  return (
    <div className="px-md py-sm">
      <Text as="span" variant="label" className="text-muted-foreground">
        History
      </Text>
      {runs.length === 0 && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- vertical offset below the History label, non-flex parent
        <Text as="p" variant="caption" className="mt-1 text-muted-foreground">
          No releases yet
        </Text>
      )}
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- list offset below the History label, sibling of label not in a shared flex parent */}
      <Stack gap="2xs" className="mt-1">
        {runs.map((run) => (
          <Row
            key={run.id}
            onClick={() => onRunClick(run.id)}
            selected={selectedRunId === run.id}
            size="sm"
            actionsAlwaysVisible
            actions={statusBadge(run)}
            className="cursor-pointer"
          >
            <span className="truncate">{run.composition}</span>
            <Badge variant="muted">{run.target}</Badge>
            <span className="text-muted-foreground">
              <RelativeTime date={run.startedAt} />
            </span>
          </Row>
        ))}
      </Stack>
    </div>
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
