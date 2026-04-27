import {
  listConversations,
  updateConversation,
  updateTaskTitle,
  adoptOrphanConversation,
  recentConversationsResource,
} from "@plugins/tasks-core/server";
import { Runtime, type RuntimeInfo } from "./runtime";
import { findTranscriptPath } from "./claude-transcript";
import type { ConversationStatus } from "../../shared";

function liveStatusFor(info: RuntimeInfo): ConversationStatus {
  return info.working ? "working" : "waiting";
}

const TICK_MS = 1000;

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
  let changed = false;
  const [{ next, failedRuntimes }, rows] = await Promise.all([
    collectLive(),
    listConversations(),
  ]);
  const dbById = new Map(rows.map((r) => [r.id, r]));

  // Adopt orphans: live sessions with no DB row.
  const orphans = [...next.keys()].filter((id) => !dbById.has(id));
  if (orphans.length > 0) {
    for (const id of orphans) {
      const live = next.get(id)!;
      if (live.dead) continue;
      if (!live.worktreePath) continue;
      const adopted = await adoptOrphanConversation({
        id,
        worktreePath: live.worktreePath,
        runtimeId: live.runtime,
        status: liveStatusFor(live),
        title: live.title || null,
      });
      if (adopted) {
        dbById.set(adopted.id, adopted);
        changed = true;
      }
    }
  }

  for (const [id, info] of next) {
    const prev = snapshot.get(id);
    if (!prev || prev.working !== info.working) changed = true;
  }
  for (const id of snapshot.keys()) {
    if (!next.has(id)) changed = true;
  }
  snapshot = next;

  for (const [id, info] of next) {
    const dbRow = dbById.get(id);
    if (!dbRow) continue;

    if (info.dead) {
      if (dbRow.status === "gone") continue;
      await updateConversation(id, { status: "gone", endedAt: new Date() });
      changed = true;
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
    if (!titleChanged && !sessionChanged && !statusChanged) continue;

    const resurrecting = dbRow.status === "gone" && desiredStatus !== "gone";
    const patch: Parameters<typeof updateConversation>[1] = {};
    if (titleChanged) patch.title = desiredTitle;
    if (sessionChanged) patch.claudeSessionId = sessionCandidate;
    if (statusChanged) patch.status = desiredStatus;
    if (resurrecting) patch.endedAt = null;
    await updateConversation(id, patch);

    if (titleChanged && desiredTitle && !UNINFORMATIVE_TITLES.includes(desiredTitle)) {
      await updateTaskTitle(dbRow.taskId, desiredTitle, UNINFORMATIVE_TITLES);
    }
    changed = true;
  }

  for (const [id, dbRow] of dbById) {
    if (next.has(id)) continue;
    if (dbRow.status === "starting") continue;
    if (dbRow.status === "gone") continue;
    // Runtime list failed (e.g. tmux unreachable under FD pressure). We
    // can't tell whether the session is alive, so leave status alone and
    // wait for a tick where the runtime answers — better than declaring
    // every working/waiting conversation gone on a transient hiccup.
    if (failedRuntimes.has(dbRow.runtime)) continue;
    await updateConversation(id, { status: "gone", endedAt: new Date() });
    changed = true;
  }

  if (changed) recentConversationsResource.notify();
}

export function startPoller(): void {
  tick().catch((err) => console.error("[conversations.poller] initial tick failed", err));
  setInterval(() => {
    tick().catch((err) => console.error("[conversations.poller] tick failed", err));
  }, TICK_MS);
}
