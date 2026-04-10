import { useEffect, useRef, useState, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ClientMessage, ServerMessage, LogEntryWire } from "../../shared/protocol";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/logs`;

export function LogViewer({ initialChannel }: { initialChannel?: string }) {
  const [channels, setChannels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(initialChannel ?? null);
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  // Fetch available channels
  useEffect(() => {
    fetch("/api/logs/channels")
      .then((r) => r.json())
      .then((data: { channels: string[] }) => {
        setChannels(data.channels);
        if (!initialChannel && data.channels.length > 0 && data.channels[0]) {
          setSelected(data.channels[0]);
        }
      });
  }, [initialChannel]);

  // Track whether user is near bottom
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

  // Auto-scroll when near bottom and new entries arrive
  useEffect(() => {
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [entries]);

  // WebSocket connection and subscription
  const subscribeToChannel = useCallback((channel: string) => {
    // Reuse existing connection if open
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: "subscribe", channel };
      wsRef.current.send(JSON.stringify(msg));
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      const msg: ClientMessage = { type: "subscribe", channel };
      ws.send(JSON.stringify(msg));
    });

    ws.addEventListener("message", (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "history":
          setEntries(msg.entries);
          break;
        case "entry":
          setEntries((prev) => [...prev, msg]);
          break;
      }
    });
  }, []);

  useEffect(() => {
    if (selected) {
      subscribeToChannel(selected);
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selected, subscribeToChannel]);

  return (
    <div className="flex h-full flex-col p-6 space-y-4">
      <Select value={selected ?? undefined} onValueChange={(val: string | null) => setSelected(val)}>
        <SelectTrigger>
          <SelectValue placeholder="Select channel" />
        </SelectTrigger>
        <SelectContent>
          {channels.map((ch) => (
            <SelectItem key={ch} value={ch}>
              {ch}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ScrollArea className="flex-1 rounded-md border bg-muted/30">
        <div className="p-4 font-mono text-xs leading-5">
          {entries.map((entry, i) => (
            <div
              key={i}
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
