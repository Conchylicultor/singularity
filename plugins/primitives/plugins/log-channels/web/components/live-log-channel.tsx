import type React from "react";
import { useState, useRef, type ReactNode } from "react";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import {
  cn,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  JumpToBottomButton,
  useStickyScroll,
} from "@plugins/primitives/plugins/auto-scroll/web";
import {
  useReconnectingWebSocket,
  wsUrl,
} from "@plugins/primitives/plugins/networking/web";
import type { ClientMessage, LogEntryWire, ServerMessage } from "../../core";

// Mono log body: intentional fixed code size + line-height (not on the
// typography scale). One spelling for every consumer of this primitive.
const MONO_LOG_CLASS = "font-mono text-xs leading-5";

/** The app's own log socket. */
const LOGS_WS_PATH = "/ws/logs";

export interface LiveLogChannelProps {
  /** Durable channel id to subscribe to (e.g. `deploy`, `release`). */
  channel: string;
  /** Header label; the "Live" marker is appended by the primitive. */
  label?: ReactNode;
  /** Shown while the buffer is empty (subscribing replays the ring buffer). */
  emptyState?: ReactNode;
  /** Fill the parent's height instead of the default `min-h-48 max-h-96`. */
  fill?: boolean;
  /** Sizing overrides for the scroller (`max-h-*`, `min-h-*`, …). */
  className?: string;
  /**
   * Called with a channel-level error message. The error line is ALWAYS appended
   * to the visible buffer as well — this is the opt-in for consumers that also
   * want a toast, never a way to silence it.
   */
  onError?: (message: string) => void;
}

/**
 * A live view of one durable log channel: subscribe over `/ws/logs`, replay the
 * ring buffer, append entries as they arrive, stick to the bottom with an
 * off-ramp, and copy the whole buffer.
 *
 * **The one implementation.** This body existed three times (the deploy log
 * panel, the Studio release-log section, the debug log viewer's backend branch),
 * each with its own `lastSeq` de-dup and its own timestamped row markup — three
 * places for the same off-by-one to be wrong in. (The socket-URL derivation they
 * also each repeated now lives in `wsUrl` from the networking primitive.)
 *
 * The buffer is per-mount, so **switching channels means remounting**
 * (`<LiveLogChannel key={channel} …/>`): a channel switch must not leave the
 * previous channel's tail on screen, and a `key` makes that structural rather
 * than an effect that has to remember to clear.
 *
 * Mount it only while visible — the subscription is the cost.
 */
export function LiveLogChannel({
  channel,
  label,
  emptyState,
  fill,
  className,
  onError,
}: LiveLogChannelProps): ReactNode {
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const lastSeqRef = useRef<number>(0);

  const { scrollRef, bottomSentinel, isFollowing, jumpToBottom } =
    useStickyScroll();

  useReconnectingWebSocket({
    url: wsUrl(LOGS_WS_PATH),
    enabled: true,
    onOpen: (ws) => {
      const msg: ClientMessage = {
        type: "subscribe",
        channel,
        // Resume rather than replay from zero: a reconnect must not duplicate
        // the tail already on screen.
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
          // Loud in place: the error joins the stream it broke, so a channel
          // that stopped delivering never looks like a channel that went quiet.
          setEntries((prev) => [
            ...prev,
            {
              seq: lastSeqRef.current + 1,
              line: `[error] ${msg.error}`,
              stream: "stderr",
              timestamp: Date.now(),
            },
          ]);
          lastSeqRef.current += 1;
          onError?.(msg.error);
          break;
      }
    },
  });

  return (
    <Stack gap="none" className={fill ? "relative h-full" : "relative"}>
      <Line className="pb-xs">
        <Fill>
          <Text as="span" variant="label" tone="muted">
            {label}
            {label ? " " : null}
            <Text
              as="span"
              variant="label"
              className="text-muted-foreground/60"
            >
              Live
            </Text>
          </Text>
        </Fill>
        <ControlSizeProvider size="xs">
          <CopyButton
            text={entries.map((e) => e.line).join("\n")}
            title="Copy logs"
          />
        </ControlSizeProvider>
      </Line>
      <LogEntryList
        entries={entries}
        emptyState={emptyState}
        fill={fill}
        className={className}
        scrollRef={scrollRef}
        bottomSentinel={bottomSentinel}
      />
      {/* Off-ramp bottom-1 (0.25rem) offset, not on the spacing ramp. */}
      <Pin to="bottom" style={{ bottom: "0.25rem" }}>
        <JumpToBottomButton handle={{ isFollowing, jumpToBottom }} />
      </Pin>
    </Stack>
  );
}

export interface LogEntryListProps {
  entries: readonly LogEntryWire[];
  emptyState?: ReactNode;
  fill?: boolean;
  className?: string;
  /** Attach the sticky-scroll handle's scroller ref. */
  scrollRef?: React.Ref<HTMLElement>;
  /** Must be rendered last — it marks the true end of the content. */
  bottomSentinel?: ReactNode;
}

/**
 * The presentational half: a mono, timestamped, stderr-tinted list of log
 * entries in a scroller.
 *
 * Exported separately because one consumer streams a channel this primitive
 * cannot subscribe to (the debug viewer's gateway-sourced SSE channel, which is
 * served by the gateway rather than by `/ws/logs`). It renders the same rows
 * through this component instead of hand-rolling a fourth copy of the markup.
 */
export function LogEntryList({
  entries,
  emptyState,
  fill,
  className,
  scrollRef,
  bottomSentinel,
}: LogEntryListProps): ReactNode {
  return (
    <Scroll
      axis="y"
      fill={fill}
      ref={scrollRef}
      // `cn` (tailwind-merge) last, so a consumer's `max-h-*` really replaces
      // the default instead of tying with it on specificity.
      className={cn(
        "rounded-md border bg-muted/30 px-md py-sm",
        MONO_LOG_CLASS,
        fill ? "h-full" : "min-h-48 max-h-96",
        className,
      )}
    >
      {entries.length === 0 && emptyState !== undefined && (
        <Text as="span" variant="body" tone="muted">
          {emptyState}
        </Text>
      )}
      {entries.map((entry) => (
        <Stack
          key={entry.seq}
          direction="row"
          gap="sm"
          className={
            entry.stream === "stderr" ? "text-destructive" : "text-foreground"
          }
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
      {bottomSentinel}
    </Scroll>
  );
}
