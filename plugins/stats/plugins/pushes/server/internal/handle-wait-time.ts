import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPushesWaitTime } from "../../shared/endpoints";
import { readCompletedPushes } from "./read-pushes";
import { keyFor } from "./buckets";

export const handleWaitTime = implement(getPushesWaitTime, async ({ query }) => {
  const bucket = query.bucket ?? "day";
  const records = readCompletedPushes();

  const buckets = new Map<
    string,
    { waits: number[]; total: number; contested: number }
  >();

  for (const r of records) {
    // See handle-throughput.ts on `requestedAt` vs the legacy `startedAt`.
    const k = keyFor(r.requestedAt, bucket);
    let entry = buckets.get(k);
    if (!entry) {
      entry = { waits: [], total: 0, contested: 0 };
      buckets.set(k, entry);
    }
    entry.total++;
    // The derived `waitMs` (= sum of every wait) is the drop-in for the legacy
    // scalar. For pushes recorded by the new writer it is genuinely wider than
    // the old number: it now also counts the nested host-grant wait inside the
    // checks step, which the legacy log never recorded. That is the intended
    // correction — the chart measures "time this push spent blocked", and that
    // wait was always real, merely invisible.
    if (r.waitMs > 0) {
      entry.contested++;
      entry.waits.push(r.waitMs);
    }
  }

  const points = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, entry]) => {
      const sorted = entry.waits.slice().sort((a, b) => a - b);
      const avg =
        sorted.length > 0
          ? sorted.reduce((s, v) => s + v, 0) / sorted.length / 1000
          : 0;
      const max = sorted.length > 0 ? sorted[sorted.length - 1]! / 1000 : 0;
      return {
        bucket: date,
        avg: Math.round(avg * 100) / 100,
        max: Math.round(max * 100) / 100,
        contested: entry.contested,
        total: entry.total,
      };
    });

  return { points };
});
