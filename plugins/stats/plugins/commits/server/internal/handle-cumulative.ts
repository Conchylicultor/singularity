import { readConfig } from "@plugins/config/server";
import { commitsConfig } from "../../internal/config";
import { deduplicateByPushId, getCommits, getCommitsExcludingPaths } from "./commit-timestamps";
import { activeExcludedPaths } from "./excluded-paths";

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
  let commits = await getCommits();
  if (shouldDedup(req)) commits = deduplicateByPushId(commits);
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
  return Response.json({ points });
}

export async function handleLinesCumulative(req: Request): Promise<Response> {
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
    return Response.json({ points });
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
  return Response.json({ points });
}
