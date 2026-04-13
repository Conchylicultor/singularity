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
  const commandRef = useRef(command);
  commandRef.current = command;

  const wsHandle = useReconnectingWebSocket({
    url: WS_URL,
    onOpen: (ws) => {
      sessionIdRef.current = null;
      const term = terminalRef.current;
      if (!term) return;
      const msg: ClientMessage = {
        type: "session.create",
        cols: term.cols,
        rows: term.rows,
        ...(commandRef.current && { command: commandRef.current }),
      };
      ws.send(JSON.stringify(msg));
    },
    onMessage: (event) => {
      const term = terminalRef.current;
      if (!term) return;
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "session.created":
          sessionIdRef.current = msg.sessionId;
          break;
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
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const msg: ClientMessage = { type: "session.resize", sessionId, cols, rows };
      wsHandle.current?.send(JSON.stringify(msg));
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
