import { readFile } from "node:fs/promises";
import { CLAUDE_SESSIONS_DIR, PGREP } from "@plugins/infra/plugins/paths/server";

const SESSIONS_DIR = CLAUDE_SESSIONS_DIR;

// Positive-only cache. A null result (sessions file not yet on disk)
// must be re-checked on the next poller tick — otherwise an early race
// where the poller fires before Claude has written ~/.claude/sessions/<pid>.json
// would pin `claudeSessionId` to NULL for the life of the pane.
const pidCache = new Map<number, string>();

// Claude CLI session status values (undocumented internal state from
// ~/.claude/sessions/<pid>.json). Exhaustive as of CLI v2.1.132.
// Hard error on unknown values so new CLI statuses surface immediately.
type CliSessionStatus = "busy" | "idle" | "waiting";

const KNOWN_STATUSES = new Set<string>(["busy", "idle", "waiting"]);

export interface SessionState {
  sessionId: string | null;
  status: CliSessionStatus | null;
  waitingFor: string | null;
}

const NULL_STATE: SessionState = { sessionId: null, status: null, waitingFor: null };

async function readSessionState(pid: number): Promise<SessionState> {
  try {
    const raw = await readFile(`${SESSIONS_DIR}/${pid}.json`, "utf8");
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
  } catch (err) {
    // Re-throw unknown-status errors; swallow ENOENT / parse failures.
    if (err instanceof Error && err.message.startsWith("Unknown Claude CLI")) throw err;
    return NULL_STATE;
  }
}

async function pgrepChildren(pid: number): Promise<number[]> {
  const proc = Bun.spawn([PGREP, "-P", String(pid)], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text
    .trim()
    .split("\n")
    .map((l) => Number(l))
    .filter((n) => Number.isFinite(n));
}

/**
 * Resolve session state (sessionId + status + waitingFor) for a tmux pane.
 *
 * The pane's root process is typically `zsh -l -c 'claude'`, which execs into
 * `claude` directly — so `pane_pid` itself usually IS the claude process. If
 * the sessions file for that pid is missing, fall back to walking direct
 * children (handles configurations where an extra shell layer sits between
 * tmux and claude).
 */
export async function resolveSessionState(
  panePid: number,
): Promise<SessionState> {
  const cached = pidCache.get(panePid);
  if (cached) {
    // sessionId is cached; still need fresh status/waitingFor.
    const state = await readSessionState(panePid);
    if (state.sessionId) return state;
    for (const child of await pgrepChildren(panePid)) {
      const childState = await readSessionState(child);
      if (childState.sessionId) return childState;
    }
    // Cache hit but file disappeared — return cached sessionId with null state.
    return { sessionId: cached, status: null, waitingFor: null };
  }

  let state = await readSessionState(panePid);
  if (state.sessionId == null) {
    for (const child of await pgrepChildren(panePid)) {
      state = await readSessionState(child);
      if (state.sessionId) break;
    }
  }
  if (state.sessionId) pidCache.set(panePid, state.sessionId);
  return state;
}

/**
 * Resolve only the Claude session id for a tmux pane.
 * Thin wrapper over resolveSessionState for callers that only need the id.
 */
export async function resolveClaudeSessionId(
  panePid: number,
): Promise<string | null> {
  return (await resolveSessionState(panePid)).sessionId;
}

export function forgetPid(pid: number): void {
  pidCache.delete(pid);
}
