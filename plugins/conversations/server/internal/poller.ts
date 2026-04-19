import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import {
  _attempts,
  _tasks,
  attempts,
  CONVERSATIONS_META_TASK_ID,
  nextRankUnder,
} from "@plugins/tasks/server/api";
import { Runtime, type RuntimeInfo } from "../api";
import { _conversations } from "./tables";
import type { ConversationStatus } from "../../shared/types";
import { conversationsResource } from "./resources";
import { worktreePathFor } from "./worktree";

function liveStatusFor(info: RuntimeInfo): ConversationStatus {
  return info.working ? "working" : "waiting";
}

const TICK_MS = 1000;

interface LiveEntry extends RuntimeInfo {
  runtime: string;
}

let snapshot = new Map<string, LiveEntry>();

async function collectLive(): Promise<Map<string, LiveEntry>> {
  const merged = new Map<string, LiveEntry>();
  for (const runtime of Runtime.all()) {
    let entries: Map<string, RuntimeInfo>;
    try {
      entries = await runtime.list();
    } catch (err) {
      console.error(`[conversations.poller] runtime "${runtime.id}" list failed`, err);
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
  return merged;
}

async function tick(): Promise<void> {
  let changed = false;
  const [next, rows] = await Promise.all([
    collectLive(),
    db
      .select({
        id: _conversations.id,
        attemptId: _conversations.attemptId,
        title: _conversations.title,
        claudeSessionId: _conversations.claudeSessionId,
        status: _conversations.status,
      })
      .from(_conversations),
  ]);
  const dbById = new Map(rows.map((r) => [r.id, r]));

  // Adopt orphans: live sessions with no DB row (e.g. sessions surviving a DB
  // reset, or created out-of-band). Each adopted conversation needs a matching
  // attempt row. If the attempt doesn't exist yet, skip the adoption — we can
  // revisit once the attempt lifecycle catches up.
  const orphans = [...next.keys()].filter((id) => !dbById.has(id));
  if (orphans.length > 0) {
    for (const id of orphans) {
      const live = next.get(id)!;
      if (live.dead) continue;
      // For the current 1:1 case, the conversation id equals the attempt id.
      // Read through the public `attempts` view to avoid reaching into the
      // tasks plugin's internal table.
      let [attempt] = await db
        .select({ id: attempts.id })
        .from(attempts)
        .where(eq(attempts.id, id))
        .limit(1);
      if (!attempt) {
        // No attempt row yet — the tmux session was created outside this
        // DB's history (e.g. the main worktree spawned it after we forked,
        // or it was started via `tmux new-session` directly). Synthesize a
        // task + attempt so the conversation can surface in the list. The
        // worktree path is derivable by convention: `<main>/.claude/
        // worktrees/<id>`.
        const worktreePath = await worktreePathFor(id);
        const taskTitle = live.title?.trim() || id;
        try {
          await db.transaction(async (tx) => {
            const rank = await nextRankUnder(CONVERSATIONS_META_TASK_ID, tx);
            await tx
              .insert(_tasks)
              .values({
                id,
                parentId: CONVERSATIONS_META_TASK_ID,
                title: taskTitle,
                rank,
              })
              .onConflictDoNothing();
            await tx
              .insert(_attempts)
              .values({ id, taskId: id, worktreePath })
              .onConflictDoNothing();
          });
        } catch (err) {
          console.error(
            `[conversations.poller] synthesising task/attempt for "${id}" failed`,
            err,
          );
          continue;
        }
        [attempt] = await db
          .select({ id: attempts.id })
          .from(attempts)
          .where(eq(attempts.id, id))
          .limit(1);
        if (!attempt) continue;
      }
      const [inserted] = await db
        .insert(_conversations)
        .values({
          id,
          attemptId: attempt.id,
          runtime: live.runtime,
          status: liveStatusFor(live),
          title: live.title || null,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        dbById.set(inserted.id, {
          id: inserted.id,
          attemptId: inserted.attemptId,
          title: inserted.title,
          claudeSessionId: inserted.claudeSessionId,
          status: inserted.status,
        });
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
      await db
        .update(_conversations)
        .set({
          status: "gone",
          endedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(_conversations.id, id));
      changed = true;
      continue;
    }

    const desiredTitle = info.title ? info.title : dbRow.title;
    const desiredStatus = liveStatusFor(info);
    const titleChanged = desiredTitle !== dbRow.title;
    const sessionChanged = info.claudeSessionId !== dbRow.claudeSessionId;
    const statusChanged = desiredStatus !== dbRow.status;
    if (!titleChanged && !sessionChanged && !statusChanged) continue;

    // A live session with `status = 'gone'` means a prior tick spuriously
    // declared it dead (e.g. transient `tmux list-panes` failure). Resurrect
    // it by clearing `endedAt` alongside the status flip.
    const resurrecting = dbRow.status === "gone" && desiredStatus !== "gone";
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (titleChanged) patch.title = desiredTitle;
    if (sessionChanged) patch.claudeSessionId = info.claudeSessionId;
    if (statusChanged) patch.status = desiredStatus;
    if (resurrecting) patch.endedAt = null;
    await db.update(_conversations).set(patch).where(eq(_conversations.id, id));
    changed = true;
  }

  // Any DB row whose runtime entry has vanished (tmux pane killed) goes to
  // `gone` and gets an `ended_at`. The attempt view derives `abandoned` or
  // `completed` from whether a push row exists.
  for (const [id, dbRow] of dbById) {
    if (next.has(id)) continue;
    if (dbRow.status === "starting") continue;
    if (dbRow.status === "gone") continue;
    await db
      .update(_conversations)
      .set({
        status: "gone",
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(_conversations.id, id));
    changed = true;
  }

  if (changed) conversationsResource.notify();
}

export function startPoller(): void {
  tick().catch((err) => console.error("[conversations.poller] initial tick failed", err));
  setInterval(() => {
    tick().catch((err) => console.error("[conversations.poller] tick failed", err));
  }, TICK_MS);
}
