import { readConfig } from "@plugins/config/server";
import { commitsConfig } from "@plugins/stats/plugins/commits/shared/config";
import { deduplicateByPushId, getCommits, getCommitsExcludingPaths, getGitLogTiming } from "./commit-timestamps";
import { activeExcludedPaths } from "./excluded-paths";
import { buildCategoryMap, categoryFor, getConfigCategoryOrder } from "./category-map";

function commitsTimingHeader(handlerMs: number): string {
  const git = getGitLogTiming();
  const parts = [`total;dur=${handlerMs}`];
  if (git) {
    parts.push(git.cached ? "gitLog;dur=0;desc=\"cached\"" : `gitLog;dur=${git.ms}`);
  }
  return parts.join(", ");
}

function shouldDedup(req: Request): boolean {
  return new URL(req.url).searchParams.get("dedup") === "1";
}

async function resolveCommits(req: Request): Promise<Awaited<ReturnType<typeof getCommits>>> {
  const { excludedPaths } = await readConfig(commitsConfig);
  const active = await activeExcludedPaths(excludedPaths);
  let commits = active.length === 0 ? await getCommits() : await getCommitsExcludingPaths(active);
  if (shouldDedup(req)) commits = deduplicateByPushId(commits);
  return commits;
}

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

function parseBucket(req: Request): Bucket {
  const raw = new URL(req.url).searchParams.get("bucket") ?? "day";
  return (BUCKETS.includes(raw as Bucket) ? raw : "day") as Bucket;
}

export async function handleRate(req: Request): Promise<Response> {
  const t0 = performance.now();
  const bucket = parseBucket(req);
  const breakdown = new URL(req.url).searchParams.get("breakdown") === "category";
  let commits = await getCommits();
  if (shouldDedup(req)) commits = deduplicateByPushId(commits);

  if (breakdown) {
    const catMap = await buildCategoryMap();
    const counts = new Map<string, Record<string, number>>();
    for (const c of commits) {
      const k = keyFor(c.iso, bucket);
      const cat = categoryFor(catMap, c.conversationId);
      const existing = counts.get(k) ?? {};
      existing[cat] = (existing[cat] ?? 0) + 1;
      counts.set(k, existing);
    }
    const points = [...counts.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => ({ bucket: k, byCategory: v }));
    const configOrder = await getConfigCategoryOrder();
    const resp = Response.json({ bucket, points, categories: configOrder });
    resp.headers.set("Server-Timing", commitsTimingHeader(Math.round(performance.now() - t0)));
    return resp;
  }

  const counts = new Map<string, number>();
  for (const c of commits) {
    const k = keyFor(c.iso, bucket);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const points = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => ({ bucket: k, count: v }));
  const resp = Response.json({ bucket, points });
  resp.headers.set("Server-Timing", commitsTimingHeader(Math.round(performance.now() - t0)));
  return resp;
}

export async function handleLinesRate(req: Request): Promise<Response> {
  const t0 = performance.now();
  const bucket = parseBucket(req);
  const breakdown = new URL(req.url).searchParams.get("breakdown") === "ext";
  const commits = await resolveCommits(req);

  if (breakdown) {
    const counts = new Map<string, Record<string, { added: number; removed: number }>>();
    for (const c of commits) {
      const k = keyFor(c.iso, bucket);
      const existing = counts.get(k) ?? {};
      for (const [ext, stats] of Object.entries(c.byExt)) {
        const e = existing[ext] ?? { added: 0, removed: 0 };
        e.added += stats.added;
        e.removed += stats.removed;
        existing[ext] = e;
      }
      counts.set(k, existing);
    }
    const points = [...counts.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => ({ bucket: k, byExt: v }));
    const resp = Response.json({ bucket, points });
    resp.headers.set("Server-Timing", commitsTimingHeader(Math.round(performance.now() - t0)));
    return resp;
  }

  const counts = new Map<string, { added: number; removed: number }>();
  for (const c of commits) {
    const k = keyFor(c.iso, bucket);
    const e = counts.get(k) ?? { added: 0, removed: 0 };
    e.added += c.added;
    e.removed += c.removed;
    counts.set(k, e);
  }
  const points = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => ({ bucket: k, added: v.added, removed: v.removed }));
  const resp = Response.json({ bucket, points });
  resp.headers.set("Server-Timing", commitsTimingHeader(Math.round(performance.now() - t0)));
  return resp;
}
