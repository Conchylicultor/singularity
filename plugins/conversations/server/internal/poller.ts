import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { conversations } from "../schema";
import { listTmuxSessions, type TmuxInfo } from "./tmux";
import { broadcast } from "./sse";

const TICK_MS = 1000;

let snapshot = new Map<string, TmuxInfo>();

export function getSnapshot(): ReadonlyMap<string, TmuxInfo> {
  return snapshot;
}

async function tick(): Promise<void> {
  const [next, rows] = await Promise.all([
    listTmuxSessions(),
    db.select({ id: conversations.id, title: conversations.title }).from(conversations),
  ]);
  const currentTitles = new Map(rows.map((r) => [r.id, r.title]));

  for (const [id, info] of next) {
    const prev = snapshot.get(id);
    if (!prev || prev.task !== info.task || prev.idle !== info.idle) {
      broadcast({ type: "tmux", id, task: info.task, idle: info.idle });
    }
  }
  for (const id of snapshot.keys()) {
    if (!next.has(id)) broadcast({ type: "tmux", id, gone: true });
  }
  snapshot = next;

  for (const [id, info] of next) {
    if (!currentTitles.has(id)) continue;
    const desired = info.idle ? null : info.task;
    if (desired === currentTitles.get(id)) continue;
    await db
      .update(conversations)
      .set({ title: desired, updatedAt: new Date() })
      .where(eq(conversations.id, id));
    broadcast({ type: "title", id, title: desired });
  }
}

export function startPoller(): void {
  tick().catch((err) => console.error("[conversations.poller] initial tick failed", err));
  setInterval(() => {
    tick().catch((err) => console.error("[conversations.poller] tick failed", err));
  }, TICK_MS);
}
