import { readContentionRecords } from "./read-contention";
import { keyFor, parseBucket } from "./buckets";

const STEP_GROUPS: Record<string, string> = {
  fetch: "fetch",
  "ff-main": "fetch",
  rebase: "rebase",
  checks: "checks",
  "push-branch": "push",
  "ff-merge": "push",
  "push-main": "push",
  "bun-install": "other",
  normalize: "other",
};

const GROUP_KEYS = ["fetch", "rebase", "checks", "push", "other"] as const;

export async function handleStepBreakdown(req: Request): Promise<Response> {
  const bucket = parseBucket(req);
  const records = readContentionRecords();

  const buckets = new Map<
    string,
    { sums: Record<string, number>; count: number }
  >();

  for (const r of records) {
    const k = keyFor(r.startedAt, bucket);
    let entry = buckets.get(k);
    if (!entry) {
      entry = { sums: { fetch: 0, rebase: 0, checks: 0, push: 0, other: 0 }, count: 0 };
      buckets.set(k, entry);
    }
    entry.count++;
    for (const step of r.steps) {
      const group = STEP_GROUPS[step.name] ?? "other";
      entry.sums[group] = (entry.sums[group] ?? 0) + step.durationMs;
    }
  }

  const points = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, entry]) => {
      const point: Record<string, string | number> = { bucket: date };
      for (const group of GROUP_KEYS) {
        point[group] =
          Math.round(((entry.sums[group] ?? 0) / entry.count / 1000) * 100) / 100;
      }
      return point;
    });

  return Response.json({ points });
}
