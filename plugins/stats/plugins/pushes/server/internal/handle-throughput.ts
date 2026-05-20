import { readContentionRecords } from "./read-contention";
import { keyFor, parseBucket } from "./buckets";

export async function handleThroughput(req: Request): Promise<Response> {
  const bucket = parseBucket(req);
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

  return Response.json({ points });
}
