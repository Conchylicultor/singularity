import type { ServerWebSocket } from "bun";
import type { WsHandler, WsData } from "@plugins/framework/plugins/server-core/core";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";
import {
  createSession,
  writeToSession,
  resizeSession,
  destroySession,
} from "./pty-manager";

const wsToSession = new Map<ServerWebSocket<WsData>, string>();
const sessionToWs = new Map<string, ServerWebSocket<WsData>>();

function send(ws: ServerWebSocket<WsData>, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

export const wsHandler: WsHandler = {
  open(_ws) {
    // No-op. PTY is allocated on session.create, not on connect.
  },

  message(ws, msg) {
    if (typeof msg !== "string") return;

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(msg);
    } catch {
      send(ws, { type: "session.error", error: "Invalid JSON" });
      return;
    }

    switch (parsed.type) {
      case "session.create": {
        if (wsToSession.has(ws)) {
          send(ws, {
            type: "session.error",
            error: "Session already exists on this connection",
          });
          return;
        }
        try {
          const sessionId = createSession({
            cols: parsed.cols,
            rows: parsed.rows,
            cwd: parsed.cwd,
            command: parsed.command,
            onOutput(sid, data) {
              const targetWs = sessionToWs.get(sid);
              if (targetWs) {
                send(targetWs, { type: "session.output", sessionId: sid, data });
              }
            },
            onExit(sid, exitCode) {
              const targetWs = sessionToWs.get(sid);
              if (targetWs) {
                send(targetWs, {
                  type: "session.exited",
                  sessionId: sid,
                  exitCode,
                });
                wsToSession.delete(targetWs);
                sessionToWs.delete(sid);
              }
            },
          });

          wsToSession.set(ws, sessionId);
          sessionToWs.set(sessionId, ws);
          send(ws, { type: "session.created", sessionId });
        } catch (err) {
          send(ws, {
            type: "session.error",
            error: `Failed to create session: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case "session.input": {
        const sessionId = wsToSession.get(ws);
        if (!sessionId || sessionId !== parsed.sessionId) {
          send(ws, { type: "session.error", error: "No active session" });
          return;
        }
        try {
          writeToSession(sessionId, parsed.data);
        } catch (err) {
          send(ws, {
            type: "session.error",
            error: `Write failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case "session.resize": {
        const sessionId = wsToSession.get(ws);
        if (!sessionId || sessionId !== parsed.sessionId) {
          send(ws, { type: "session.error", error: "No active session" });
          return;
        }
        try {
          resizeSession(sessionId, parsed.cols, parsed.rows);
        } catch (err) {
          send(ws, {
            type: "session.error",
            error: `Resize failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case "session.destroy": {
        const sessionId = wsToSession.get(ws);
        if (!sessionId || sessionId !== parsed.sessionId) return;
        destroySession(sessionId);
        wsToSession.delete(ws);
        sessionToWs.delete(sessionId);
        break;
      }

      default:
        send(ws, {
          type: "session.error",
          error: `Unknown message type: ${(parsed as { type: string }).type}`,
        });
    }
  },

  close(ws, _code, _reason) {
    const sessionId = wsToSession.get(ws);
    if (sessionId) {
      destroySession(sessionId);
      wsToSession.delete(ws);
      sessionToWs.delete(sessionId);
    }
  },
};
