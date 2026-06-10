import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getConfig } from "@plugins/config_v2/server";
import { commitsConfig } from "../../shared/config";
import { getCommitsRate, getCommitsLinesRate } from "../../shared/endpoints";
import { deduplicateByPushId, getCommits, getCommitsExcludingPaths } from "./commit-timestamps";
import { buildCategoryMap, categoryFor, getConfigCategoryOrder } from "./category-map";

async function resolveCommits(dedup: boolean): Promise<Awaited<ReturnType<typeof getCommits>>> {
  const { excludedPaths } = getConfig(commitsConfig);
  const active = excludedPaths.filter(p => p.enabled).map(p => p.path);
  let commits = active.length === 0 ? await getCommits() : await getCommitsExcludingPaths(active);
  if (dedup) commits = deduplicateByPushId(commits);
  return commits;
}

type Bucket = "hour" | "day" | "week" | "month" | "year";

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

export const handleRate = implement(getCommitsRate, async ({ query }) => {
  const bucket = query.bucket ?? "day";
  let commits = await getCommits();
  if (query.dedup === "true") commits = deduplicateByPushId(commits);

  if (query.breakdown === "category") {
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
    return { bucket, points, categories: getConfigCategoryOrder() };
  }

  const counts = new Map<string, number>();
  for (const c of commits) {
    const k = keyFor(c.iso, bucket);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const points = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => ({ bucket: k, count: v }));
  return { bucket, points };
});

export const handleLinesRate = implement(getCommitsLinesRate, async ({ query }) => {
  const bucket = query.bucket ?? "day";
  const commits = await resolveCommits(query.dedup === "true");

  if (query.breakdown === "ext") {
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
    return { bucket, points };
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
  return { bucket, points };
});
