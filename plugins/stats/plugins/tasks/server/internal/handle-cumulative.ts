import { listTasks, CONVERSATIONS_META_TASK_ID } from "@plugins/tasks-core/server";

export async function handleCumulative(_req: Request): Promise<Response> {
  const allTasks = await listTasks({ excludeId: CONVERSATIONS_META_TASK_ID });

  const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));
  const events: { t: number; dTotal: number; dActive: number; dCompleted: number }[] = [];
  for (const r of allTasks) {
    const created = toDate(r.createdAt).getTime();
    events.push({ t: created, dTotal: 1, dActive: 1, dCompleted: 0 });
    const closures: number[] = [];
    if (r.finishedAt) closures.push(toDate(r.finishedAt).getTime());
    if (r.heldAt) closures.push(toDate(r.heldAt).getTime());
    if (closures.length > 0) {
      const closedAt = Math.min(...closures);
      const isFinished = r.finishedAt && toDate(r.finishedAt).getTime() === closedAt;
      events.push({ t: closedAt, dTotal: 0, dActive: -1, dCompleted: isFinished ? 1 : 0 });
    }
    if (r.finishedAt && r.heldAt) {
      const finishedAt = toDate(r.finishedAt).getTime();
      const heldAt = toDate(r.heldAt).getTime();
      if (heldAt < finishedAt) {
        events.push({ t: finishedAt, dTotal: 0, dActive: 0, dCompleted: 1 });
      }
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
  let completed = 0;
  const byKey = new Map<string, { date: string; total: number; active: number; completed: number }>();
  for (const e of events) {
    total += e.dTotal;
    active += e.dActive;
    completed += e.dCompleted;
    const key = fmt(e.t);
    byKey.set(key, { date: key, total, active, completed });
  }
  const points = [...byKey.values()];
  return Response.json({ points });
}
