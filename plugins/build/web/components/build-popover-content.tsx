import { Button, cn, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { triggerBuildEndpoint } from "../../core/endpoints";
import { MdContentCopy, MdPlayArrow } from "react-icons/md";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useReconnectingWebSocket } from "@plugins/primitives/plugins/networking/web";
import { useStickyScroll, JumpToBottomButton } from "@plugins/primitives/plugins/auto-scroll/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { CommitRowItem } from "@plugins/primitives/plugins/commit-list/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import { buildHistoryResource, mainAheadCountResource } from "../../shared";
import type { BuildRun } from "../../shared";
import type { ClientMessage, ServerMessage, LogEntryWire } from "@plugins/primitives/plugins/log-channels/core";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/logs`;

// Mono build-log viewer: intentional fixed code size + line-height (not on the typography scale).
// Overflow is owned by the `<Scroll axis="y">` wrapper, not baked in here.
const logViewerClass = "bg-muted/30 px-md py-sm font-mono text-xs leading-5";

function formatDuration(start: Date, end: Date | null): string {
  const ms = (end ?? new Date()).getTime() - start.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

const BRANCH_COLOR = "var(--warning)";

function MainAheadSection() {
  const result = useResource(mainAheadCountResource);
  if (result.pending) return null;
  const { count, commits } = result.data;
  if (count === 0) return null;

  return (
    <Collapsible className="border-b">
      <CollapsibleTrigger className="gap-sm px-md py-sm hover:bg-accent/50">
        <CollapsibleChevron className="size-4 text-muted-foreground" />
        <Text as="span" variant="label">
          main is {count} commit{count !== 1 ? "s" : ""} ahead
        </Text>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol>
          {commits.map((commit, idx) => (
            <CommitRowItem
              key={commit.sha}
              commit={commit}
              isFirst={idx === 0}
              isLast={idx === commits.length - 1}
              color={BRANCH_COLOR}
            />
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

function BuildControls({ building, onBuild }: { building: boolean; onBuild: () => void | Promise<void> }) {
  return (
    <Stack direction="row" align="center" gap="sm" className="border-b px-md py-sm">
      <Button variant="default" loading={building} onClick={() => onBuild()}>
        <MdPlayArrow className="size-4" />
        Build
      </Button>
    </Stack>
  );
}

function BuildLogView({ variant }: { variant: "popover" | "pane" }) {
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const lastSeqRef = useRef<number>(0);
  const selectedRef = useRef("build");

  const { scrollRef, scrollIfPinned, isPinned, hasUnread, jumpToBottom } =
    useStickyScroll({
      resetKey: "build",
    });

  useEffect(() => {
    scrollIfPinned();
  }, [entries.length, scrollIfPinned]);

  const wsHandle = useReconnectingWebSocket({
    url: WS_URL,
    enabled: true,
    onOpen: (ws) => {
      const msg: ClientMessage = {
        type: "subscribe",
        channel: "build",
        ...(lastSeqRef.current > 0 && { fromSequence: lastSeqRef.current }),
      };
      ws.send(JSON.stringify(msg));
    },
    onMessage: (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "history":
          if (msg.entries.length === 0) break;
          setEntries((prev) => [...prev, ...msg.entries]);
          lastSeqRef.current = Math.max(
            lastSeqRef.current,
            msg.entries[msg.entries.length - 1]!.seq,
          );
          break;
        case "entry":
          if (msg.seq <= lastSeqRef.current) break;
          lastSeqRef.current = msg.seq;
          setEntries((prev) => [...prev, msg]);
          break;
        case "error":
          toast({ type: "build", title: "Build log error", description: msg.error, variant: "error" });
          break;
      }
    },
  });

  // Re-subscribe on reconnect
  useEffect(() => {
    const handle = wsHandle.current;
    if (!handle) return;
    const msg: ClientMessage = { type: "subscribe", channel: selectedRef.current };
    handle.send(JSON.stringify(msg));
  }, [wsHandle]);

  const copyLogs = useCallback(async () => {
    const text = entries.map((e) => e.line).join("\n");
    await navigator.clipboard.writeText(text);
    toast({ type: "build", title: "Logs copied", description: "Build logs copied to clipboard", variant: "info" });
  }, [entries]);

  return (
    <Stack gap="none" className="relative border-b">
      <div className="flex items-center justify-between border-b px-md py-xs">
        <Text as="span" variant="label" className="text-muted-foreground">Logs</Text>
        <ControlSizeProvider size="xs">
          <IconButton
            icon={MdContentCopy}
            label="Copy logs"
            variant="ghost"
            onClick={copyLogs}
            disabled={entries.length === 0}
          />
        </ControlSizeProvider>
      </div>
      <Scroll
        axis="y"
        fill={variant === "pane"}
        ref={scrollRef}
        className={cn(logViewerClass, variant === "popover" ? "h-48" : "min-h-48")}
      >
        {entries.length === 0 && (
          <span className="text-muted-foreground">No build logs yet</span>
        )}
        {entries.map((entry) => (
          <div
            key={entry.seq}
            className={cn(
              "flex gap-sm",
              entry.stream === "stderr" ? "text-destructive" : "text-foreground",
            )}
          >
            <span className="shrink-0 text-muted-foreground">
              {new Date(entry.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </span>
            <span className="whitespace-pre-wrap break-all">{entry.line}</span>
          </div>
        ))}
      </Scroll>
      {/* Off-ramp bottom-1 (0.25rem) offset, not on the spacing ramp. */}
      <Pin to="bottom" style={{ bottom: "0.25rem" }}>
        <JumpToBottomButton handle={{ isPinned, hasUnread, jumpToBottom }} />
      </Pin>
    </Stack>
  );
}

function StatusDot({ run }: { run: BuildRun }) {
  if (run.finishedAt === null) {
    return <span className="block size-2 rounded-full bg-warning animate-pulse" />;
  }
  if (run.exitCode === 0) {
    return <span className="block size-2 rounded-full bg-success" />;
  }
  if (run.exitCode === -1) {
    return <span className="block size-2 rounded-full bg-muted-foreground/40" />;
  }
  return <span className="block size-2 rounded-full bg-destructive" />;
}

type BuildStatus = "running" | "success" | "failed" | "canceled";

function statusOf(run: BuildRun): BuildStatus {
  if (run.finishedAt === null) return "running";
  if (run.exitCode === 0) return "success";
  if (run.exitCode === -1) return "canceled";
  return "failed";
}

const STATUS_OPTIONS: { value: BuildStatus; label: string }[] = [
  { value: "running", label: "Running" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
];

const STATUS_LABEL: Record<BuildStatus, string> = {
  running: "Running",
  success: "Success",
  failed: "Failed",
  canceled: "Canceled",
};

function StatusChip({ run }: { run: BuildRun }) {
  return (
    <Inline gap="xs">
      <StatusDot run={run} />
      {STATUS_LABEL[statusOf(run)]}
    </Inline>
  );
}

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
const BUILD_HISTORY_VIEW = defineDataView("build.history");

/**
 * Standing build pane history as a DataView — search / filter / sort / group-by
 * come free over the build-run schema. The `buildHistoryResource` is already a
 * server-windowed `orderBy startedAt desc LIMIT 50` read, so the view renders the
 * full resource slice (no extra client cap). Natural-height: the enclosing
 * `PaneChrome` body owns the single scroll.
 */
function BuildHistoryDataView({
  runs,
  selectedRunId,
  onRunClick,
}: {
  runs: BuildRun[];
  selectedRunId?: string;
  onRunClick?: (runId: string) => void;
}) {
  const fields = useMemo<FieldDef<BuildRun>[]>(
    () => [
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
        primary: true,
        sortable: true,
        width: "10rem",
      },
      {
        id: "status",
        label: "Status",
        type: "enum",
        value: (r) => statusOf(r),
        options: STATUS_OPTIONS,
        cell: (r) => <StatusChip run={r} />,
        sortable: true,
        filterable: true,
      },
      {
        id: "trigger",
        label: "Trigger",
        type: "enum",
        value: (r) => r.trigger,
        options: [
          { value: "manual", label: "Manual" },
          { value: "auto", label: "Auto" },
        ],
        cell: (r) => (
          <Badge variant={r.trigger === "auto" ? "info" : "muted"}>{r.trigger}</Badge>
        ),
        sortable: true,
        filterable: true,
      },
      {
        id: "target",
        label: "Target",
        // Free-text, not an enum: composition ids are an open-ended set, so we
        // can't enumerate `options`.
        type: "text",
        value: (r) => r.target,
        cell: (r) => (
          <Badge variant={r.target === "main" ? "muted" : "info"}>{r.target}</Badge>
        ),
        sortable: true,
        filterable: true,
        width: "9rem",
      },
      {
        id: "duration",
        label: "Duration",
        type: "int",
        // null for still-running builds — honest, and it sorts them apart from
        // finished runs rather than pinning them to a fake 0.
        value: (r) =>
          r.finishedAt === null
            ? null
            : Math.floor((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000),
        cell: (r) => (
          <span className="tabular-nums text-muted-foreground">
            {r.finishedAt === null
              ? "running…"
              : formatDuration(r.startedAt, r.finishedAt)}
          </span>
        ),
        sortable: true,
        align: "end",
        width: "7rem",
      },
    ],
    [],
  );

  return (
    <DataView<BuildRun>
      rows={runs}
      fields={fields}
      rowKey={(r) => r.id}
      views={["list", "table"]}
      defaultView="list"
      storageKey={BUILD_HISTORY_VIEW}
      selectedRowId={selectedRunId}
      onRowActivate={onRunClick ? (r) => onRunClick(r.id) : undefined}
      emptyState={<>No builds yet</>}
    />
  );
}

/**
 * Compact history excerpt for the toolbar popover: the 10 most recent runs as a
 * hand-rolled Row list. Deliberately NOT a DataView — the popover has no room
 * for the view toolbar; the standing pane (`BuildHistoryDataView`) is the real
 * data surface.
 */
function BuildHistoryExcerpt({
  runs,
  selectedRunId,
  onRunClick,
}: {
  runs: BuildRun[];
  selectedRunId?: string;
  onRunClick?: (runId: string) => void;
}) {
  const visible = runs.slice(0, 10);

  return (
    <div className="px-md py-sm">
      <Text as="span" variant="label" className="text-muted-foreground">History</Text>
      {visible.length === 0 && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- vertical offset below the History label, non-flex parent
        <Text as="p" variant="caption" className="mt-1 text-muted-foreground">No builds yet</Text>
      )}
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- list offset below the History label, sibling of label not in a shared flex parent */}
      <Stack gap="2xs" className="mt-1">
        {/* eslint-disable-next-line data-view/no-adhoc-row-list -- popover excerpt of the build pane DataView (compact chrome, no room for view toolbar) */}
        {visible.map((run) => (
          <Row
            key={run.id}
            onClick={onRunClick ? () => onRunClick(run.id) : undefined}
            selected={selectedRunId === run.id}
            size="sm"
            icon={<StatusDot run={run} />}
            actionsAlwaysVisible
            actions={
              <span className="tabular-nums text-muted-foreground">
                {run.finishedAt === null ? "running…" : formatDuration(run.startedAt, run.finishedAt)}
              </span>
            }
            className={cn(onRunClick && "cursor-pointer")}
          >
            <span className="text-muted-foreground">
              <RelativeTime date={run.startedAt} />
            </span>
            <Badge variant={run.trigger === "auto" ? "info" : "muted"}>
              {run.trigger}
            </Badge>
            {run.target !== "main" && <Badge variant="info">{run.target}</Badge>}
          </Row>
        ))}
      </Stack>
    </div>
  );
}

/** Inner: receives settled history so hooks always run with real data. */
function BuildPopoverContentInner({
  variant,
  selectedRunId,
  onRunClick,
  runs,
}: {
  variant: "popover" | "pane";
  selectedRunId?: string;
  onRunClick?: (runId: string) => void;
  runs: BuildRun[];
}) {
  const latestRun = runs[0];
  const building = latestRun?.finishedAt === null;

  const handleBuild = useCallback(async () => {
    try {
      await fetchEndpoint(triggerBuildEndpoint, {});
      toast({ type: "build", title: "Build started", description: "Running ./singularity build", variant: "info" });
    } catch (err) {
      if (err instanceof EndpointError) {
        toast({ type: "build", title: "Build failed to start", description: err.message, variant: "error" });
      } else {
        toast({ type: "build", title: "Build failed to start", description: "Server unreachable", variant: "error" });
      }
    }
  }, []);

  return (
    <Stack gap="none" className={cn(variant === "pane" && "h-full")}>
      <MainAheadSection />
      <BuildControls building={building} onBuild={handleBuild} />
      {variant === "popover" ? (
        <>
          <BuildLogView variant={variant} />
          <BuildHistoryExcerpt
            runs={runs}
            selectedRunId={selectedRunId}
            onRunClick={onRunClick}
          />
        </>
      ) : (
        <BuildHistoryDataView
          runs={runs}
          selectedRunId={selectedRunId}
          onRunClick={onRunClick}
        />
      )}
    </Stack>
  );
}

export function BuildPopoverContent({
  variant,
  selectedRunId,
  onRunClick,
}: {
  variant: "popover" | "pane";
  selectedRunId?: string;
  onRunClick?: (runId: string) => void;
}) {
  const historyResult = useResource(buildHistoryResource);
  if (historyResult.pending) {
    return (
      <Stack gap="none" className={cn(variant === "pane" && "h-full")}>
        <Loading variant="rows" count={3} />
      </Stack>
    );
  }
  return (
    <BuildPopoverContentInner
      variant={variant}
      selectedRunId={selectedRunId}
      onRunClick={onRunClick}
      runs={historyResult.data}
    />
  );
}
