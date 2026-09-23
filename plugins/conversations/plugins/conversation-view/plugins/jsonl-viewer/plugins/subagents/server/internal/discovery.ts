import { lstat, readdir } from "node:fs/promises";
import { z } from "zod";
import { resolveConversationTranscriptPaths } from "@plugins/conversations/plugins/transcript-watcher/server";
import { SubagentRequestShapeSchema } from "../../core";

/** Directory Claude Code writes a session's sub-agent transcripts into. */
const SUBAGENT_DIR = "subagents";
const FILE_PREFIX = "agent-";
const TRANSCRIPT_SUFFIX = ".jsonl";
const META_SUFFIX = ".meta.json";

/**
 * What the harness records about one sub-agent, in `agent-<id>.meta.json`.
 *
 * **Only `agentType` and `description` are required, because only they are
 * always written.** The meta format has grown field by field across Claude Code
 * versions, and a conversation's `subagents/` directory accumulates sub-agents
 * from every version it has ever run under — so the older half of a real corpus
 * is missing fields a recent directory has in every file. Measured over the 818
 * meta files on this machine: `spawnDepth` missing in 7, `model` in 34,
 * `toolUseId` in 306, `requestShape` in 396, `parentAgentId` in 802.
 *
 * Optional here means **the harness did not record it**, and a consumer must say
 * so rather than substitute a default — `subagentRunState` already types
 * `requestShape` as possibly absent and falls through to the parent's liveness
 * when it is, which is the honest reading.
 *
 * `requestShape`'s enum stays CLOSED even though the field is optional: a value
 * this build has never heard of is not something to guess at, and a parse
 * failure here is caught per sub-agent (`readMeta`) rather than thrown at the
 * whole list.
 */
const SubagentMetaSchema = z.object({
  agentType: z.string(),
  description: z.string(),
  toolUseId: z.string().optional(),
  /** The requested name, written INSTEAD of a tool-use id for an in-process teammate. */
  name: z.string().optional(),
  model: z.string().optional(),
  requestShape: SubagentRequestShapeSchema.optional(),
  spawnDepth: z.number().int().optional(),
  /** Set on a nested sub-agent: the sub-agent that spawned this one. */
  parentAgentId: z.string().optional(),
});
export type SubagentMeta = z.infer<typeof SubagentMetaSchema>;

/** One sub-agent's pair of files. Either may not exist on disk yet. */
export interface SubagentEntry {
  agentId: string;
  transcriptPath: string;
  metaPath: string;
}

/** A session transcript's sub-agent directory: its path, minus `.jsonl`, plus `/subagents`. */
export function subagentDirOf(transcriptPath: string): string {
  return `${transcriptPath.slice(0, -TRANSCRIPT_SUFFIX.length)}/${SUBAGENT_DIR}`;
}

/**
 * The `subagents/` directories of one conversation — **the one place that
 * decides what this plugin may look at.**
 *
 * Derived from the conversation's ALREADY-ANCHORED session files:
 * `resolveConversationTranscriptPaths` returns only what `resolveAnchoredChain`
 * kept. That derivation is the whole ownership story. A session chain is a list
 * of ids *somebody else* recorded and can name another conversation's session;
 * deriving from the kept entries means a sub-agent directory is unreachable
 * unless its parent transcript already passed the one-conversation-one-projects-
 * dir guard — for free, with nothing to remember.
 *
 * **Never re-resolve from raw session ids.** Globbing each id independently would
 * resolve the foreign entry too, and we would scan — and stream — another
 * agent's sub-agent transcripts. That is the cross-conversation leak
 * `research/2026-08-19-global-pane-session-ownership.md` closed.
 *
 * Every reader below takes its directories as an ARGUMENT, so nothing downstream
 * can widen the set: the scan can only ever see what this function handed it.
 *
 * Existence is NOT checked. The directory of a conversation that has not spawned
 * a sub-agent yet does not exist, and naming it anyway is what lets the watcher
 * notice the moment it does.
 */
export async function subagentDirs(conversationId: string): Promise<string[]> {
  const paths = await resolveConversationTranscriptPaths(conversationId);
  return paths.map(subagentDirOf);
}

/** The agent id inside `agent-<id>.jsonl` / `agent-<id>.meta.json`, or null. */
function agentIdOf(fileName: string): string | null {
  if (!fileName.startsWith(FILE_PREFIX)) return null;
  const suffix = fileName.endsWith(META_SUFFIX)
    ? META_SUFFIX
    : fileName.endsWith(TRANSCRIPT_SUFFIX)
      ? TRANSCRIPT_SUFFIX
      : null;
  if (suffix === null) return null;
  const id = fileName.slice(FILE_PREFIX.length, -suffix.length);
  return id === "" ? null : id;
}

/**
 * Every sub-agent visible in `dirs`, in a stable order.
 *
 * A sub-agent is discovered from EITHER of its files, because the two do not
 * land together: both paths are derived from the id, and whichever is missing
 * simply fails to stat later.
 */
export async function listSubagentEntries(
  dirs: readonly string[],
): Promise<SubagentEntry[]> {
  const byId = new Map<string, SubagentEntry>();
  for (const dir of dirs) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err) {
      // The directory appears the first time a sub-agent is spawned; until then
      // its absence is the ordinary state, not a failure. Anything else throws.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      continue;
    }
    for (const name of names) {
      const agentId = agentIdOf(name);
      if (agentId === null || byId.has(agentId)) continue;
      byId.set(agentId, {
        agentId,
        transcriptPath: `${dir}/${FILE_PREFIX}${agentId}${TRANSCRIPT_SUFFIX}`,
        metaPath: `${dir}/${FILE_PREFIX}${agentId}${META_SUFFIX}`,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.agentId.localeCompare(b.agentId));
}

/**
 * The file list a change signature is taken over: BOTH files of every discovered
 * sub-agent, in entry order.
 *
 * Both halves matter. `transcriptChainSignature` folds in the list LENGTH plus a
 * per-file `(mtime, size)` triple for the files that exist, so a new sub-agent
 * moves the signature through the length, and a `.meta.json` landing after its
 * transcript moves it by adding a triple — which is what makes the row appear.
 */
export function signaturePathsOf(entries: readonly SubagentEntry[]): string[] {
  return entries.flatMap((e) => [e.metaPath, e.transcriptPath]);
}

export interface StatResult {
  mtimeMs: number;
  size: number;
}

/** `lstat`, with "not there yet" as a value and every other failure thrown. */
export async function statIfPresent(path: string): Promise<StatResult | null> {
  try {
    const st = await lstat(path);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return null;
  }
}

/**
 * Reading one sub-agent's metadata has THREE outcomes, and they mean different
 * things to a surface, so they are different arms rather than one nullable
 * value:
 *
 * - `absent`     — the harness has not written the meta file yet. No row at all;
 *                  the card renders "starting".
 * - `read`       — described, though most of its fields may legitimately be
 *                  missing (see `SubagentMetaSchema`).
 * - `unreadable` — the file is there and we cannot make sense of it. Still a
 *                  row, in the `undescribed` arm, so ONE bad meta cannot take out
 *                  every other sub-agent in the conversation.
 */
export type MetaRead =
  | { kind: "absent" }
  | { kind: "read"; meta: SubagentMeta; startedAt: string }
  | { kind: "unreadable"; startedAt: string; reason: string };

// Per-scope meta cache. A meta file is written once at spawn and never
// rewritten, so one read per sub-agent is enough. Only successful reads are
// cached: an `unreadable` result can be a torn read of a file being created, so
// it is retried on the next scan and heals itself.
const metaCaches = new Map<
  string,
  Map<string, { meta: SubagentMeta; startedAt: string }>
>();

/** A short, safe explanation of why a meta could not be understood. */
function reasonFor(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
  }
  if (err instanceof SyntaxError) return "not valid JSON";
  return "unreadable";
}

/**
 * Read (once) a sub-agent's meta.
 *
 * Only the two failures that mean "this FILE makes no sense" are turned into a
 * value — malformed JSON and a shape the schema rejects. Everything else (a
 * permission error, an I/O error) still throws, because those say nothing about
 * the sub-agent and everything about the machine.
 */
export async function readMeta(
  scope: string,
  metaPath: string,
): Promise<MetaRead> {
  let cache = metaCaches.get(scope);
  if (!cache) {
    cache = new Map();
    metaCaches.set(scope, cache);
  }
  const cached = cache.get(metaPath);
  if (cached) return { kind: "read", ...cached };

  const st = await statIfPresent(metaPath);
  if (st === null) return { kind: "absent" };
  const startedAt = new Date(st.mtimeMs).toISOString();

  const text = await Bun.file(metaPath).text();
  let meta: SubagentMeta;
  try {
    meta = SubagentMetaSchema.parse(JSON.parse(text));
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof z.ZodError) {
      return { kind: "unreadable", startedAt, reason: reasonFor(err) };
    }
    throw err;
  }
  cache.set(metaPath, { meta, startedAt });
  return { kind: "read", meta, startedAt };
}

export function evictMetaCache(scope: string): void {
  metaCaches.delete(scope);
}

/**
 * Finding a sub-agent has THREE outcomes, because a name — unlike an id — can
 * be answered by more than one sub-agent, and picking one would put somebody
 * else's work under this card.
 */
export type SubagentLookup =
  | { kind: "found"; entry: SubagentEntry }
  | { kind: "none" }
  | { kind: "ambiguous"; reason: string };

/**
 * The sub-agent a parent's `Agent` call spawned, within the given directories.
 *
 * Matches on the tool-use id when the meta carries one, and otherwise on the
 * name the call requested — the only key a named in-process teammate has, and
 * the case covering 307 of the 818 metas on this machine.
 *
 * `none` is the ordinary state for the seconds between the parent writing its
 * tool-use block and the harness writing the meta file. `ambiguous` is a
 * different thing and stays a different arm: a sub-agent is there, and we refuse
 * to say it is this one. The server mirror of `describedSubagent`'s guard —
 * name matching considers only metas with no `toolUseId` of their own, since one
 * that has an id belongs to a different card.
 */
export async function findSubagentIn(
  scope: string,
  dirs: readonly string[],
  join: { toolUseId: string; requestedName?: string },
): Promise<SubagentLookup> {
  const entries = await listSubagentEntries(dirs);
  const described: {
    entry: SubagentEntry;
    meta: SubagentMeta;
    startedAt: string;
  }[] = [];
  for (const entry of entries) {
    const read = await readMeta(scope, entry.metaPath);
    if (read.kind !== "read") continue;
    if (read.meta.toolUseId === join.toolUseId) return { kind: "found", entry };
    described.push({ entry, meta: read.meta, startedAt: read.startedAt });
  }

  if (join.requestedName === undefined) return { kind: "none" };
  const byName = described.filter(
    (d) => d.meta.toolUseId === undefined && d.meta.name === join.requestedName,
  );
  if (byName.length === 1) return { kind: "found", entry: byName[0]!.entry };
  if (byName.length > 1) {
    return {
      kind: "ambiguous",
      reason: `${byName.length} sub-agents are named "${join.requestedName}", and none of them records a tool-use id`,
    };
  }
  return { kind: "none" };
}

/**
 * A sub-agent by its OWN id — the key every sub-agent has, whoever spawned it.
 *
 * The id names the files directly (`agent-<id>.*`), so there is nothing to join
 * and nothing to refuse: this is how a surface that already holds the row (the
 * running-agents band) opens it. It is the only way to reach a named teammate
 * spawned by ANOTHER sub-agent, whose `Agent` call lives in that sub-agent's
 * transcript rather than the parent chain the call-keyed lookup reads.
 *
 * No meta is required: a sub-agent whose meta is unreadable still has a
 * transcript worth showing.
 */
export async function findSubagentByAgentId(
  dirs: readonly string[],
  agentId: string,
): Promise<SubagentLookup> {
  const entry = (await listSubagentEntries(dirs)).find(
    (e) => e.agentId === agentId,
  );
  return entry === undefined ? { kind: "none" } : { kind: "found", entry };
}
