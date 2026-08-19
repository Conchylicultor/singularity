import { readdir, readFile, stat } from "node:fs/promises";
import { CLAUDE_SESSIONS_DIR } from "@plugins/infra/plugins/paths/server";
import {
  captureProcessTree,
  listPanes,
  subtreePids,
  type ProcessTree,
} from "@plugins/conversations/plugins/runtime-tmux/server";
import { listSessionChain } from "@plugins/conversations/plugins/session-chain/server";
import {
  findTranscriptPath,
  resolveAnchoredChain,
  type AnchoredChain,
} from "@plugins/conversations/plugins/transcript-watcher/server";
import { listActiveConversations } from "@plugins/tasks/plugins/tasks-core/server";

/** One conversation whose live session is invisible to the recorded chain. */
export interface Divergence {
  conversationId: string;
  chainTailSessionId: string;
  liveSessionId: string;
  tailMtimeMs: number;
  liveMtimeMs: number;
}

/**
 * A live tmux pane, reduced to what the detector needs: where to start the
 * subtree walk (`panePid`), which pane a session record has to name to be
 * naming *us* (`paneId`), and whether the pane is still alive.
 */
export interface PaneRef {
  panePid: number;
  /** `#{pane_id}`, e.g. "%3429" — immutable for the pane's whole life. */
  paneId: string;
  dead: boolean;
}

/**
 * Who else could be claiming a session record found under our pane.
 *
 * `knownPaneIds` is every pane id tmux currently reports, dead panes included:
 * the question it answers is "is there a pane that this record could be
 * stamping?", and a pane that has died still owns the id it was stamped with.
 */
export interface ClaimContext {
  paneId: string;
  knownPaneIds: ReadonlySet<string>;
}

/** Every input the predicate reads, injectable so the predicate is testable. */
export interface DetectDeps {
  listActiveConversations: () => Promise<Array<{ id: string }>>;
  listPanes: () => Promise<ReadonlyMap<string, PaneRef>>;
  captureProcessTree: () => Promise<ProcessTree>;
  /** Every Claude session id reachable from the pane (see `readPaneSessionIds`). */
  paneSessionIds: (
    tree: ProcessTree,
    pane: PaneRef,
    knownPaneIds: ReadonlySet<string>,
  ) => Promise<string[]>;
  /** Transcript mtime in epoch ms, or null when the session has no transcript on disk. */
  transcriptMtimeMs: (sessionId: string) => Promise<number | null>;
  listSessionChain: (
    conversationId: string,
  ) => Promise<Array<{ claudeSessionId: string }>>;
  /** The chain partitioned into the conversation's own sessions and foreign ones. */
  anchoredChain: (sessionIds: readonly string[]) => Promise<AnchoredChain>;
}

/**
 * The fields of a `~/.claude/sessions/<pid>.json` that say which session a
 * process runs, how a parked session links to the process now hosting it, and
 * whether somebody *else* has already claimed the record.
 */
export interface SessionLink {
  sessionId: string | null;
  /** Set on the background job's own file. */
  jobId: string | null;
  /** Set on the stub a pane keeps after parking its session into a background job. */
  parkedJobId: string | null;
  /** `%pane_id` out of the `tmux` stamp, or null when the file carries no stamp. */
  stampedPaneId: string | null;
  /** `"bg"` for a daemon-hosted background process, `"interactive"` for a pane's own. */
  kind: string | null;
}

// The CLI stamps `tmux` as `#{session_name}:#{window_id}.#{pane_id}`. Only the
// trailing `%pane_id` is read: `session_name` and `window_id` move under
// `rename-session` / `break-pane` / `move-window`, `#{pane_id}` never does.
// Deliberately a second copy of runtime-tmux's regex — see the note on
// `reachableSessionIds` about duplicating every judgement.
const TMUX_STAMP_RE = /^(.+):(@\d+)\.(%\d+)$/;

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * The `%pane_id` a record stamps, or null when it stamps nothing we can read.
 *
 * A stamp we cannot parse makes the resolver **throw** (format drift must be
 * loud on the first pane that hits it, rather than silently demoting the whole
 * fleet to the locality tier). Here it must not: the detector reads the same
 * files the resolver does, so the drift is already loud over there, and a second
 * throw would only kill the monitor that is supposed to still be watching while
 * the resolver is broken. Unreadable therefore degrades to "claims nobody",
 * which keeps the record as EVIDENCE — the direction that can only ever cost us
 * a false positive, never the silence this plugin exists to prevent.
 */
function parseStampedPaneId(value: unknown): string | null {
  const stamp = readString(value);
  if (stamp == null) return null;
  return TMUX_STAMP_RE.exec(stamp)?.[3] ?? null;
}

function parseSessionLink(raw: string): SessionLink {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    sessionId: readString(parsed.sessionId),
    jobId: readString(parsed.jobId),
    parkedJobId: readString(parsed.parkedJobId),
    stampedPaneId: parseStampedPaneId(parsed.tmux),
    kind: readString(parsed.kind),
  };
}

/**
 * Does this record say, in so many words, that it belongs to a DIFFERENT pane
 * that exists?
 *
 * Three-way on purpose. A stamp naming us is ours. A stamp naming another pane
 * tmux still reports is that pane's business, not ours. A stamp naming a pane
 * tmux no longer reports is *not* an exclusion: the pane it named is gone, so
 * the session may well have been relocated to where we are looking now — and a
 * relocated session that nobody claims is exactly the shape this monitor exists
 * to see.
 */
function claimedByAnotherPane(link: SessionLink, claim: ClaimContext): boolean {
  const stamped = link.stampedPaneId;
  if (stamped == null || stamped === claim.paneId) return false;
  return claim.knownPaneIds.has(stamped);
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
 *
 * ## Two exclusions, and the asymmetry that keeps them safe
 *
 * Proximity is not ownership: Claude Code runs ONE background daemon per
 * machine, parented under whichever pane happened to start it, and lends its
 * pre-warmed spares to any conversation. So an unrelated agent's process really
 * does sit inside this pane's subtree. Two kinds of link are therefore dropped
 * before they can count as evidence:
 *
 *   1. **Foreign claim** — the record stamps a different pane that `listPanes`
 *      knows about (see `claimedByAnotherPane`). Somebody else has said, on the
 *      record, that this is theirs.
 *   2. **Background host** — `kind: "bg"`. A background session reaches this
 *      pane ONLY through the pane's own `parkedJobId` → `jobId` hop below, which
 *      is an explicit pointer rather than an accident of process parentage. The
 *      lent spare has no such pointer from us, so it drops out; a genuinely
 *      parked session of ours is still found, because the hop searches every
 *      sessions file on the machine.
 *
 * Without these, the monitor would fire on the daemon-hosting pane every 5
 * minutes forever the moment the resolver (correctly) stopped adopting the
 * spare's id: absent from the chain ✓, has a transcript ✓, leads the tail ✓. An
 * alarm that always fires is an alarm that is off.
 *
 * **The exclusions are NOT the resolver's inclusion rule, and must never become
 * it.** The resolver admits a record only when it claims the pane — by stamp, or
 * by being unstamped, non-`bg` and local to the pane's worktree. This detector
 * excludes only what *somebody else* has claimed. Everything merely unclaimed —
 * unstamped, wrong `cwd`, a stamp naming a pane that no longer exists — stays
 * evidence here even though the resolver would refuse it. That gap IS the
 * monitor: the shapes the resolver deliberately declines to guess at are the
 * shapes that froze a transcript for 747 minutes in July 2026 and for 10h25m on
 * 2026-08-18. Giving the detector the resolver's predicate would make it agree
 * with the resolver by construction and go quiet again — which is precisely how
 * the 2026-08-18 outage ran unreported.
 */
export function reachableSessionIds(
  subtree: readonly SessionLink[],
  directory: readonly SessionLink[],
  claim: ClaimContext,
): string[] {
  const ids = new Set<string>();
  const pending = new Set<string>();
  for (const link of subtree) {
    if (claimedByAnotherPane(link, claim)) continue;
    if (link.kind === "bg") continue;
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
      // No claim filtering on this side: we only got here by following OUR own
      // stub's pointer, which is authoritative and is the whole reason the
      // subtree pass can drop `kind: "bg"` outright.
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
  pane: PaneRef,
  knownPaneIds: ReadonlySet<string>,
): Promise<string[]> {
  const subtree: SessionLink[] = [];
  for (const pid of subtreePids(tree, pane.panePid)) {
    const raw = await readSessionFile(pid);
    if (raw != null) subtree.push(parseSessionLink(raw));
  }
  // The directory listing is the cost of the pointer hop, so it is paid only by
  // the panes that actually parked something. The test is on the RAW links, not
  // the admitted ones: over-reading the directory is a wasted readdir on a pane
  // that hosts somebody else's stub, whereas re-stating the admission rule here
  // would be a second copy of a judgement that only `reachableSessionIds` owns.
  const directory = subtree.some((l) => l.parkedJobId)
    ? await readSessionDirectory()
    : [];
  return reachableSessionIds(subtree, directory, {
    paneId: pane.paneId,
    knownPaneIds,
  });
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
  anchoredChain: (sessionIds) => resolveAnchoredChain(sessionIds),
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
 *   (c) `s`'s transcript mtime leads the BASELINE's transcript mtime by more
 *       than `graceMs` — the invisible session is where the conversation has
 *       actually moved, not merely a stale sibling.
 *
 * (c) is what keeps the monitor quiet in the normal fork: a freshly-spawned
 * session writes its transcript a moment before the 1s poller appends it to the
 * chain, so it trivially satisfies (a) and (b) for that instant. It only trips
 * once the lead exceeds the grace window — i.e. the poller has had minutes of
 * ticks to record it and still hasn't.
 *
 * **The baseline is the last ANCHORED entry of the chain, not `chain.at(-1)`.**
 * A chain corrupted by cross-talk has a foreign id as its tail (that is how the
 * 2026-08-19 incident presented), so `chain.at(-1)`'s transcript is an unrelated
 * worktree's file and its mtime is an unrelated agent's typing speed. Measuring
 * a lead against that is measuring against noise: a busy stranger's session
 * hides a genuine divergence, an idle one invents a fake lead. `resolveAnchoredChain`
 * hands back exactly the entries that live in this conversation's own projects
 * directory, so the last of those is the newest transcript the UI can actually
 * render — which is what "the conversation has moved past it" has to mean.
 *
 * A conversation whose chain is empty, or none of whose entries resolve to a
 * transcript, is skipped: there is no baseline to measure a lead against. Same
 * semantics as before — `kept` is empty exactly when nothing resolved, since the
 * first id that resolves is what anchors the directory.
 *
 * Note (a) still tests the WHOLE chain, foreign entries included: an id already
 * recorded is not an omission, whatever else is wrong with it. Commission — an
 * id in the chain that should not be there — is `./detect-commission`'s job.
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

  // Every pane id on the machine, so a record stamping one of them can be
  // recognised as somebody else's. Taken from the same `listPanes` the pane
  // lookup above uses, so the two can never disagree about which panes exist.
  const knownPaneIds = new Set([...panes.values()].map((p) => p.paneId));

  // One snapshot of the whole process table for every pane, exactly as the
  // runtime's own resolution pass takes it.
  const tree = await deps.captureProcessTree();

  const out: Divergence[] = [];
  for (const conv of conversations) {
    const pane = panes.get(conv.id)!;

    const chain = await deps.listSessionChain(conv.id);
    if (chain.length === 0) continue; // poller has not observed any session yet
    const chainIds = chain.map((e) => e.claudeSessionId);

    const { kept } = await deps.anchoredChain(chainIds);
    const baseline = kept.at(-1);
    if (!baseline) continue; // nothing in the chain resolves — no baseline

    const tailMtimeMs = await deps.transcriptMtimeMs(baseline.sessionId);
    if (tailMtimeMs == null) continue; // GC'd between resolve and stat

    const recorded = new Set(chainIds);

    let live: { sessionId: string; mtimeMs: number } | null = null;
    for (const sessionId of await deps.paneSessionIds(
      tree,
      pane,
      knownPaneIds,
    )) {
      if (recorded.has(sessionId)) continue; // (a)
      const mtimeMs = await deps.transcriptMtimeMs(sessionId);
      if (mtimeMs == null) continue; // (b)
      if (mtimeMs - tailMtimeMs <= graceMs) continue; // (c)
      if (!live || mtimeMs > live.mtimeMs) live = { sessionId, mtimeMs };
    }
    if (!live) continue;

    out.push({
      conversationId: conv.id,
      chainTailSessionId: baseline.sessionId,
      liveSessionId: live.sessionId,
      tailMtimeMs,
      liveMtimeMs: live.mtimeMs,
    });
  }
  return out;
}
