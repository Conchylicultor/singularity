import { and, ne } from "drizzle-orm";
import { db } from "../../../../../../server/src/db/client";
import { CONVERSATIONS_META_TASK_ID } from "@plugins/tasks/server/api";
import { tasks } from "@plugins/tasks/server/schema";

// Two monotonic series sampled at every event:
//   total  = cumulative tasks created
//   active = total minus closed (earliest of finishedAt / heldAt)
// Emitting one point per event keeps resolution fine without bucketing.
export async function handleCumulative(_req: Request): Promise<Response> {
  const rows = await db
    .select({
      createdAt: tasks.createdAt,
      finishedAt: tasks.finishedAt,
      heldAt: tasks.heldAt,
    })
    .from(tasks)
    .where(and(ne(tasks.id, CONVERSATIONS_META_TASK_ID)));

  const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));
  const events: { t: number; dTotal: number; dActive: number }[] = [];
  for (const r of rows) {
    const created = toDate(r.createdAt).getTime();
    events.push({ t: created, dTotal: 1, dActive: 1 });
    const closures: number[] = [];
    if (r.finishedAt) closures.push(toDate(r.finishedAt).getTime());
    if (r.heldAt) closures.push(toDate(r.heldAt).getTime());
    if (closures.length > 0) {
      events.push({ t: Math.min(...closures), dTotal: 0, dActive: -1 });
    }
  }
  events.sort((a, b) => a.t - b.t);

  const fmt = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
      d.getUTCDate(),
    )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };

  let total = 0;
  let active = 0;
  const byKey = new Map<string, { date: string; total: number; active: number }>();
  for (const e of events) {
    total += e.dTotal;
    active += e.dActive;
    const key = fmt(e.t);
    byKey.set(key, { date: key, total, active });
  }
  const points = [...byKey.values()];
  return Response.json({ points });
}
