import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getConfig } from "@plugins/config_v2/server";
import { commitsConfig } from "../../shared/config";
import { getCommitsCumulative, getCommitsLinesCumulative } from "../../shared/endpoints";
import { deduplicateByPushId, getCommits, getCommitsExcludingPaths } from "./commit-timestamps";
import { buildCategoryMap, categoryFor, getConfigCategoryOrder } from "./category-map";

async function resolveCommits(dedup: boolean): Promise<Awaited<ReturnType<typeof getCommits>>> {
  const { excludedPaths } = getConfig(commitsConfig);
  const active = excludedPaths.filter(p => p.enabled).map(p => p.path);
  let commits = active.length === 0 ? await getCommits() : await getCommitsExcludingPaths(active);
  if (dedup) commits = deduplicateByPushId(commits);
  return commits;
}

export const handleCumulative = implement(getCommitsCumulative, async ({ query }) => {
  let commits = await getCommits();
  if (query.dedup === "true") commits = deduplicateByPushId(commits);

  if (query.breakdown === "category") {
    const catMap = await buildCategoryMap();
    const perDay = new Map<string, Record<string, number>>();
    for (const c of commits) {
      const day = c.iso.slice(0, 10);
      const cat = categoryFor(catMap, c.conversationId);
      const existing = perDay.get(day) ?? {};
      existing[cat] = (existing[cat] ?? 0) + 1;
      perDay.set(day, existing);
    }
    const days = [...perDay.keys()].sort();
    const running: Record<string, number> = {};
    const points = days.map((date) => {
      for (const [cat, count] of Object.entries(perDay.get(date)!)) {
        running[cat] = (running[cat] ?? 0) + count;
      }
      return { date, byCategory: { ...running } };
    });
    return { points, categories: getConfigCategoryOrder() };
  }

  const perDay = new Map<string, number>();
  for (const c of commits) {
    const day = c.iso.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const days = [...perDay.keys()].sort();
  let running = 0;
  const points = days.map((date) => {
    running += perDay.get(date)!;
    return { date, count: running };
  });
  return { points };
});

export const handleLinesCumulative = implement(getCommitsLinesCumulative, async ({ query }) => {
  const commits = await resolveCommits(query.dedup === "true");

  if (query.breakdown === "ext") {
    const perDay = new Map<string, Record<string, { added: number; removed: number }>>();
    for (const c of commits) {
      const day = c.iso.slice(0, 10);
      const existing = perDay.get(day) ?? {};
      for (const [ext, stats] of Object.entries(c.byExt)) {
        const e = existing[ext] ?? { added: 0, removed: 0 };
        e.added += stats.added;
        e.removed += stats.removed;
        existing[ext] = e;
      }
      perDay.set(day, existing);
    }
    const days = [...perDay.keys()].sort();
    const running: Record<string, { added: number; removed: number }> = {};
    const points = days.map((date) => {
      for (const [ext, stats] of Object.entries(perDay.get(date)!)) {
        const r = running[ext] ?? { added: 0, removed: 0 };
        r.added += stats.added;
        r.removed += stats.removed;
        running[ext] = r;
      }
      return { date, byExt: Object.fromEntries(Object.entries(running).map(([k, v]) => [k, { ...v }])) };
    });
    return { points };
  }

  const perDay = new Map<string, { added: number; removed: number }>();
  for (const c of commits) {
    const day = c.iso.slice(0, 10);
    const e = perDay.get(day) ?? { added: 0, removed: 0 };
    e.added += c.added;
    e.removed += c.removed;
    perDay.set(day, e);
  }
  const days = [...perDay.keys()].sort();
  let added = 0;
  let removed = 0;
  const points = days.map((date) => {
    const e = perDay.get(date)!;
    added += e.added;
    removed += e.removed;
    return { date, added, removed };
  });
  return { points };
});
