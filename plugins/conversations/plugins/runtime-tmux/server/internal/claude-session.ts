import { readdir, readFile, stat } from "node:fs/promises";
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

/**
 * One `~/.claude/sessions/<pid>.json` as we read it: the live-session fields a
 * pane cares about, plus the two ids that link a *parked* session to the
 * background process now hosting it (see `followParkedJob`).
 */
interface SessionFileRecord extends SessionState {
  /** Set on the stub left behind in the pane when its session was parked. */
  parkedJobId: string | null;
  /** Set on the background job's own file — the other end of `parkedJobId`. */
  jobId: string | null;
}

// Not an absorbed failure: the sessions file legitimately does not exist yet
// when the poller fires before Claude has written ~/.claude/sessions/<pid>.json.
// Every caller re-resolves on the next tick, so this must stay a value, not a throw.
const NULL_STATE: SessionState = {
  sessionId: null,
  status: null,
  waitingFor: null,
};

/** Session-file IO, injectable so resolution is testable without a real /proc. */
export interface SessionFileDeps {
  /** Raw file contents, or null when the pid has no sessions file (ENOENT). */
  readSessionFile: (pid: number) => Promise<string | null>;
  /** File mtime in epoch ms, or null when the pid has no sessions file (ENOENT). */
  statSessionFile: (pid: number) => Promise<number | null>;
  /**
   * Every pid that has a sessions file right now — the search space for a
   * parked job's host, which by definition lives OUTSIDE the pane's subtree.
   * Only read when a parked pointer is actually present, so the directory
   * listing costs nothing on the 22-of-23 panes that never park.
   */
  listSessionPids: () => Promise<number[]>;
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
  async listSessionPids() {
    // No ENOENT guard: this only ever runs after a sessions file in this very
    // directory was read, so a missing directory here is a real failure.
    const pids: number[] = [];
    for (const name of await readdir(SESSIONS_DIR)) {
      const match = /^(\d+)\.json$/.exec(name);
      if (match) pids.push(Number(match[1]));
    }
    return pids;
  },
};

/** A present, non-empty string field, or null. */
function readString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function parseSessionFile(raw: string, pid: number): SessionFileRecord {
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
    sessionId: readString(parsed.sessionId),
    status,
    waitingFor: readString(parsed.waitingFor),
    parkedJobId: readString(parsed.parkedJobId),
    jobId: readString(parsed.jobId),
  };
}

/**
 * The freshest sessions file inside the pane's process subtree, or null when
 * the subtree names no session at all.
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
async function resolveSubtreeRecord(
  panePid: number,
  tree: ProcessTree,
  deps: SessionFileDeps,
): Promise<SessionFileRecord | null> {
  let best: SessionFileRecord | null = null;
  let bestMtimeMs = -Infinity;
  for (const pid of subtreePids(tree, panePid)) {
    const raw = await deps.readSessionFile(pid);
    if (raw == null) continue;
    const record = parseSessionFile(raw, pid);
    if (record.sessionId == null) continue;
    const mtimeMs = await deps.statSessionFile(pid);
    if (mtimeMs == null) continue; // exited and cleaned up between read and stat
    if (mtimeMs >= bestMtimeMs) {
      best = record;
      bestMtimeMs = mtimeMs;
    }
  }
  return best;
}

/**
 * The sessions file of the background job `jobId`, or null when no live process
 * claims it. Scans every sessions file, since a parked job's host is re-parented
 * to launchd and so is unreachable from the pane's process tree.
 *
 * Only `jobId` is read while scanning: a full parse would make an unrecognised
 * CLI status in some *other* conversation's file throw for this pane.
 */
async function findJobHost(
  jobId: string,
  deps: SessionFileDeps,
): Promise<SessionFileRecord | null> {
  for (const pid of await deps.listSessionPids()) {
    const raw = await deps.readSessionFile(pid);
    if (raw == null) continue; // exited between the listing and the read
    if (readString((JSON.parse(raw) as { jobId?: unknown }).jobId) !== jobId)
      continue;
    const record = parseSessionFile(raw, pid);
    if (record.sessionId != null) return record;
  }
  return null;
}

/**
 * Follow a parked session to wherever it is actually running.
 *
 * Claude Code can *park* a pane's session as a background job: it forks the
 * conversation to a new session id and hands it to a `--bg-pty-host` process
 * that launchd re-parents, leaving behind a stub in the pane that keeps
 * rendering the job through the daemon. The stub's own sessions file stops
 * being written at that instant and still names the pre-fork session id, so
 * mtime cannot find the live session — the subtree simply does not contain it,
 * and no amount of freshness comparison inside the subtree ever will.
 *
 * The stub does record `parkedJobId`, and the host's file records the matching
 * `jobId`. That pointer is the only link between them, so it is what we follow,
 * and it is authoritative — no mtime comparison, since a stale-by-construction
 * stub would win one. A job that has since exited leaves the stub as the best
 * id we have, which is the pre-park behaviour. `followed` bounds the walk, so a
 * job that (or a cycle that) parks again can never spin here.
 */
async function followParkedJob(
  stub: SessionFileRecord,
  deps: SessionFileDeps,
): Promise<SessionFileRecord> {
  let current = stub;
  const followed = new Set<string>();
  while (current.parkedJobId != null && !followed.has(current.parkedJobId)) {
    followed.add(current.parkedJobId);
    const host = await findJobHost(current.parkedJobId, deps);
    if (host == null) return current; // the job is gone — keep what the pane names
    current = host;
  }
  return current;
}

/**
 * Resolve session state (sessionId + status + waitingFor) for a tmux pane: the
 * freshest session in its process subtree, then — if that one has been parked
 * into a background job — the job it points at.
 */
export async function resolveSessionState(
  panePid: number,
  tree: ProcessTree,
  deps: SessionFileDeps = defaultDeps,
): Promise<SessionState> {
  const inPane = await resolveSubtreeRecord(panePid, tree, deps);
  if (inPane == null) return NULL_STATE;
  const { sessionId, status, waitingFor } = await followParkedJob(inPane, deps);
  return { sessionId, status, waitingFor };
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
