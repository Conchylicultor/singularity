import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEffect, useRef, useState } from "react";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { ReconnectingEventSource, useReconnectingWebSocket } from "@plugins/primitives/plugins/networking/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getLogChannels } from "@plugins/primitives/plugins/log-channels/core";
import type { ClientMessage, ServerMessage, LogEntryWire } from "@plugins/primitives/plugins/log-channels/core";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/logs`;

type ChannelRef =
  | { source: "backend"; id: string; label: string }
  | { source: "gateway"; worktree: string; label: string };

function channelKey(c: ChannelRef): string {
  return c.source === "backend" ? `backend:${c.id}` : `gateway:${c.worktree}`;
}

function currentWorktreeName(): string | null {
  const host = window.location.hostname;
  if (!host.endsWith(".localhost")) return null;
  const name = host.slice(0, -".localhost".length);
  if (!name || name.includes(".")) return null;
  return name;
}

export function LogViewer({ initialChannel }: { initialChannel?: string }) {
  const [channels, setChannels] = useState<ChannelRef[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastSeqRef = useRef<number>(0);

  const selected = channels.find((c) => channelKey(c) === selectedKey) ?? null;
  const selectedRef = useRef<ChannelRef | null>(selected);
  selectedRef.current = selected;

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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleScroll = () => {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      stickToBottomRef.current = distance < 32;
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [entries]);

  // Reset on channel change
  useEffect(() => {
    lastSeqRef.current = 0;
    stickToBottomRef.current = true;
    setEntries([]);
  }, [selectedKey]);

  const isBackendSource = selected?.source === "backend";
  const isGatewaySource = selected?.source === "gateway";

  // Backend-sourced channels: WebSocket to the app's /ws/logs.
  const wsHandle = useReconnectingWebSocket({
    url: WS_URL,
    enabled: isBackendSource,
    onOpen: (ws) => {
      const sel = selectedRef.current;
      if (!sel || sel.source !== "backend") return;
      const msg: ClientMessage = {
        type: "subscribe",
        channel: sel.id,
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
          setEntries((prev) => [
            ...prev,
            { seq: lastSeqRef.current + 1, line: `[error] ${msg.error}`, stream: "stderr", timestamp: Date.now() },
          ]);
          lastSeqRef.current += 1;
          break;
      }
    },
  });

  // Re-subscribe when channel changes on an already-open socket
  useEffect(() => {
    if (!isBackendSource) return;
    const handle = wsHandle.current;
    if (!handle) return;
    // isBackendSource guarantees selected is non-null and source === "backend"
    const backendSelected = selected as Extract<ChannelRef, { source: "backend" }>;
    const msg: ClientMessage = { type: "subscribe", channel: backendSelected.id };
    handle.send(JSON.stringify(msg));
  }, [selectedKey, wsHandle, isBackendSource, selected]);

  // Gateway-sourced channel: SSE stream of backend stdout/stderr.
  useEffect(() => {
    if (!isGatewaySource) return;
    // isGatewaySource guarantees selected is non-null and source === "gateway"
    const gatewaySelected = selected as Extract<ChannelRef, { source: "gateway" }>;
    const url = `/gateway/worktrees/${encodeURIComponent(gatewaySelected.worktree)}/logs`;
    const es = new ReconnectingEventSource({
      url,
      events: ["history", "entry"],
      onMessage: (data, eventName) => {
        if (eventName === "history") {
          const { entries: hist } = JSON.parse(data) as { entries: LogEntryWire[] };
          if (hist.length === 0) return;
          setEntries((prev) => [...prev, ...hist]);
          lastSeqRef.current = Math.max(lastSeqRef.current, hist[hist.length - 1]!.seq);
        } else if (eventName === "entry") {
          const entry = JSON.parse(data) as LogEntryWire;
          if (entry.seq <= lastSeqRef.current) return;
          lastSeqRef.current = entry.seq;
          setEntries((prev) => [...prev, entry]);
        }
      },
    });

    return () => es.close();
  }, [selectedKey, isGatewaySource, selected]);

  return (
    <Stack gap="lg" className="h-full p-xl">
      <Stack role="tablist" direction="row" gap="xs" align="center" className="border-b">
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

      <Scroll
        fill
        ref={viewportRef}
        className="rounded-md border bg-muted/30 p-lg font-mono text-caption"
      >
        {entries.map((entry) => (
          <Frame
            key={entry.seq}
            className={entry.stream === "stderr" ? "text-destructive" : "text-foreground"}
            leading={
              <span className="text-muted-foreground">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
              </span>
            }
            content={<span>{entry.line}</span>}
          />
        ))}
      </Scroll>
    </Stack>
  );
}
