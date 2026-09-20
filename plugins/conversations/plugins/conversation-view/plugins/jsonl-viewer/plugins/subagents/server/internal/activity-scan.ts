import type { LastStep, SubagentActivityRow } from "../../core";
import {
  evictMetaCache,
  listSubagentEntries,
  readMeta,
  statIfPresent,
  subagentDirs,
  signaturePathsOf,
  type SubagentEntry,
} from "./discovery";
import { readLastStep } from "./tail-read";

/** What we remember about one sub-agent's transcript between scans. */
interface TranscriptState {
  mtimeMs: number;
  size: number;
  lastStep: LastStep | null;
  lastActivityAt: string;
}

/**
 * Per-scope incremental scan state — the reason a change costs ONE bounded tail
 * read rather than a re-parse of every sub-agent transcript.
 *
 * Each entry holds the `(mtime, size)` the row was built from; a scan re-stats
 * (cheap, a handful of files) and only re-reads the tail of the files whose stat
 * actually moved. Dropped when nothing is subscribed to the conversation.
 */
const scans = new Map<string, Map<string, TranscriptState>>();

export function evictActivityScan(scope: string): void {
  scans.delete(scope);
  evictMetaCache(scope);
}

/** The files this conversation's activity signature is taken over, and the dirs to watch. */
export async function resolveActivityTargets(
  conversationId: string,
): Promise<{ paths: string[]; dirs: string[] }> {
  const dirs = await subagentDirs(conversationId);
  const entries = await listSubagentEntries(dirs);
  return { paths: signaturePathsOf(entries), dirs };
}

/**
 * Every sub-agent in `dirs`, with what it is doing right now.
 *
 * Takes its directories rather than fetching them, so the set it may read is
 * decided in exactly one place (`subagentDirs`) and cannot be widened here.
 *
 * **One unreadable meta costs one row, never the list.** A sub-agent whose meta
 * the schema rejects becomes an `undescribed` row carrying everything the
 * filesystem still knows — before this, it threw inside the loader and NO card
 * in the conversation rendered. A sub-agent whose meta has not been written yet
 * gets no row at all: it is not yet known to exist under any name, and the card
 * renders that absence as "starting".
 */
export async function scanActivityIn(
  scope: string,
  dirs: readonly string[],
): Promise<SubagentActivityRow[]> {
  const entries = await listSubagentEntries(dirs);

  let state = scans.get(scope);
  if (!state) {
    state = new Map();
    scans.set(scope, state);
  }

  const rows: SubagentActivityRow[] = [];
  const live = new Set<string>();

  for (const entry of entries) {
    const read = await readMeta(scope, entry.metaPath);
    if (read.kind === "absent") continue;
    live.add(entry.agentId);

    const transcript = await refreshTranscriptState(entry, state);
    const base = {
      agentId: entry.agentId,
      startedAt: read.startedAt,
      lastActivityAt: transcript?.lastActivityAt ?? read.startedAt,
      lastStep: transcript?.lastStep ?? null,
    };

    if (read.kind === "unreadable") {
      rows.push({ kind: "undescribed", ...base, reason: read.reason });
      continue;
    }
    const { meta } = read;
    rows.push({
      kind: "described",
      ...base,
      agentType: meta.agentType,
      description: meta.description,
      toolUseId: meta.toolUseId,
      name: meta.name,
      model: meta.model,
      requestShape: meta.requestShape,
      spawnDepth: meta.spawnDepth,
      parentAgentId: meta.parentAgentId,
    });
  }

  for (const agentId of [...state.keys()]) {
    if (!live.has(agentId)) state.delete(agentId);
  }

  rows.sort(
    (a, b) =>
      a.startedAt.localeCompare(b.startedAt) ||
      a.agentId.localeCompare(b.agentId),
  );
  return rows;
}

/** `scanActivityIn`, bound to a conversation's own anchored directories. */
export async function scanActivity(
  conversationId: string,
): Promise<SubagentActivityRow[]> {
  return scanActivityIn(conversationId, await subagentDirs(conversationId));
}

/**
 * The one tail read. Re-stat is cheap and always runs; the read happens only
 * when the file actually moved since the row was last built.
 */
async function refreshTranscriptState(
  entry: SubagentEntry,
  state: Map<string, TranscriptState>,
): Promise<TranscriptState | null> {
  const st = await statIfPresent(entry.transcriptPath);
  if (st === null) return null;

  const cached = state.get(entry.agentId);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    return cached;
  }
  const fresh: TranscriptState = {
    mtimeMs: st.mtimeMs,
    size: st.size,
    lastStep: await readLastStep(entry.transcriptPath, st.size),
    lastActivityAt: new Date(st.mtimeMs).toISOString(),
  };
  state.set(entry.agentId, fresh);
  return fresh;
}
