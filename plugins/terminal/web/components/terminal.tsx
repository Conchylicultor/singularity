import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useReconnectingWebSocket } from "@core";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/terminal`;

const THEME = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
};

export function TerminalView({ command }: { command?: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Holds the latest {cols,rows} observed before `session.created` arrives.
  // Flushed as a `session.resize` once the server acknowledges the session,
  // so the PTY dims always converge to what xterm is actually rendering.
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const commandRef = useRef(command);
  commandRef.current = command;

  // Single source of truth for "tell the server about the current dims".
  // - No session yet → send `session.create` (spawns the PTY at this size).
  // - Session exists → send `session.resize`.
  // Any resize that arrives before `session.created` is parked in
  // `pendingResizeRef` and flushed on ack. On WS reconnect the old PTY is
  // gone; `sessionIdRef` is reset in onOpen so we cleanly re-create.
  const syncDims = (
    ws: { send: (data: string) => void },
    cols: number,
    rows: number,
  ) => {
    const sessionId = sessionIdRef.current;
    const msg: ClientMessage = sessionId
      ? { type: "session.resize", sessionId, cols, rows }
      : {
          type: "session.create",
          cols,
          rows,
          ...(commandRef.current && { command: commandRef.current }),
        };
    ws.send(JSON.stringify(msg));
  };

  const wsHandle = useReconnectingWebSocket({
    url: WS_URL,
    onOpen: (ws) => {
      sessionIdRef.current = null;
      pendingResizeRef.current = null;
      const term = terminalRef.current;
      if (!term) return;
      syncDims(ws, term.cols, term.rows);
    },
    onMessage: (event) => {
      const term = terminalRef.current;
      if (!term) return;
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "session.created": {
          sessionIdRef.current = msg.sessionId;
          const pending = pendingResizeRef.current;
          pendingResizeRef.current = null;
          const ws = wsHandle.current;
          if (pending && ws) syncDims(ws, pending.cols, pending.rows);
          break;
        }
        case "session.output":
          term.write(msg.data);
          break;
        case "session.exited":
          term.write(`\r\n[Process exited with code ${msg.exitCode}]`);
          break;
        case "session.error":
          term.write(`\r\n[Error: ${msg.error}]`);
          break;
      }
    },
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "monospace",
      theme: THEME,
    });
    terminalRef.current = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(container);
    fitAddon.fit();

    const inputDisposable = term.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const msg: ClientMessage = { type: "session.input", sessionId, data };
      wsHandle.current?.send(JSON.stringify(msg));
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      const ws = wsHandle.current;
      // Before `session.created` arrives, a naive send would be silently
      // dropped server-side ("No active session"), leaving the PTY stuck at
      // its initial dims while xterm renders at the new size — the shifted-
      // display bug. Park the dims so `session.created` can flush them.
      if (!sessionIdRef.current) {
        pendingResizeRef.current = { cols, rows };
        return;
      }
      if (ws) syncDims(ws, cols, rows);
    });

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(container);

    return () => {
      observer.disconnect();
      inputDisposable.dispose();
      resizeDisposable.dispose();
      terminalRef.current = null;
      term.dispose();
    };
  }, [wsHandle]);

  return (
    <div className="h-full w-full p-2" style={{ background: THEME.background }}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
