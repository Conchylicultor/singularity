import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEffect, useRef, useState } from "react";
import {
  JumpToBottomButton,
  useStickyScroll,
} from "@plugins/primitives/plugins/dom/plugins/auto-scroll/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { ReconnectingEventSource } from "@plugins/primitives/plugins/networking/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getLogChannels } from "@plugins/primitives/plugins/log-channels/core";
import type { LogEntryWire } from "@plugins/primitives/plugins/log-channels/core";
import {
  LiveLogChannel,
  LogEntryList,
} from "@plugins/primitives/plugins/log-channels/web";
import { namespaceFromHost } from "@plugins/infra/plugins/namespace/core";

type ChannelRef =
  | { source: "backend"; id: string; label: string }
  | { source: "gateway"; worktree: string; label: string };

function channelKey(c: ChannelRef): string {
  return c.source === "backend" ? `backend:${c.id}` : `gateway:${c.worktree}`;
}

// `null` when this page is not served under a namespace, which is what
// suppresses the gateway channel entry below.
function currentWorktreeName(): string | null {
  return namespaceFromHost(window.location.host);
}

export function LogViewer({ initialChannel }: { initialChannel?: string }) {
  const [channels, setChannels] = useState<ChannelRef[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = channels.find((c) => channelKey(c) === selectedKey) ?? null;

  useEffect(() => {
    const gatewayChannels: ChannelRef[] = [];
    const wt = currentWorktreeName();
    if (wt) {
      gatewayChannels.push({
        source: "gateway",
        worktree: wt,
        label: `backend (${wt})`,
      });
    }

    fetchEndpoint(getLogChannels, {})
      .then((data) => {
        const backendChannels: ChannelRef[] = data.channels.map((id) => ({
          source: "backend",
          id,
          label: id,
        }));
        const all = [...gatewayChannels, ...backendChannels];
        setChannels(all);

        const preferred = initialChannel
          ? all.find((c) => c.source === "backend" && c.id === initialChannel)
          : all[0];
        if (preferred) setSelectedKey(channelKey(preferred));
      })
      .catch(() => {
        // Backend unreachable (e.g. crash-looping): still show gateway channels.
        setChannels(gatewayChannels);
        if (gatewayChannels.length > 0 && gatewayChannels[0]) {
          setSelectedKey(channelKey(gatewayChannels[0]));
        }
      });
  }, [initialChannel]);

  return (
    <Stack gap="lg" className="h-full p-xl">
      <Stack
        role="tablist"
        direction="row"
        gap="xs"
        align="center"
        className="border-b"
      >
        {channels.map((c) => {
          const key = channelKey(c);
          const active = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedKey(key)}
              className={cn(
                "relative -mb-px px-md py-xs text-body border-b-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </Stack>

      {/* Keyed on selectedKey: switching channels remounts the view, which
          naturally re-initializes its entries + WS/SSE subscriptions for the new
          channel — no effect-based reset needed. */}
      {selected &&
        (selected.source === "backend" ? (
          // A backend channel is exactly what the shared primitive subscribes
          // to, so this branch is the primitive — no local WS/de-dup/scroll copy.
          <Fill axis="y">
            <LiveLogChannel key={selectedKey} channel={selected.id} fill />
          </Fill>
        ) : (
          <GatewayLogChannel key={selectedKey} worktree={selected.worktree} />
        ))}
    </Stack>
  );
}

/**
 * The gateway-sourced channel: backend stdout/stderr streamed by the GATEWAY as
 * SSE, not by this app's `/ws/logs`. That transport is why it cannot be
 * `LiveLogChannel` — but the rows are the same rows, so it renders through the
 * primitive's `LogEntryList` rather than re-deriving the markup.
 */
function GatewayLogChannel({ worktree }: { worktree: string }) {
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const lastSeqRef = useRef<number>(0);

  const { scrollRef, bottomSentinel, isFollowing, jumpToBottom } =
    useStickyScroll({ threshold: 32 });

  useEffect(() => {
    const url = `/gateway/worktrees/${encodeURIComponent(worktree)}/logs`;
    const es = new ReconnectingEventSource({
      url,
      events: ["history", "entry"],
      onMessage: (data, eventName) => {
        if (eventName === "history") {
          const { entries: hist } = JSON.parse(data) as {
            entries: LogEntryWire[];
          };
          if (hist.length === 0) return;
          setEntries((prev) => [...prev, ...hist]);
          lastSeqRef.current = Math.max(
            lastSeqRef.current,
            hist[hist.length - 1]!.seq,
          );
        } else if (eventName === "entry") {
          const entry = JSON.parse(data) as LogEntryWire;
          if (entry.seq <= lastSeqRef.current) return;
          lastSeqRef.current = entry.seq;
          setEntries((prev) => [...prev, entry]);
        }
      },
    });

    return () => es.close();
  }, [worktree]);

  return (
    // The jump-to-bottom off-ramp is pinned against this cell, not the scroller,
    // so it does not scroll with the log. Previously this pane had no off-ramp at
    // all, which made it the one consumer where a wrong follow state was
    // invisible: "stuck at the bottom" and "logs stopped arriving" looked
    // identical.
    <Fill axis="y" className="relative">
      <LogEntryList
        entries={entries}
        fill
        scrollRef={scrollRef}
        bottomSentinel={bottomSentinel}
      />
      {/* Off-ramp bottom-1 (0.25rem) offset, not on the spacing ramp. */}
      <Pin to="bottom" style={{ bottom: "0.25rem" }}>
        <JumpToBottomButton handle={{ isFollowing, jumpToBottom }} />
      </Pin>
    </Fill>
  );
}
