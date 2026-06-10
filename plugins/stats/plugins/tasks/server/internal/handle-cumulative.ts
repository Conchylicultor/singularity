import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listTasks, CONVERSATIONS_META_TASK_ID } from "@plugins/tasks-core/server";
import { getTasksCumulative } from "../../shared/endpoints";

export const handleCumulative = implement(getTasksCumulative, async () => {
  const allTasks = await listTasks({ excludeId: CONVERSATIONS_META_TASK_ID });

  const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));
  const events: { t: number; dTotal: number; dActive: number; dCompleted: number; dDropped: number }[] = [];

  for (const r of allTasks) {
    const created = toDate(r.createdAt).getTime();
    events.push({ t: created, dTotal: 1, dActive: 1, dCompleted: 0, dDropped: 0 });

    // The view's `finishedAt` is derived as `droppedAt` when dropped, or
    // `minCompletedPushAt` when done — so we can't use it to distinguish the two.
    // Use `r.status` to determine the outcome, then pick the right timestamp.
    //
    // "held" tasks are grouped with "dropped" since they are no longer active
    // and haven't completed, keeping the invariant: active + completed + dropped = total.
    if (r.status === "done" && r.finishedAt) {
      events.push({ t: toDate(r.finishedAt).getTime(), dTotal: 0, dActive: -1, dCompleted: 1, dDropped: 0 });
    } else if (r.status === "dropped" && r.droppedAt) {
      events.push({ t: toDate(r.droppedAt).getTime(), dTotal: 0, dActive: -1, dCompleted: 0, dDropped: 1 });
    } else if (r.status === "held" && r.heldAt) {
      events.push({ t: toDate(r.heldAt).getTime(), dTotal: 0, dActive: -1, dCompleted: 0, dDropped: 1 });
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
  let dropped = 0;
  const byKey = new Map<string, { date: string; total: number; active: number; completed: number; dropped: number }>();
  for (const e of events) {
    total += e.dTotal;
    active += e.dActive;
    completed += e.dCompleted;
    dropped += e.dDropped;
    const key = fmt(e.t);
    byKey.set(key, { date: key, total, active, completed, dropped });
  }
  const points = [...byKey.values()];
  return { points };
});
