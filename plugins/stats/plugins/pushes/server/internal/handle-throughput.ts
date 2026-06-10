import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPushesThroughput } from "../../shared/endpoints";
import { readContentionRecords } from "./read-contention";
import { keyFor } from "./buckets";

export const handleThroughput = implement(getPushesThroughput, async ({ query }) => {
  const bucket = query.bucket ?? "day";
  const records = readContentionRecords();

  const buckets = new Map<string, { success: number; failed: number }>();

  for (const r of records) {
    const k = keyFor(r.startedAt, bucket);
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
