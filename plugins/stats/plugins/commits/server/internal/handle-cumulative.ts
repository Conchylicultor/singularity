import { readConfig } from "@plugins/config/server/api";
import { commitsConfig } from "../../shared/config";
import { getCommits, getCommitsExcludingPaths } from "./commit-timestamps";

async function resolveCommits(req: Request) {
  const excludePaths = new URL(req.url).searchParams.get("excludePaths") === "true";
  if (excludePaths) {
    const { excludedPaths } = await readConfig(commitsConfig);
    return getCommitsExcludingPaths(excludedPaths);
  }
  return getCommits();
}

export async function handleCumulative(_req: Request): Promise<Response> {
  const commits = await getCommits();
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
  const { excludedShas } = await readConfig(commitsConfig);
  const excluded = new Set(excludedShas);
  const commits = await resolveCommits(req);
  const perDay = new Map<string, { added: number; removed: number }>();
  for (const c of commits) {
    if (excluded.has(c.sha)) continue;
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
