/** Shared bucket helpers — mirrors the pattern from stats-commits. */

export type Bucket = "day" | "week" | "month";
const BUCKETS: Bucket[] = ["day", "week", "month"];

export function parseBucket(req: Request): Bucket {
  const raw = new URL(req.url).searchParams.get("bucket") ?? "day";
  return (BUCKETS.includes(raw as Bucket) ? raw : "day") as Bucket;
}

export function keyFor(iso: string, bucket: Bucket): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  switch (bucket) {
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
  }
}
