import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { MdContentCopy } from "react-icons/md";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  JumpToBottomButton,
  useStickyScroll,
} from "@plugins/primitives/plugins/auto-scroll/web";
import { useReconnectingWebSocket } from "@plugins/primitives/plugins/networking/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import type {
  ClientMessage,
  LogEntryWire,
  ServerMessage,
} from "@plugins/primitives/plugins/log-channels/core";
import { DEPLOY_LOG_CHANNEL } from "../../core";

// Mono log body: intentional fixed code size + line-height (not on the typography scale).
const monoLogClass = "font-mono text-xs leading-5";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/logs`;

/**
 * Live `converge` / `ship` output — the same shape as the Studio release-logs
 * section, over the `deploy` channel.
 *
 * One panel for the whole server rather than one per deployment, because the
 * channel is one channel: a run is exclusive per server, and each one opens with
 * its own argv line. There is no persisted-fallback branch either — subscribing
 * replays the channel's ring buffer, so the last run's tail is already here when
 * the panel mounts, and the durable JSONL under `logs/deploy.jsonl` is the
 * archive.
 *
 * Mount this only while visible (its host card unmounts the body when collapsed):
 * the subscription is the cost.
 */
export function DeployLogPanel(): ReactElement {
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const lastSeqRef = useRef<number>(0);

  const { scrollRef, scrollIfPinned, isPinned, hasUnread, jumpToBottom } =
    useStickyScroll({ resetKey: DEPLOY_LOG_CHANNEL });

  useEffect(() => {
    scrollIfPinned();
  }, [entries.length, scrollIfPinned]);

  useReconnectingWebSocket({
    url: WS_URL,
    enabled: true,
    onOpen: (ws) => {
      const msg: ClientMessage = {
        type: "subscribe",
        channel: DEPLOY_LOG_CHANNEL,
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
          toast({
            type: "deploy",
            title: "Deploy log error",
            description: msg.error,
            variant: "error",
          });
          break;
      }
    },
  });

  const copyLogs = useCallback(async () => {
    await navigator.clipboard.writeText(entries.map((e) => e.line).join("\n"));
    toast({
      type: "deploy",
      title: "Logs copied",
      description: "Deploy logs copied to clipboard",
      variant: "info",
    });
  }, [entries]);

  return (
    <Stack gap="none" className="relative">
      <Stack direction="row" justify="end" gap="none">
        <ControlSizeProvider size="xs">
          <IconButton
            icon={MdContentCopy}
            label="Copy logs"
            variant="ghost"
            onClick={copyLogs}
            disabled={entries.length === 0}
          />
        </ControlSizeProvider>
      </Stack>
      <Scroll
        axis="y"
        ref={scrollRef}
        className={`min-h-48 max-h-96 rounded-md border bg-muted/30 px-md py-sm ${monoLogClass}`}
      >
        {entries.length === 0 && (
          <span className="text-muted-foreground">
            No deploy output yet — Converge or Ship a deployment above.
          </span>
        )}
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
