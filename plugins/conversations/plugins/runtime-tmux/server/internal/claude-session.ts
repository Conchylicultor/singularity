import { readFile } from "node:fs/promises";
import { homedir } from "node:os";

const SESSIONS_DIR = `${homedir()}/.claude/sessions`;

// Cache session-id resolution by claude pid. A fresh pid always re-reads;
// unchanged pid re-uses prior result (including null for "not found").
const pidCache = new Map<number, string | null>();

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
  if (pidCache.has(panePid)) return pidCache.get(panePid)!;

  let sessionId = await readSessionId(panePid);
  if (sessionId == null) {
    for (const child of await pgrepChildren(panePid)) {
      sessionId = await readSessionId(child);
      if (sessionId) break;
    }
  }
  pidCache.set(panePid, sessionId);
  return sessionId;
}

export function forgetPid(pid: number): void {
  pidCache.delete(pid);
}
