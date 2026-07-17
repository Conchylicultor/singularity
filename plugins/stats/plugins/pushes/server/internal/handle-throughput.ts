import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPushesThroughput } from "../../shared/endpoints";
import { readCompletedPushes } from "./read-pushes";
import { keyFor } from "./buckets";

export const handleThroughput = implement(getPushesThroughput, async ({ query }) => {
  const bucket = query.bucket ?? "day";
  const records = readCompletedPushes();

  const buckets = new Map<string, { success: number; failed: number }>();

  for (const r of records) {
    // Buckets on `requestedAt` — the op-log's start instant — where this used to
    // bucket on the legacy `startedAt`. The two differ only by `preLockMs` (the
    // process-start → lock-request gap, sub-second in practice), which the new
    // model does not carry; day/week/month bucketing is unaffected.
    const k = keyFor(r.requestedAt, bucket);
    let entry = buckets.get(k);
    if (!entry) {
      entry = { success: 0, failed: 0 };
      buckets.set(k, entry);
    }
    if (r.outcome === "success") {
      entry.success++;
    } else {
      entry.failed++;
    }
  }

  const points = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, entry]) => ({
      bucket: date,
      success: entry.success,
      failed: entry.failed,
    }));

  return { points };
});
