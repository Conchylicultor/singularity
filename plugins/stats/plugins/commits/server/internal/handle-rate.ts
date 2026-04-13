import { getCommitTimestamps } from "./commit-timestamps";

type Bucket = "hour" | "day" | "week" | "month" | "year";
const BUCKETS: Bucket[] = ["hour", "day", "week", "month", "year"];

function keyFor(iso: string, bucket: Bucket): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hour = String(d.getUTCHours()).padStart(2, "0");
  switch (bucket) {
    case "hour":
      return `${y}-${m}-${day} ${hour}:00`;
    case "day":
      return `${y}-${m}-${day}`;
    case "week": {
      const monday = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
      const dow = monday.getUTCDay() || 7;
      monday.setUTCDate(monday.getUTCDate() - (dow - 1));
      const wy = monday.getUTCFullYear();
      const wm = String(monday.getUTCMonth() + 1).padStart(2, "0");
      const wd = String(monday.getUTCDate()).padStart(2, "0");
      return `${wy}-${wm}-${wd}`;
    }
    case "month":
      return `${y}-${m}`;
    case "year":
      return `${y}`;
  }
}

export async function handleRate(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const raw = url.searchParams.get("bucket") ?? "day";
  const bucket = (BUCKETS.includes(raw as Bucket) ? raw : "day") as Bucket;

  const timestamps = await getCommitTimestamps();
  const counts = new Map<string, number>();
  for (const iso of timestamps) {
    const k = keyFor(iso, bucket);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const points = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => ({ bucket: k, count: v }));

  return Response.json({ bucket, points });
}
