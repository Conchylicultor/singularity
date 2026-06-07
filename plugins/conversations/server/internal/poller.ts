import {
  listConversationsForInfra,
  updateConversation,
  updateTaskTitle,
  adoptOrphanConversation,
  markConversationGone,
  markConversationClosed,
  notifyConversationsChanged,
} from "@plugins/tasks-core/server";
import { recordCrash } from "@plugins/crashes/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { isTransientDbError } from "@plugins/database/server";
import { getConfig } from "@plugins/config_v2/server";
import { Runtime, flushInteractivePrompt, type RuntimeInfo } from "./runtime";
import { autoAnswerConfig } from "../../shared/config";
import { findTranscriptPath } from "@plugins/conversations/plugins/transcript-watcher/server";
import type { ConversationStatus } from "../../core";

function liveStatusFor(info: RuntimeInfo): ConversationStatus {
  return info.working ? "working" : "waiting";
}

const TICK_MS = 1000;

// Grace window between insertConversation and the tmux pane becoming visible
// to `list-panes`. Within this window, a "starting" row with no live session
// is normal (worktree git fork, claude warmup). Past it, assume the runtime
// never came up (crash mid-create, server restart, claude exited before the
// first poll) and mark gone so the UI moves off "Starting…".
const STARTING_TIMEOUT_MS = 30_000;

interface LiveEntry extends RuntimeInfo {
  runtime: string;
}

let snapshot = new Map<string, LiveEntry>();

async function collectLive(): Promise<{
  next: Map<string, LiveEntry>;
  failedRuntimes: Set<string>;
}> {
  const merged = new Map<string, LiveEntry>();
  const failedRuntimes = new Set<string>();
  for (const runtime of Runtime.all()) {
    let entries: Map<string, RuntimeInfo>;
    try {
      entries = await runtime.list();
    } catch (err) {
      console.error(`[conversations.poller] runtime "${runtime.id}" list failed`, err);
      // eslint-disable-next-line promise-safety/no-bare-catch
      await recordCrash({
        source: "server-caught",
        errorType: "RuntimeListError",
        message: `Runtime "${runtime.id}" list failed: ${err instanceof Error ? err.message : String(err)}`,
        label: "conversations.poller.runtimeList",
      }).catch((e) => {
        console.error("[conversations.poller] recordCrash failed", e);
      });
      failedRuntimes.add(runtime.id);
      continue;
    }
    for (const [id, info] of entries) {
      if (merged.has(id)) {
        console.warn(
          `[conversations.poller] conversation "${id}" claimed by multiple runtimes; last wins`,
        );
      }
      merged.set(id, { ...info, runtime: runtime.id });
    }
  }
  return { next: merged, failedRuntimes };
}

const UNINFORMATIVE_TITLES = ["Untitled", "Untitled conversation", "Claude Code"];

async function tick(): Promise<void> {
  // Scoped recompute (Layer 2): collect the ids of conversations whose row
  // actually changed this tick, so the attempts/tasks cascade recomputes only
  // those rows. `adoptedAny` tracks membership changes (orphan adoption creates
  // attempt/task rows) — those force a FULL recompute, never scoped.
  const changedIds = new Set<string>();
  let adoptedAny = false;
  const [{ next, failedRuntimes }, rows] = await Promise.all([
    collectLive(),
    listConversationsForInfra(),
  ]);
  const dbById = new Map(rows.map((r) => [r.id, r]));

  // Adopt orphans: live sessions with no DB row. Main-only: tmux is global
  // (one server per host), so every worktree's poller sees every other
  // worktree's sessions. Without this guard, each non-main worktree's DB
  // would phantom-clone every conversation it didn't spawn into its own
  // task/attempt/conversation rows.
  if (isMain()) {
    const orphans = [...next.keys()].filter((id) => !dbById.has(id));
    if (orphans.length > 0) {
      for (const id of orphans) {
        const live = next.get(id)!;
        if (live.dead) continue;
        if (!live.worktreePath) continue;
        try {
          const adopted = await adoptOrphanConversation({
            id,
            worktreePath: live.worktreePath,
            runtimeId: live.runtime,
            status: liveStatusFor(live),
            title: live.title || null,
          });
          if (adopted) {
            dbById.set(adopted.id, adopted);
            adoptedAny = true;
          }
        } catch (err) {
          console.error(`[conversations.poller] adopt orphan "${id}" failed`, err);
          // eslint-disable-next-line promise-safety/no-bare-catch
          await recordCrash({
            source: "server-caught",
            errorType: "OrphanAdoptionError",
            message: `Failed to adopt orphan conversation ${id}: ${err instanceof Error ? err.message : String(err)}`,
            label: "conversations.poller.adoptOrphan",
          }).catch((e) => {
            console.error("[conversations.poller] recordCrash failed", e);
          });
        }
      }
    }
  }

  for (const [id, info] of next) {
    const prev = snapshot.get(id);
    if (!prev || prev.working !== info.working) changedIds.add(id);
  }
  for (const id of snapshot.keys()) {
    if (!next.has(id)) changedIds.add(id);
  }
  snapshot = next;

  for (const [id, info] of next) {
    const dbRow = dbById.get(id);
    if (!dbRow) continue;
    // "done" means a deliberate close (exit_clean / toolbar Exit) — never
    // overwrite it back to working/waiting just because the tmux session
    // hasn't been reaped yet.
    if (dbRow.status === "done") continue;

    if (info.dead) {
      if (dbRow.status === "gone") continue;
      if (dbRow.closeRequested) {
        await markConversationClosed(id);
        changedIds.add(id);
      } else {
        if (await markConversationGone(id)) changedIds.add(id);
      }
      continue;
    }

    // Treat uninformative pane titles (e.g. the literal "Claude Code" the CLI
    // sets right after resume) as "no info" so we don't overwrite a previously
    // synthesised, meaningful title.
    const informativeNew = info.title && !UNINFORMATIVE_TITLES.includes(info.title);
    const desiredTitle = informativeNew ? info.title : dbRow.title;
    const desiredStatus = liveStatusFor(info);
    const titleChanged = desiredTitle !== dbRow.title;
    // Only adopt a new claudeSessionId once Claude has actually persisted a
    // transcript for it. Otherwise a freshly-resumed session that dies before
    // the user types anything would overwrite the (still-resumable) id with
    // one that has no transcript on disk, breaking the next Resume.
    const sessionCandidate =
      info.claudeSessionId &&
      info.claudeSessionId !== dbRow.claudeSessionId &&
      (await findTranscriptPath(info.claudeSessionId))
        ? info.claudeSessionId
        : dbRow.claudeSessionId;
    const sessionChanged = sessionCandidate !== dbRow.claudeSessionId;
    const statusChanged = desiredStatus !== dbRow.status;
    const desiredWaitingFor = desiredStatus === "waiting" ? (info.waitingFor ?? null) : null;
    const waitingForChanged = (desiredWaitingFor ?? null) !== (dbRow.waitingFor ?? null);
    if (!titleChanged && !sessionChanged && !statusChanged && !waitingForChanged) continue;

    const resurrecting = dbRow.status === "gone" && desiredStatus !== "gone";
    const patch: Parameters<typeof updateConversation>[1] = {};
    if (titleChanged) patch.title = desiredTitle;
    if (sessionChanged) patch.claudeSessionId = sessionCandidate;
    if (statusChanged) patch.status = desiredStatus;
    if (waitingForChanged) patch.waitingFor = desiredWaitingFor;
    if (resurrecting) patch.endedAt = null;
    await updateConversation(id, patch);

    if (titleChanged && desiredTitle && !UNINFORMATIVE_TITLES.includes(desiredTitle)) {
      await updateTaskTitle(dbRow.taskId, desiredTitle, UNINFORMATIVE_TITLES);
    }
    changedIds.add(id);

    // Auto-open question prompts: the moment a conversation enters the
    // interactive-question wait, optionally dismiss the terminal menu for the
    // user — exactly what clicking "Answer here" does, just done on detection.
    // Gated on the transition (waitingForChanged) so it fires once per question:
    // the flush clears the menu, the probe stops matching, and waitingFor goes
    // null next tick. Fire-and-forget — the 5s self-healing Escape loop must not
    // block the 1s poll. On failure the row stays at "question" and the manual
    // "Answer here" button remains as the fallback.
    if (
      waitingForChanged &&
      desiredWaitingFor === "question" &&
      getConfig(autoAnswerConfig).enabled
    ) {
      void flushInteractivePrompt(id).catch((err) => {
        void recordCrash({
          source: "server-caught",
          errorType: "AutoAnswerFlushError",
          message: `Auto-open question prompt for ${id} failed: ${err instanceof Error ? err.message : String(err)}`,
          label: "conversations.poller.autoAnswerFlush",
        });
      });
    }
  }

  const now = Date.now();
  for (const [id, dbRow] of dbById) {
    if (next.has(id)) continue;
    if (dbRow.status === "gone" || dbRow.status === "done") continue;
    // Runtime list failed (e.g. tmux unreachable under FD pressure). We
    // can't tell whether the session is alive, so leave status alone and
    // wait for a tick where the runtime answers — better than declaring
    // every working/waiting conversation gone on a transient hiccup.
    if (failedRuntimes.has(dbRow.runtime)) continue;
    if (dbRow.status === "starting") {
      const ageMs = now - dbRow.createdAt.getTime();
      if (ageMs < STARTING_TIMEOUT_MS) continue;
      // Stuck-in-"starting" past the grace window means runtime.create's
      // error path didn't run (server killed mid-create, runtime succeeded
      // but the pane vanished before the first tick, future code path that
      // bypassed handle-create's wrapper). The originating exception — if
      // any — was already reported by process-hooks; this is a separate
      // signal that the safety net actually fired. Dedup keeps repeats
      // collapsed into one task with a growing count.
      // eslint-disable-next-line promise-safety/no-bare-catch
      await recordCrash({
        source: "server-caught",
        errorType: "StuckStartingError",
        message: `Conversation ${id} stuck in "starting" for ${Math.round(ageMs / 1000)}s with no live session — sweeping to gone`,
        label: "conversations.poller.startingTimeout",
      }).catch((e) => {
        console.error("[conversations.poller] recordCrash failed", e);
      });
    }
    if (dbRow.closeRequested) {
      await markConversationClosed(id);
      changedIds.add(id);
    } else {
      if (await markConversationGone(id)) changedIds.add(id);
    }
  }

  // Adoption changes attempt/task membership → FULL recompute. Otherwise scope
  // the cascade to just the conversations that actually changed this tick.
  if (adoptedAny) notifyConversationsChanged();
  else if (changedIds.size) notifyConversationsChanged([...changedIds]);
}

function logTickError(label: string, err: unknown): void {
  // Transient = central is restarting / catching up. Next tick will pick up
  // naturally; logging would just spam the recovery window.
  if (isTransientDbError(err)) return;
  console.error(`[conversations.poller] ${label} failed`, err);
}

export function startPoller(): void {
  tick().catch((err) => logTickError("initial tick", err));
  setInterval(() => {
    tick().catch((err) => logTickError("tick", err));
  }, TICK_MS);
}
