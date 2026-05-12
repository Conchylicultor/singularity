import { readConfig } from "@plugins/config/server";
import { commitsConfig } from "../../shared/config";
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

export async function handleCumulative(req: Request): Promise<Response> {
  const t0 = performance.now();
  const breakdown = new URL(req.url).searchParams.get("breakdown") === "category";
  let commits = await getCommits();
  if (shouldDedup(req)) commits = deduplicateByPushId(commits);

  if (breakdown) {
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
    const configOrder = await getConfigCategoryOrder();
    const resp = Response.json({ points, categories: configOrder });
    resp.headers.set("Server-Timing", commitsTimingHeader(Math.round(performance.now() - t0)));
    return resp;
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
  const resp = Response.json({ points });
  resp.headers.set("Server-Timing", commitsTimingHeader(Math.round(performance.now() - t0)));
  return resp;
}

export async function handleLinesCumulative(req: Request): Promise<Response> {
  const t0 = performance.now();
  const breakdown = new URL(req.url).searchParams.get("breakdown") === "ext";
  const commits = await resolveCommits(req);

  if (breakdown) {
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
    const resp = Response.json({ points });
    resp.headers.set("Server-Timing", commitsTimingHeader(Math.round(performance.now() - t0)));
    return resp;
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
  const resp = Response.json({ points });
  resp.headers.set("Server-Timing", commitsTimingHeader(Math.round(performance.now() - t0)));
  return resp;
}
