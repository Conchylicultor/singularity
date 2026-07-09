import { readFile, stat } from "node:fs/promises";
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
  liveSubtreeSessionId: string;
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
  /** Every Claude session id named by a sessions file inside the pane's subtree. */
  subtreeSessionIds: (tree: ProcessTree, panePid: number) => Promise<string[]>;
  /** Transcript mtime in epoch ms, or null when the session has no transcript on disk. */
  transcriptMtimeMs: (sessionId: string) => Promise<number | null>;
  listSessionChain: (
    conversationId: string,
  ) => Promise<Array<{ claudeSessionId: string }>>;
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Read every `~/.claude/sessions/<pid>.json` in the pane's process subtree and
 * collect the session ids they name.
 *
 * This deliberately does NOT reuse `resolveSessionState` (runtime-tmux's own
 * "which session is live" answer). That resolver is precisely what this monitor
 * exists to audit: if it picks the wrong id, a detector built on it would agree
 * with it and stay silent. So the process walk is shared — `captureProcessTree`
 * / `subtreePids`, so subtree membership can never differ — while the session
 * evidence is gathered independently from the files themselves.
 *
 * A missing sessions file is a legitimate state (the pid is a shell, or Claude
 * has not written it yet), not a failure — every other error propagates.
 */
async function readSubtreeSessionIds(
  tree: ProcessTree,
  panePid: number,
): Promise<string[]> {
  const ids = new Set<string>();
  for (const pid of subtreePids(tree, panePid)) {
    let raw: string;
    try {
      raw = await readFile(`${CLAUDE_SESSIONS_DIR}/${pid}.json`, "utf8");
    } catch (err) {
      if (isEnoent(err)) continue;
      throw err;
    }
    const sessionId = (JSON.parse(raw) as { sessionId?: unknown }).sessionId;
    if (typeof sessionId === "string" && sessionId) ids.add(sessionId);
  }
  return [...ids];
}

async function readTranscriptMtimeMs(sessionId: string): Promise<number | null> {
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
  subtreeSessionIds: readSubtreeSessionIds,
  transcriptMtimeMs: readTranscriptMtimeMs,
  listSessionChain,
};

/**
 * The divergence predicate. For every active conversation that still owns a live
 * tmux pane, a session id `s` found in that pane's process subtree is a
 * divergence when ALL of:
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
 * Reports the FRESHEST qualifying subtree session, so the single deduped report
 * per conversation names where the agent is actually talking now.
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
    for (const sessionId of await deps.subtreeSessionIds(tree, panePid)) {
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
      liveSubtreeSessionId: live.sessionId,
      tailMtimeMs,
      liveMtimeMs: live.mtimeMs,
    });
  }
  return out;
}
