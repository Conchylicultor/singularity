import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listTasks, CONVERSATIONS_META_TASK_ID } from "@plugins/tasks/plugins/tasks-core/server";
import { getTasksDaily } from "../../shared/endpoints";

export const handleDaily = implement(getTasksDaily, async () => {
  const allTasks = await listTasks({ excludeId: CONVERSATIONS_META_TASK_ID });

  const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));
  const fmtDay = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };

  const byDay = new Map<string, { date: string; added: number; completed: number; dropped: number }>();
  const getOrCreate = (day: string) => {
    if (!byDay.has(day)) byDay.set(day, { date: day, added: 0, completed: 0, dropped: 0 });
    return byDay.get(day)!;
  };

  for (const r of allTasks) {
    const createdDay = fmtDay(toDate(r.createdAt).getTime());
    getOrCreate(createdDay).added++;

    // Mirror exactly what handle-cumulative does: done reduces active via finishedAt,
    // dropped reduces active via droppedAt, held reduces active via heldAt.
    // Net must equal Δactive = added - completed - dropped so both charts stay consistent.
    if (r.status === "done" && r.finishedAt) {
      const day = fmtDay(toDate(r.finishedAt).getTime());
      getOrCreate(day).completed++;
    } else if (r.status === "dropped" && r.droppedAt) {
      const day = fmtDay(toDate(r.droppedAt).getTime());
      getOrCreate(day).dropped++;
    } else if (r.status === "held" && r.heldAt) {
      const day = fmtDay(toDate(r.heldAt).getTime());
      getOrCreate(day).dropped++;
    }
  }

  const points = [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    // net > 0 = more resolved than added that day = active count shrank
    .map((p) => ({ ...p, net: p.completed + p.dropped - p.added }));

  return { points };
});
