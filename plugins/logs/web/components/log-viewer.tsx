import { useEffect, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchWithRetry, ReconnectingEventSource, useReconnectingWebSocket } from "@core";
import type { ClientMessage, ServerMessage, LogEntryWire } from "../../shared/protocol";

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
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

    fetchWithRetry("/api/logs/channels")
      .then((r) => r.json())
      .then((data: { channels: string[] }) => {
        const backendChannels: ChannelRef[] = data.channels.map((id) => ({
          source: "backend",
          id,
          label: id,
        }));
        const all = [...backendChannels, ...gatewayChannels];
        setChannels(all);

        const preferredKey = initialChannel
          ? all.find((c) => c.source === "backend" && c.id === initialChannel)
          : all[0];
        if (preferredKey) setSelectedKey(channelKey(preferredKey));
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
    const sentinel = bottomRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]) nearBottomRef.current = entries[0].isIntersecting;
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [entries]);

  // Reset on channel change
  useEffect(() => {
    lastSeqRef.current = 0;
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
      }
    },
  });

  // Re-subscribe when channel changes on an already-open socket
  useEffect(() => {
    if (!isBackendSource || !selected || selected.source !== "backend") return;
    const handle = wsHandle.current;
    if (!handle) return;
    const msg: ClientMessage = { type: "subscribe", channel: selected.id };
    handle.send(JSON.stringify(msg));
  }, [selectedKey, wsHandle, isBackendSource, selected]);

  // Gateway-sourced channel: SSE stream of backend stdout/stderr.
  useEffect(() => {
    if (!isGatewaySource || !selected || selected.source !== "gateway") return;
    const url = `/gateway/worktrees/${encodeURIComponent(selected.worktree)}/logs`;
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
    <div className="flex h-full flex-col p-6 space-y-4">
      <Select
        value={selectedKey ?? undefined}
        onValueChange={(val: string | null) => setSelectedKey(val)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select channel" />
        </SelectTrigger>
        <SelectContent>
          {channels.map((c) => {
            const key = channelKey(c);
            return (
              <SelectItem key={key} value={key}>
                {c.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <ScrollArea className="flex-1 rounded-md border bg-muted/30">
        <div className="p-4 font-mono text-xs leading-5">
          {entries.map((entry) => (
            <div
              key={entry.seq}
              className={
                entry.stream === "stderr"
                  ? "text-destructive"
                  : "text-foreground"
              }
            >
              {entry.line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
