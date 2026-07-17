import { cn, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useState, useRef, useCallback, useEffect, useMemo, type ReactElement } from "react";
import { MdContentCopy } from "react-icons/md";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useReconnectingWebSocket } from "@plugins/primitives/plugins/networking/web";
import { useStickyScroll, JumpToBottomButton } from "@plugins/primitives/plugins/auto-scroll/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  RELEASE_LOG_CHANNEL,
  releaseLogsEndpoint,
  releaseRunResource,
  type ReleaseLogLine,
} from "@plugins/release/core";
import type {
  ClientMessage,
  ServerMessage,
  LogEntryWire,
} from "@plugins/primitives/plugins/log-channels/core";

// Mono log body: intentional fixed code size + line-height (not on the typography scale).
const monoLogClass = "font-mono text-xs leading-5";

export function ReleaseLogSection({ runId }: { runId: string }): ReactElement {
  const result = useResource(releaseRunResource, { id: runId });

  // Live runs stream over `/ws/logs`; finished runs read the persisted fallback.
  // While the resource is still pending we optimistically show the live stream
  // (gate on `.pending` with an early return rather than collapsing it into a
  // fake-empty default — keeps "loading" distinct from "genuinely finished").
  if (result.pending) return <LiveLogs />;
  const run = result.data;
  if (run?.status === "running") return <LiveLogs />;
  return <PersistedLogs runId={runId} />;
}

function LogsHeader({
  live,
  onCopy,
  copyDisabled,
}: {
  live?: boolean;
  onCopy: () => void | Promise<void>;
  copyDisabled: boolean;
}): ReactElement {
  return (
    <Line className="pb-xs">
      <Fill>
        <Text as="span" variant="label" className="text-muted-foreground">
          {/* eslint-disable-next-line spacing/no-adhoc-spacing -- inline word spacing after "Logs" label text */}
          Logs {live && <span className="text-muted-foreground/60 ml-1">Live</span>}
        </Text>
      </Fill>
      <ControlSizeProvider size="xs">
        <IconButton
          icon={MdContentCopy}
          label="Copy logs"
          variant="ghost"
          onClick={onCopy}
          disabled={copyDisabled}
        />
      </ControlSizeProvider>
    </Line>
  );
}

function PersistedLogs({ runId }: { runId: string }): ReactElement {
  const { data } = useEndpoint(releaseLogsEndpoint, { id: runId });
  const lines = useMemo<ReleaseLogLine[]>(() => data?.lines ?? [], [data]);

  const copyAll = useCallback(async () => {
    await navigator.clipboard.writeText(lines.map((l) => l.text).join("\n"));
    toast({ type: "release", title: "Logs copied", description: "Release logs copied to clipboard", variant: "info" });
  }, [lines]);

  return (
    <Stack gap="xs">
      <LogsHeader onCopy={copyAll} copyDisabled={lines.length === 0} />
      <Scroll axis="y" className={`min-h-48 max-h-96 rounded-md border bg-muted/30 px-md py-sm ${monoLogClass}`}>
        {lines.length === 0 && <span className="text-muted-foreground">No release logs</span>}
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap break-all",
              line.stream === "stderr" ? "text-destructive" : "text-foreground",
            )}
          >
            {line.text}
          </div>
        ))}
      </Scroll>
    </Stack>
  );
}

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/logs`;

function LiveLogs(): ReactElement {
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const lastSeqRef = useRef<number>(0);

  const { scrollRef, scrollIfPinned, isPinned, hasUnread, jumpToBottom } =
    useStickyScroll({ resetKey: RELEASE_LOG_CHANNEL });

  useEffect(() => {
    scrollIfPinned();
  }, [entries.length, scrollIfPinned]);

  useReconnectingWebSocket({
    url: WS_URL,
    enabled: true,
    onOpen: (ws) => {
      const msg: ClientMessage = {
        type: "subscribe",
        channel: RELEASE_LOG_CHANNEL,
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
          toast({ type: "release", title: "Release log error", description: msg.error, variant: "error" });
          break;
      }
    },
  });

  const copyLogs = useCallback(async () => {
    await navigator.clipboard.writeText(entries.map((e) => e.line).join("\n"));
    toast({ type: "release", title: "Logs copied", description: "Release logs copied to clipboard", variant: "info" });
  }, [entries]);

  return (
    <Stack gap="none" className="relative">
      <LogsHeader live onCopy={copyLogs} copyDisabled={entries.length === 0} />
      <Scroll
        axis="y"
        ref={scrollRef}
        className={`min-h-48 max-h-96 rounded-md border bg-muted/30 px-md py-sm ${monoLogClass}`}
      >
        {entries.length === 0 && <span className="text-muted-foreground">No release logs yet</span>}
        {entries.map((entry) => (
          <Stack
            key={entry.seq}
            direction="row"
            gap="sm"
            className={entry.stream === "stderr" ? "text-destructive" : "text-foreground"}
          >
            <span className="text-muted-foreground tabular-nums">
              {new Date(entry.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </span>
            <span className="whitespace-pre-wrap break-all">{entry.line}</span>
          </Stack>
        ))}
      </Scroll>
      {/* Off-ramp bottom-1 (0.25rem) offset, not on the spacing ramp. */}
      <Pin to="bottom" style={{ bottom: "0.25rem" }}>
        <JumpToBottomButton handle={{ isPinned, hasUnread, jumpToBottom }} />
      </Pin>
    </Stack>
  );
}
