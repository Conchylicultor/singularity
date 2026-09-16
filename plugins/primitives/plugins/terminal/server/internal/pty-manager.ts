import { spawn, type IPty } from "bun-pty";
import { HOME_DIR } from "@plugins/infra/plugins/paths/server";

interface Session {
  id: string;
  pty: IPty;
}

export interface CreateSessionOptions {
  cols: number;
  rows: number;
  cwd?: string;
  command?: string[];
  onOutput: (sessionId: string, data: string) => void;
  onExit: (sessionId: string, exitCode: number) => void;
}

const sessions = new Map<string, Session>();

// The terminal type this PTY emulates. It must reach the child as TERM: the
// backend starts from a declared environment that deliberately carries no TERM
// (see launcher's runtime-env.ts), and bun-pty's `name` does not set it when an
// explicit `env` is passed. Without it `tmux attach` exits with "terminal does
// not support clear".
const TERM_NAME = "xterm-256color";

export function createSession(options: CreateSessionOptions): string {
  const id = crypto.randomUUID();
  const cmd = options.command?.[0] ?? (process.env.SHELL || "bash");
  const args = options.command?.slice(1) ?? [];
  const cwd = options.cwd || HOME_DIR || "/";

  const p = spawn(cmd, args, {
    name: TERM_NAME,
    cols: options.cols,
    rows: options.rows,
    cwd,
    env: { ...(process.env as Record<string, string>), TERM: TERM_NAME },
  });

  sessions.set(id, { id, pty: p });

  p.onData((data) => options.onOutput(id, data));
  p.onExit(({ exitCode }) => {
    // bun-pty's read loop fires onExit on natural child exit without closing
    // the master fd — only kill() calls bun_pty_close. Force it here to
    // release /dev/ptmx; the session-map guard prevents re-entry since
    // kill() re-fires onExit.
    if (!sessions.has(id)) return;
    sessions.delete(id);
    p.kill();
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
