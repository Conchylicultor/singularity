import { eq, sql } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { Runtime, type RuntimeInfo } from "../api";
import { conversations, pushes } from "../schema";
import type { ConversationStatus } from "../../shared/types";
import { worktreePathFor } from "./worktree";
import { conversationsResource } from "./resources";

function liveStatusFor(info: RuntimeInfo): ConversationStatus {
  return info.working ? "working" : "needs_attention";
}

async function terminalStatusFor(id: string): Promise<"completed" | "gone"> {
  const [row] = await db
    .select({ exists: sql<number>`1` })
    .from(pushes)
    .where(eq(pushes.conversationId, id))
    .limit(1);
  return row ? "completed" : "gone";
}

const TICK_MS = 1000;

const TERMINAL_DB_STATUSES = new Set<ConversationStatus>([
  "completed",
  "gone",
  "abandoned",
]);

interface LiveEntry extends RuntimeInfo {
  runtime: string;
}

let snapshot = new Map<string, LiveEntry>();

export function getSnapshot(): ReadonlyMap<string, LiveEntry> {
  return snapshot;
}

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
        id: conversations.id,
        title: conversations.title,
        claudeSessionId: conversations.claudeSessionId,
        status: conversations.status,
      })
      .from(conversations),
  ]);
  const dbById = new Map(rows.map((r) => [r.id, r]));

  // Adopt orphans: live sessions with no DB row (e.g. sessions surviving a DB
  // reset, or created out-of-band). Insert idempotently and broadcast.
  const orphans = [...next.keys()].filter((id) => !dbById.has(id));
  if (orphans.length > 0) {
    for (const id of orphans) {
      const live = next.get(id)!;
      if (live.dead) continue;
      const [inserted] = await db
        .insert(conversations)
        .values({
          id,
          worktreePath: await worktreePathFor(id),
          runtime: live.runtime,
          status: liveStatusFor(live),
          title: live.title || null,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        dbById.set(inserted.id, {
          id: inserted.id,
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
    if (TERMINAL_DB_STATUSES.has(dbRow.status)) continue;

    // Dead: runtime reports the process exited. Decide terminal status based on
    // whether this conversation was ever pushed.
    if (info.dead) {
      const desiredStatus = await terminalStatusFor(id);
      await db
        .update(conversations)
        .set({
          status: desiredStatus,
          endedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, id));
      changed = true;
      continue;
    }

    // Only overwrite title when the runtime reports a real one; preserve the
    // last known title when the pane is in a default/waiting state.
    const desiredTitle = info.title ? info.title : dbRow.title;
    const desiredStatus = liveStatusFor(info);
    const titleChanged = desiredTitle !== dbRow.title;
    const sessionChanged = info.claudeSessionId !== dbRow.claudeSessionId;
    const statusChanged = desiredStatus !== dbRow.status;
    if (!titleChanged && !sessionChanged && !statusChanged) continue;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (titleChanged) patch.title = desiredTitle;
    if (sessionChanged) patch.claudeSessionId = info.claudeSessionId;
    if (statusChanged) patch.status = desiredStatus;
    await db.update(conversations).set(patch).where(eq(conversations.id, id));
    changed = true;
  }

  // Mark DB rows whose runtime entry has vanished (tmux pane killed) as
  // terminal. Pushed conversations land on "completed"; otherwise "gone".
  // Skip rows still in a pre-live state or already terminal.
  for (const [id, dbRow] of dbById) {
    if (next.has(id)) continue;
    if (dbRow.status === "starting") continue;
    if (TERMINAL_DB_STATUSES.has(dbRow.status)) continue;
    const desiredStatus = await terminalStatusFor(id);
    await db
      .update(conversations)
      .set({
        status: desiredStatus,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, id));
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
