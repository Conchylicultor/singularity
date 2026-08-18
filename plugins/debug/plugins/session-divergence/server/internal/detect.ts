import { readdir, readFile, stat } from "node:fs/promises";
import { CLAUDE_SESSIONS_DIR } from "@plugins/infra/plugins/paths/server";
import {
  captureProcessTree,
  listPanes,
  subtreePids,
  type ProcessTree,
} from "@plugins/conversations/plugins/runtime-tmux/server";
import { listSessionChain } from "@plugins/conversations/plugins/session-chain/server";
import { findTranscriptPath } from "@plugins/conversations/plugins/transcript-watcher/server";
import { listActiveConversations } from "@plugins/tasks/plugins/tasks-core/server";

/** One conversation whose live session is invisible to the recorded chain. */
export interface Divergence {
  conversationId: string;
  chainTailSessionId: string;
  liveSessionId: string;
  tailMtimeMs: number;
  liveMtimeMs: number;
}

/** A live tmux pane, reduced to what the detector needs. */
export interface PaneRef {
  panePid: number;
  dead: boolean;
}

/** Every input the predicate reads, injectable so the predicate is testable. */
export interface DetectDeps {
  listActiveConversations: () => Promise<Array<{ id: string }>>;
  listPanes: () => Promise<ReadonlyMap<string, PaneRef>>;
  captureProcessTree: () => Promise<ProcessTree>;
  /** Every Claude session id reachable from the pane (see `readPaneSessionIds`). */
  paneSessionIds: (tree: ProcessTree, panePid: number) => Promise<string[]>;
  /** Transcript mtime in epoch ms, or null when the session has no transcript on disk. */
  transcriptMtimeMs: (sessionId: string) => Promise<number | null>;
  listSessionChain: (
    conversationId: string,
  ) => Promise<Array<{ claudeSessionId: string }>>;
}

/**
 * The three fields of a `~/.claude/sessions/<pid>.json` that say which session a
 * process runs and how a parked session links to the process now hosting it.
 */
export interface SessionLink {
  sessionId: string | null;
  /** Set on the background job's own file. */
  jobId: string | null;
  /** Set on the stub a pane keeps after parking its session into a background job. */
  parkedJobId: string | null;
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function parseSessionLink(raw: string): SessionLink {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    sessionId: readString(parsed.sessionId),
    jobId: readString(parsed.jobId),
    parkedJobId: readString(parsed.parkedJobId),
  };
}

/**
 * Every session id a pane can account for: the ones its own process subtree
 * names, plus — transitively — the ones its parked-job pointers lead to.
 *
 * The pointer hop is not optional. When Claude Code parks a pane's session as a
 * background job the host process is re-parented to launchd, so the live session
 * is nowhere in the subtree; only `parkedJobId` → `jobId` connects them. A
 * detector that walked the subtree alone would find one id, agree with the
 * chain, and stay silent through exactly the outage it exists to catch (which
 * is what happened on 2026-08-18).
 *
 * This deliberately does NOT reuse `resolveSessionState` (runtime-tmux's own
 * "which session is live" answer). That resolver is precisely what this monitor
 * exists to audit: if it picks the wrong id, a detector built on it would agree
 * with it and stay silent. So the process walk is shared — `captureProcessTree`
 * / `subtreePids`, so subtree membership can never differ — while the session
 * evidence, the parked hop included, is gathered independently from the files.
 */
export function reachableSessionIds(
  subtree: readonly SessionLink[],
  directory: readonly SessionLink[],
): string[] {
  const ids = new Set<string>();
  const pending = new Set<string>();
  for (const link of subtree) {
    if (link.sessionId) ids.add(link.sessionId);
    if (link.parkedJobId) pending.add(link.parkedJobId);
  }
  const followed = new Set<string>();
  while (pending.size > 0) {
    const jobId = pending.values().next().value as string;
    pending.delete(jobId);
    if (followed.has(jobId)) continue;
    followed.add(jobId);
    for (const link of directory) {
      if (link.jobId !== jobId) continue;
      if (link.sessionId) ids.add(link.sessionId);
      if (link.parkedJobId && !followed.has(link.parkedJobId)) {
        pending.add(link.parkedJobId);
      }
    }
  }
  return [...ids];
}

/**
 * A sessions file's contents, or null when the pid has none. A missing file is a
 * legitimate state (the pid is a shell, or Claude has not written it yet), not a
 * failure — every other error propagates.
 */
async function readSessionFile(pid: number): Promise<string | null> {
  try {
    return await readFile(`${CLAUDE_SESSIONS_DIR}/${pid}.json`, "utf8");
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

/** Every sessions file on disk — the search space for a parked job's host. */
async function readSessionDirectory(): Promise<SessionLink[]> {
  const links: SessionLink[] = [];
  for (const name of await readdir(CLAUDE_SESSIONS_DIR)) {
    const match = /^(\d+)\.json$/.exec(name);
    if (!match) continue;
    const raw = await readSessionFile(Number(match[1]));
    if (raw != null) links.push(parseSessionLink(raw));
  }
  return links;
}

/** The IO shell around `reachableSessionIds`. */
async function readPaneSessionIds(
  tree: ProcessTree,
  panePid: number,
): Promise<string[]> {
  const subtree: SessionLink[] = [];
  for (const pid of subtreePids(tree, panePid)) {
    const raw = await readSessionFile(pid);
    if (raw != null) subtree.push(parseSessionLink(raw));
  }
  // The directory listing is the cost of the pointer hop, so it is paid only by
  // the panes that actually parked something.
  const directory = subtree.some((l) => l.parkedJobId)
    ? await readSessionDirectory()
    : [];
  return reachableSessionIds(subtree, directory);
}

async function readTranscriptMtimeMs(
  sessionId: string,
): Promise<number | null> {
  const path = await findTranscriptPath(sessionId);
  if (path == null) return null; // no transcript written yet — a legitimate state
  try {
    return (await stat(path)).mtimeMs;
  } catch (err) {
    if (isEnoent(err)) return null; // deleted between glob and stat
    throw err;
  }
}

export const defaultDeps: DetectDeps = {
  listActiveConversations,
  listPanes,
  captureProcessTree,
  paneSessionIds: readPaneSessionIds,
  transcriptMtimeMs: readTranscriptMtimeMs,
  listSessionChain,
};

/**
 * The divergence predicate. For every active conversation that still owns a live
 * tmux pane, a session id `s` reachable from that pane — in its process subtree,
 * or through a parked-job pointer out of it — is a divergence when ALL of:
 *
 *   (a) `s` is absent from the conversation's recorded session chain — the UI
 *       has no idea this session exists, so none of its turns can ever render;
 *   (b) `s` has a transcript file on disk — the agent really is talking there,
 *       rather than `s` being a launcher tombstone that never ran a turn;
 *   (c) `s`'s transcript mtime leads the chain TAIL's transcript mtime by more
 *       than `graceMs` — the invisible session is where the conversation has
 *       actually moved, not merely a stale sibling.
 *
 * (c) is what keeps the monitor quiet in the normal fork: a freshly-spawned
 * session writes its transcript a moment before the 1s poller appends it to the
 * chain, so it trivially satisfies (a) and (b) for that instant. It only trips
 * once the lead exceeds the grace window — i.e. the poller has had minutes of
 * ticks to record it and still hasn't.
 *
 * A conversation whose chain is empty, or whose tail has no transcript yet, is
 * skipped: there is no baseline to measure a lead against. Silent when healthy.
 *
 * Reports the FRESHEST qualifying session, so the single deduped report per
 * conversation names where the agent is actually talking now.
 */
export async function detectDivergences(
  graceMs: number,
  deps: DetectDeps = defaultDeps,
): Promise<Divergence[]> {
  const panes = await deps.listPanes();
  const conversations = (await deps.listActiveConversations()).filter((c) => {
    const pane = panes.get(c.id);
    return pane !== undefined && !pane.dead;
  });
  if (conversations.length === 0) return [];

  // One snapshot of the whole process table for every pane, exactly as the
  // runtime's own resolution pass takes it.
  const tree = await deps.captureProcessTree();

  const out: Divergence[] = [];
  for (const conv of conversations) {
    const panePid = panes.get(conv.id)!.panePid;

    const chain = await deps.listSessionChain(conv.id);
    const tail = chain.at(-1);
    if (!tail) continue; // poller has not observed any session for this pane yet

    const tailMtimeMs = await deps.transcriptMtimeMs(tail.claudeSessionId);
    if (tailMtimeMs == null) continue; // no baseline to measure a lead against

    const chainIds = new Set(chain.map((e) => e.claudeSessionId));

    let live: { sessionId: string; mtimeMs: number } | null = null;
    for (const sessionId of await deps.paneSessionIds(tree, panePid)) {
      if (chainIds.has(sessionId)) continue; // (a)
      const mtimeMs = await deps.transcriptMtimeMs(sessionId);
      if (mtimeMs == null) continue; // (b)
      if (mtimeMs - tailMtimeMs <= graceMs) continue; // (c)
      if (!live || mtimeMs > live.mtimeMs) live = { sessionId, mtimeMs };
    }
    if (!live) continue;

    out.push({
      conversationId: conv.id,
      chainTailSessionId: tail.claudeSessionId,
      liveSessionId: live.sessionId,
      tailMtimeMs,
      liveMtimeMs: live.mtimeMs,
    });
  }
  return out;
}
