import { useState, useEffect, useRef, useCallback } from "react";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { triggerBuildEndpoint } from "../../core/endpoints";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MdContentCopy, MdPlayArrow } from "react-icons/md";
import { toast } from "@plugins/notifications/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useReconnectingWebSocket } from "@plugins/primitives/plugins/networking/web";
import { useStickyScroll, JumpToBottomButton } from "@plugins/primitives/plugins/auto-scroll/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { buildHistoryResource } from "../../shared";
import type { BuildRun } from "../../shared";
import type { ClientMessage, ServerMessage, LogEntryWire } from "@plugins/debug/plugins/logs/core";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/logs`;

function formatDuration(start: Date, end: Date | null): string {
  const ms = (end ?? new Date()).getTime() - start.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function BuildControls({ building, onBuild }: { building: boolean; onBuild: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <Button variant="default" size="sm" disabled={building} onClick={onBuild}>
        <MdPlayArrow className="size-4" />
        {building ? "Building…" : "Build"}
      </Button>
    </div>
  );
}

function BuildLogView({ variant }: { variant: "popover" | "pane" }) {
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const lastSeqRef = useRef<number>(0);
  const selectedRef = useRef("build");

  const stickyScroll = useStickyScroll({
    resetKey: "build",
  });
  const { scrollIfPinned } = stickyScroll;

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
    <div className="relative flex flex-col border-b">
      <div className="flex items-center justify-between border-b px-3 py-1">
        <span className="text-xs font-medium text-muted-foreground">Logs</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={copyLogs}
          disabled={entries.length === 0}
          aria-label="Copy logs"
        >
          <MdContentCopy className="size-3" />
        </Button>
      </div>
      <div
        ref={stickyScroll.scrollRef}
        className={cn(
          "overflow-y-auto bg-muted/30 px-3 py-2 font-mono text-xs leading-5",
          variant === "popover" ? "h-48" : "flex-1 min-h-48",
        )}
      >
        {entries.length === 0 && (
          <span className="text-muted-foreground">No build logs yet</span>
        )}
        {entries.map((entry) => (
          <div
            key={entry.seq}
            className={cn(
              "flex gap-2",
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
      </div>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
        <JumpToBottomButton handle={stickyScroll} />
      </div>
    </div>
  );
}

function StatusDot({ run }: { run: BuildRun }) {
  if (run.finishedAt === null) {
    return <span className="block size-2 shrink-0 rounded-full bg-warning animate-pulse" />;
  }
  if (run.exitCode === 0) {
    return <span className="block size-2 shrink-0 rounded-full bg-success" />;
  }
  if (run.exitCode === -1) {
    return <span className="block size-2 shrink-0 rounded-full bg-muted-foreground/40" />;
  }
  return <span className="block size-2 shrink-0 rounded-full bg-destructive" />;
}

function BuildHistoryList({
  variant,
  selectedRunId,
  onRunClick,
}: {
  variant: "popover" | "pane";
  selectedRunId?: string;
  onRunClick?: (runId: string) => void;
}) {
  const result = useResource(buildHistoryResource);
  const runs = result.pending ? [] : result.data;
  const limit = variant === "popover" ? 10 : 50;
  const visible = runs.slice(0, limit);

  return (
    <div className="px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">History</span>
      {visible.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">No builds yet</p>
      )}
      <div className="mt-1 flex flex-col gap-0.5">
        {visible.map((run) => (
          <Row
            key={run.id}
            as="div"
            role={onRunClick ? "button" : undefined}
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
            <Badge size="sm" variant={run.trigger === "auto" ? "info" : "muted"}>
              {run.trigger}
            </Badge>
          </Row>
        ))}
      </div>
    </div>
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
  const runs = historyResult.pending ? [] : historyResult.data;
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
    <div className={cn("flex flex-col", variant === "pane" && "h-full")}>
      <BuildControls building={building} onBuild={handleBuild} />
      {variant === "popover" && <BuildLogView variant={variant} />}
      <BuildHistoryList variant={variant} selectedRunId={selectedRunId} onRunClick={onRunClick} />
    </div>
  );
}
