import {
  listConversationsForInfra,
  listExistingConversationIds,
  updateConversation,
  updateTaskTitle,
  adoptOrphanConversation,
  markConversationGone,
  markConversationClosed,
  setConversationHibernated,
} from "@plugins/tasks/plugins/tasks-core/server";
import { recordReport } from "@plugins/reports/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { isTransientDbError } from "@plugins/database/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { getConfig } from "@plugins/config_v2/server";
import { Runtime, flushInteractivePrompt, type RuntimeInfo } from "./runtime";
import { autoAnswerConfig } from "../../shared/config";
import { hibernationConfig } from "../../core/hibernation-config";
import { decideMissingProcessAction } from "./hibernation-decision";
import {
  findTranscriptPath,
  refreshConversationChain,
} from "@plugins/conversations/plugins/transcript-watcher/server";
import { recordSessionId } from "@plugins/conversations/plugins/session-chain/server";
import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";

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
      await recordReport({
        kind: "crash",
        source: "server-caught",
        message: `Runtime "${runtime.id}" list failed: ${err instanceof Error ? err.message : String(err)}`,
        data: { errorType: "RuntimeListError", label: "conversations.poller.runtimeList" },
      }).catch((e) => {
        console.error("[conversations.poller] recordReport failed", e);
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
    // `dbById` is the *active* (status <> 'done') set. A live host-wide tmux
    // session whose conversation row exists but is terminal (`done`) is absent
    // from it — so filtering on `dbById` alone re-classifies it as an orphan and
    // re-adopts it (a zero-row INSERT … ON CONFLICT DO NOTHING) every tick,
    // churning the change-feed. Re-check the candidates against the full table
    // (any status) so a terminal conversation stays terminal and is adopted at
    // most once.
    const candidates = [...next.keys()].filter((id) => !dbById.has(id));
    const existing = await listExistingConversationIds(candidates);
    const orphans = candidates.filter((id) => !existing.has(id));
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
          }
        } catch (err) {
          console.error(`[conversations.poller] adopt orphan "${id}" failed`, err);
          // eslint-disable-next-line promise-safety/no-bare-catch
          await recordReport({
            kind: "crash",
            source: "server-caught",
            message: `Failed to adopt orphan conversation ${id}: ${err instanceof Error ? err.message : String(err)}`,
            data: { errorType: "OrphanAdoptionError", label: "conversations.poller.adoptOrphan" },
          }).catch((e) => {
            console.error("[conversations.poller] recordReport failed", e);
          });
        }
      }
    }
  }

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
      } else {
        await markConversationGone(id);
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

    // `conversations.claude_session_id` is the live TAIL (what `claude --resume`
    // hands back); the chain is the full ordered history the transcript readers
    // merge. Every id the poller adopts — including the first, since `null → sid`
    // flows through this same branch — is appended here, behind the transcript
    // gate above, so a session with no file on disk never enters the chain.
    //
    // Chain ORDER comes from `seenAt` = the DB's `now()`, which is TRANSACTION
    // START time. Safe here: each call is its own implicit transaction, and ticks
    // are ≥1s apart. A future caller appending two ids inside one transaction
    // would give them an identical `seenAt` and scramble the chain order.
    if (sessionChanged && sessionCandidate) {
      await recordSessionId(id, sessionCandidate);
      // Let any live subscriber follow the new file now, rather than at the next
      // 30s watcher reconcile.
      await refreshConversationChain(id);
    }

    if (titleChanged && desiredTitle && !UNINFORMATIVE_TITLES.includes(desiredTitle)) {
      await updateTaskTitle(dbRow.taskId, desiredTitle, UNINFORMATIVE_TITLES);
    }

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
      void runTracked("conversations:flush-interactive-prompt", () =>
        flushInteractivePrompt(id).catch((err) => {
          void recordReport({
            kind: "crash",
            source: "server-caught",
            message: `Auto-open question prompt for ${id} failed: ${err instanceof Error ? err.message : String(err)}`,
            data: { errorType: "AutoAnswerFlushError", label: "conversations.poller.autoAnswerFlush" },
          });
        }),
      );
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
      await recordReport({
        kind: "crash",
        source: "server-caught",
        message: `Conversation ${id} stuck in "starting" for ${Math.round(ageMs / 1000)}s with no live session — sweeping to gone`,
        data: { errorType: "StuckStartingError", label: "conversations.poller.startingTimeout" },
      }).catch((e) => {
        console.error("[conversations.poller] recordReport failed", e);
      });
    }
    if (dbRow.closeRequested) {
      await markConversationClosed(id);
      continue;
    }

    // Suspend-instead-of-gone: a waiting, resumable conversation whose process
    // is missing (idle-killed or lost to a reboot) becomes hibernated rather
    // than gone — it keeps showing as a normal Waiting conversation and is
    // silently resumed on open. Close still wins (handled above). The poller
    // NEVER clears `hibernatedAt` — only `ensureResumed` does. See
    // `decideMissingProcessAction` for the eligibility-vs-re-stamp split.
    const action = decideMissingProcessAction(dbRow, {
      onMain: isMain(),
      hibernationEnabled: getConfig(hibernationConfig).enabled,
    });
    if (action === "hibernate") {
      await setConversationHibernated(id, new Date());
      continue;
    }
    if (action === "leave-hibernated") continue;
    // action === "gone"
    await markConversationGone(id);
  }
}

function logTickError(label: string, err: unknown): void {
  // Transient = central is restarting / catching up. Next tick will pick up
  // naturally; logging would just spam the recovery window.
  if (isTransientDbError(err)) return;
  console.error(`[conversations.poller] ${label} failed`, err);
}

export function startPoller(): void {
  void runTracked("conversations:poller", () =>
    tick().catch((err) => logTickError("initial tick", err)),
  );
  setInterval(() => {
    void runTracked("conversations:poller", () =>
      tick().catch((err) => logTickError("tick", err)),
    );
  }, TICK_MS);
}
