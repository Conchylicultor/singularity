import { spawn, type IPty } from "bun-pty";

interface Session {
  id: string;
  pty: IPty;
}

export interface CreateSessionOptions {
  cols: number;
  rows: number;
  cwd?: string;
  onOutput: (sessionId: string, data: string) => void;
  onExit: (sessionId: string, exitCode: number) => void;
}

const sessions = new Map<string, Session>();

export function createSession(options: CreateSessionOptions): string {
  const id = crypto.randomUUID();
  const shell = process.env.SHELL || "bash";
  const cwd = options.cwd || process.env.HOME || "/";

  const p = spawn(shell, [], {
    name: "xterm-256color",
    cols: options.cols,
    rows: options.rows,
    cwd,
    env: process.env as Record<string, string>,
  });

  sessions.set(id, { id, pty: p });

  p.onData((data) => options.onOutput(id, data));
  p.onExit(({ exitCode }) => {
    sessions.delete(id);
    options.onExit(id, exitCode);
  });

  return id;
}

export function writeToSession(id: string, data: string): void {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  session.pty.write(data);
}

export function resizeSession(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  session.pty.resize(cols, rows);
}

export function destroySession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  session.pty.kill();
  sessions.delete(id);
}
