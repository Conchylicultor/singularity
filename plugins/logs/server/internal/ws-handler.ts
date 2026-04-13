import type { ServerWebSocket } from "bun";
import type { WsHandler, WsData } from "../../../../server/src/types";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";
import { subscribe } from "./registry";
import type { LogEntry } from "./registry";

const subscriptions = new Map<ServerWebSocket<WsData>, () => void>();

function send(ws: ServerWebSocket<WsData>, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

function toWire(entry: LogEntry) {
  return {
    seq: entry.seq,
    line: entry.line,
    stream: entry.stream,
    timestamp: entry.timestamp,
  };
}

export const wsHandler: WsHandler = {
  open(_ws) {},

  message(ws, msg) {
    if (typeof msg !== "string") return;

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(msg);
    } catch {
      return;
    }

    if (parsed.type === "subscribe") {
      // Unsubscribe from previous channel if any
      const prev = subscriptions.get(ws);
      if (prev) prev();

      try {
        const { history, unsubscribe } = subscribe(
          parsed.channel,
          (entry) => {
            send(ws, { type: "entry", ...toWire(entry) });
          },
          parsed.fromSequence,
        );

        subscriptions.set(ws, unsubscribe);
        send(ws, { type: "history", entries: history.map(toWire) });
      } catch (err) {
        send(ws, {
          type: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },

  close(ws, _code, _reason) {
    const unsubscribe = subscriptions.get(ws);
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete(ws);
    }
  },
};
