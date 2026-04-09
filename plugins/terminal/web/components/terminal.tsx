import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";

const WS_URL = `ws://${window.location.hostname}:9001/ws/terminal`;

export function TerminalView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "monospace",
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
      },
    });
    terminalRef.current = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(container);
    fitAddon.fit();

    const ws = new WebSocket(WS_URL);
    let sessionId: string | null = null;

    ws.addEventListener("open", () => {
      const msg: ClientMessage = {
        type: "session.create",
        cols: term.cols,
        rows: term.rows,
      };
      ws.send(JSON.stringify(msg));
    });

    ws.addEventListener("message", (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "session.created":
          sessionId = msg.sessionId;
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
    });

    ws.addEventListener("close", () => {
      term.write("\r\n[Connection closed]");
    });

    const inputDisposable = term.onData((data) => {
      if (sessionId && ws.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = {
          type: "session.input",
          sessionId,
          data,
        };
        ws.send(JSON.stringify(msg));
      }
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (sessionId && ws.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = {
          type: "session.resize",
          sessionId,
          cols,
          rows,
        };
        ws.send(JSON.stringify(msg));
      }
    });

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(container);

    return () => {
      observer.disconnect();
      inputDisposable.dispose();
      resizeDisposable.dispose();
      if (ws.readyState === WebSocket.OPEN) {
        if (sessionId) {
          const msg: ClientMessage = {
            type: "session.destroy",
            sessionId,
          };
          ws.send(JSON.stringify(msg));
        }
        ws.close();
      }
      term.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ minHeight: "300px" }}
    />
  );
}
