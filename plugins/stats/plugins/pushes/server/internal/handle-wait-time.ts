import { readContentionRecords } from "./read-contention";
import { keyFor, parseBucket } from "./buckets";

export async function handleWaitTime(req: Request): Promise<Response> {
  const bucket = parseBucket(req);
  const records = readContentionRecords();

  const buckets = new Map<
    string,
    { waits: number[]; total: number; contested: number }
  >();

  for (const r of records) {
    const k = keyFor(r.startedAt, bucket);
    let entry = buckets.get(k);
    if (!entry) {
      entry = { waits: [], total: 0, contested: 0 };
      buckets.set(k, entry);
    }
    entry.total++;
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

  return Response.json({ points });
}
