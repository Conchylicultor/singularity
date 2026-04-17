import { readFile } from "node:fs/promises";
import { homedir } from "node:os";

const SESSIONS_DIR = `${homedir()}/.claude/sessions`;

// Positive-only cache. A null result (sessions file not yet on disk)
// must be re-checked on the next poller tick — otherwise an early race
// where the poller fires before Claude has written ~/.claude/sessions/<pid>.json
// would pin `claudeSessionId` to NULL for the life of the pane.
const pidCache = new Map<number, string>();

async function readSessionId(pid: number): Promise<string | null> {
  try {
    const raw = await readFile(`${SESSIONS_DIR}/${pid}.json`, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.sessionId === "string" ? parsed.sessionId : null;
  } catch {
    return null;
  }
}

async function pgrepChildren(pid: number): Promise<number[]> {
  const proc = Bun.spawn(["/usr/bin/pgrep", "-P", String(pid)], {
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
 * Resolve the Claude session id for a tmux pane.
 *
 * The pane's root process is typically `zsh -l -c 'claude'`, which execs into
 * `claude` directly — so `pane_pid` itself usually IS the claude process. If
 * the sessions file for that pid is missing, fall back to walking direct
 * children (handles configurations where an extra shell layer sits between
 * tmux and claude).
 */
export async function resolveClaudeSessionId(
  panePid: number,
): Promise<string | null> {
  const cached = pidCache.get(panePid);
  if (cached) return cached;

  let sessionId = await readSessionId(panePid);
  if (sessionId == null) {
    for (const child of await pgrepChildren(panePid)) {
      sessionId = await readSessionId(child);
      if (sessionId) break;
    }
  }
  if (sessionId) pidCache.set(panePid, sessionId);
  return sessionId;
}

export function forgetPid(pid: number): void {
  pidCache.delete(pid);
}
