import { getCommitTimestamps } from "./commit-timestamps";

export async function handleCumulative(_req: Request): Promise<Response> {
  const timestamps = await getCommitTimestamps();
  const perDay = new Map<string, number>();
  for (const iso of timestamps) {
    const day = iso.slice(0, 10);
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
