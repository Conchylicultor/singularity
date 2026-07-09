import { readFile, stat } from "node:fs/promises";
import { CLAUDE_SESSIONS_DIR } from "@plugins/infra/plugins/paths/server";
import { subtreePids, type ProcessTree } from "./process-tree";

const SESSIONS_DIR = CLAUDE_SESSIONS_DIR;

// Claude CLI session status values (undocumented internal state from
// ~/.claude/sessions/<pid>.json). Exhaustive as of CLI v2.1.141.
// Hard error on unknown values so new CLI statuses surface immediately.
type CliSessionStatus = "busy" | "idle" | "shell" | "waiting";

const KNOWN_STATUSES = new Set<string>(["busy", "idle", "shell", "waiting"]);

export interface SessionState {
  sessionId: string | null;
  status: CliSessionStatus | null;
  waitingFor: string | null;
}

// Not an absorbed failure: the sessions file legitimately does not exist yet
// when the poller fires before Claude has written ~/.claude/sessions/<pid>.json.
// Every caller re-resolves on the next tick, so this must stay a value, not a throw.
const NULL_STATE: SessionState = { sessionId: null, status: null, waitingFor: null };

/** Session-file IO, injectable so resolution is testable without a real /proc. */
export interface SessionFileDeps {
  /** Raw file contents, or null when the pid has no sessions file (ENOENT). */
  readSessionFile: (pid: number) => Promise<string | null>;
  /** File mtime in epoch ms, or null when the pid has no sessions file (ENOENT). */
  statSessionFile: (pid: number) => Promise<number | null>;
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

const defaultDeps: SessionFileDeps = {
  async readSessionFile(pid) {
    try {
      return await readFile(`${SESSIONS_DIR}/${pid}.json`, "utf8");
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  },
  async statSessionFile(pid) {
    try {
      return (await stat(`${SESSIONS_DIR}/${pid}.json`)).mtimeMs;
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  },
};

function parseSessionState(raw: string, pid: number): SessionState {
  const parsed = JSON.parse(raw);
  let status: CliSessionStatus | null = null;
  if (typeof parsed.status === "string") {
    if (!KNOWN_STATUSES.has(parsed.status)) {
      throw new Error(
        `Unknown Claude CLI session status "${parsed.status}" in ${SESSIONS_DIR}/${pid}.json — update the status map`,
      );
    }
    status = parsed.status as CliSessionStatus;
  }
  return {
    sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : null,
    status,
    waitingFor: typeof parsed.waitingFor === "string" ? parsed.waitingFor : null,
  };
}

/**
 * Resolve session state (sessionId + status + waitingFor) for a tmux pane.
 *
 * The pane's root process is usually the claude process itself, but Claude Code
 * can relocate the live session into a daemon-hosted child several levels down
 * (`launcher → daemon run → --bg-pty-host → session`). The launcher's own
 * sessions file is never deleted, so it survives as a tombstone naming a dead
 * session id. Reading `pane_pid` alone therefore pins the pane to that dead id.
 *
 * So: read every sessions file in the pane's process subtree and keep the
 * most recently written one. Freshness is only ever compared *within* the
 * subtree — an idle interactive session can go weeks without writing its file,
 * so mtime against wall-clock says nothing about staleness. Subtree membership
 * is what identifies the live session; mtime only orders the candidates inside it.
 *
 * Ties (identical mtime) resolve to the pid visited last in the BFS — the
 * deepest / latest sibling — so a daemon-hosted child beats its own launcher.
 */
export async function resolveSessionState(
  panePid: number,
  tree: ProcessTree,
  deps: SessionFileDeps = defaultDeps,
): Promise<SessionState> {
  let best: SessionState | null = null;
  let bestMtimeMs = -Infinity;
  for (const pid of subtreePids(tree, panePid)) {
    const raw = await deps.readSessionFile(pid);
    if (raw == null) continue;
    const state = parseSessionState(raw, pid);
    if (state.sessionId == null) continue;
    const mtimeMs = await deps.statSessionFile(pid);
    if (mtimeMs == null) continue; // exited and cleaned up between read and stat
    if (mtimeMs >= bestMtimeMs) {
      best = state;
      bestMtimeMs = mtimeMs;
    }
  }
  return best ?? NULL_STATE;
}

/**
 * Resolve only the Claude session id for a tmux pane.
 * Thin wrapper over resolveSessionState for callers that only need the id.
 */
export async function resolveClaudeSessionId(
  panePid: number,
  tree: ProcessTree,
): Promise<string | null> {
  return (await resolveSessionState(panePid, tree)).sessionId;
}
