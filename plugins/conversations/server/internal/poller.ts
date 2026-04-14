import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { Runtime, type RuntimeInfo } from "../api";
import { conversations } from "../schema";
import { worktreePathFor } from "./worktree";
import { broadcast } from "./sse";

const TICK_MS = 1000;

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
  const [next, rows] = await Promise.all([
    collectLive(),
    db
      .select({
        id: conversations.id,
        title: conversations.title,
        claudeSessionId: conversations.claudeSessionId,
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
      const [inserted] = await db
        .insert(conversations)
        .values({
          id,
          worktreePath: await worktreePathFor(id),
          runtime: live.runtime,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        dbById.set(inserted.id, {
          id: inserted.id,
          title: inserted.title,
          claudeSessionId: inserted.claudeSessionId,
        });
        broadcast({
          type: "created",
          conversation: JSON.parse(JSON.stringify(inserted)),
        });
      }
    }
  }

  for (const [id, info] of next) {
    const prev = snapshot.get(id);
    if (!prev || prev.idle !== info.idle) {
      broadcast({ type: "idle", id, idle: info.idle });
    }
  }
  for (const id of snapshot.keys()) {
    if (!next.has(id)) broadcast({ type: "gone", id });
  }
  snapshot = next;

  for (const [id, info] of next) {
    const dbRow = dbById.get(id);
    if (!dbRow) continue;
    const desiredTitle = info.idle ? null : info.title;
    const titleChanged = desiredTitle !== dbRow.title;
    const sessionChanged = info.claudeSessionId !== dbRow.claudeSessionId;
    if (!titleChanged && !sessionChanged) continue;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (titleChanged) patch.title = desiredTitle;
    if (sessionChanged) patch.claudeSessionId = info.claudeSessionId;
    await db.update(conversations).set(patch).where(eq(conversations.id, id));
    if (titleChanged) broadcast({ type: "title", id, title: desiredTitle });
    if (sessionChanged) {
      broadcast({
        type: "claude-session",
        id,
        claudeSessionId: info.claudeSessionId,
      });
    }
  }
}

export function startPoller(): void {
  tick().catch((err) => console.error("[conversations.poller] initial tick failed", err));
  setInterval(() => {
    tick().catch((err) => console.error("[conversations.poller] tick failed", err));
  }, TICK_MS);
}
