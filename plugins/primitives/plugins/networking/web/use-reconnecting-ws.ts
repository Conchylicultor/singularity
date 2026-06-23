import { useEffect, useRef } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { publishWsStatus, type WsStatus } from "./ws-status-bus";

export interface ReconnectingWsOptions {
  url: string;
  onOpen?: (ws: WebSocket) => void;
  onMessage?: (ev: MessageEvent) => void;
  onStatusChange?: (status: WsStatus) => void;
  enabled?: boolean;
}

export interface ReconnectingWsHandle {
  send: (data: string) => void;
  close: () => void;
}

const BACKOFF_MS = [500, 1000, 2000, 5000];
const SEND_QUEUE_LIMIT = 1000;
const CLOSE_SENTINEL = 4000;

export function useReconnectingWebSocket(
  opts: ReconnectingWsOptions,
): { current: ReconnectingWsHandle | null } {
  const handleRef = useRef<ReconnectingWsHandle | null>(null);
  const optsRef = useLatestRef(opts);

  useEffect(() => {
    if (opts.enabled === false) return;

    let ws: WebSocket | null = null;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const queue: string[] = [];

    const setStatus = (status: WsStatus) => {
      publishWsStatus({ url: opts.url, status });
      optsRef.current.onStatusChange?.(status);
    };

    const connect = () => {
      if (disposed) return;
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      ws = new WebSocket(opts.url);

      ws.addEventListener("open", () => {
        if (disposed || !ws) return;
        attempt = 0;
        setStatus("open");
        optsRef.current.onOpen?.(ws);
        while (queue.length > 0 && ws.readyState === WebSocket.OPEN) {
          const msg = queue.shift();
          if (msg !== undefined) ws.send(msg);
        }
      });

      ws.addEventListener("message", (ev) => {
        optsRef.current.onMessage?.(ev);
      });

      ws.addEventListener("close", (ev) => {
        if (disposed || ev.code === CLOSE_SENTINEL) {
          setStatus("closed");
          return;
        }
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
        attempt++;
        setStatus("reconnecting");
        retryTimer = setTimeout(connect, delay);
      });

      ws.addEventListener("error", () => {
        // close handler will fire next and schedule reconnect
      });
    };

    handleRef.current = {
      send(data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        } else if (queue.length < SEND_QUEUE_LIMIT) {
          queue.push(data);
        }
      },
      close() {
        disposed = true;
        if (retryTimer) clearTimeout(retryTimer);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close(CLOSE_SENTINEL);
        } else if (ws) {
          ws.close();
        }
      },
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) ws.close(CLOSE_SENTINEL);
        else ws.close();
      }
      handleRef.current = null;
    };
    // The effect intentionally re-runs only on url/enabled — every other opt is
    // read live off the stable `optsRef.current`.
  }, [opts.url, opts.enabled]);

  return handleRef;
}
