import type { DailyUsage } from "ccusage/data-loader";
import { canonicalModel, loadBundle, parseScope, type PerSession, type Scope } from "./load-usage";

function modelFamily(canonical: string): string {
  return canonical.split("-")[0] ?? canonical;
}

function filterDaily(
  rows: DailyUsage[],
  scope: Scope,
  isSingularity: Map<string, boolean>,
): DailyUsage[] {
  if (scope === "all") return rows;
  return rows.filter((r) => {
    const proj = (r as { project?: string }).project;
    return proj ? (isSingularity.get(proj) ?? false) : false;
  });
}

function filterSessions(rows: PerSession[], scope: Scope): PerSession[] {
  return scope === "all" ? rows : rows.filter((s) => s.isSingularity);
}

interface DailyByModelPoint {
  date: string;
  byModel: Record<string, number>;
}

export async function handleDaily(req: Request): Promise<Response> {
  const scope = parseScope(req);
  const { daily, projectIsSingularity } = await loadBundle();
  const rows = filterDaily(daily, scope, projectIsSingularity);
  const perDay = new Map<string, Map<string, number>>();
  const allModels = new Set<string>();
  for (const r of rows) {
    let bucket = perDay.get(r.date);
    if (!bucket) {
      bucket = new Map();
      perDay.set(r.date, bucket);
    }
    for (const mb of r.modelBreakdowns) {
      const key = canonicalModel(mb.modelName);
      allModels.add(key);
      bucket.set(key, (bucket.get(key) ?? 0) + mb.cost);
    }
  }
  const days = [...perDay.keys()].sort();
  const models = [...allModels].sort();
  const points: DailyByModelPoint[] = days.map((date) => {
    const bucket = perDay.get(date)!;
    const byModel: Record<string, number> = {};
    for (const m of models) byModel[m] = roundCents(bucket.get(m) ?? 0);
    return { date, byModel };
  });
  return Response.json({ points, models });
}

interface CumulativePoint {
  date: string;
  cost: number;
}

export async function handleCumulative(req: Request): Promise<Response> {
  const scope = parseScope(req);
  const { daily, projectIsSingularity } = await loadBundle();
  const rows = filterDaily(daily, scope, projectIsSingularity);
  const perDay = new Map<string, number>();
  for (const r of rows) {
    perDay.set(r.date, (perDay.get(r.date) ?? 0) + r.totalCost);
  }
  const days = [...perDay.keys()].sort();
  let running = 0;
  const points: CumulativePoint[] = days.map((date) => {
    running += perDay.get(date)!;
    return { date, cost: roundCents(running) };
  });
  return Response.json({ points });
}

interface TokenMixPoint {
  date: string;
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export async function handleTokenMix(req: Request): Promise<Response> {
  const scope = parseScope(req);
  const { daily, projectIsSingularity } = await loadBundle();
  const rows = filterDaily(daily, scope, projectIsSingularity);
  const perDay = new Map<string, TokenMixPoint>();
  for (const r of rows) {
    const e = perDay.get(r.date) ?? {
      date: r.date,
      input: 0,
      output: 0,
      cacheCreation: 0,
      cacheRead: 0,
    };
    e.input += r.inputTokens;
    e.output += r.outputTokens;
    e.cacheCreation += r.cacheCreationTokens;
    e.cacheRead += r.cacheReadTokens;
    perDay.set(r.date, e);
  }
  const points = [...perDay.values()].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
  return Response.json({ points });
}

export async function handleTotals(req: Request): Promise<Response> {
  const scope = parseScope(req);
  const { daily, sessions, projectIsSingularity } = await loadBundle();
  const dailyRows = filterDaily(daily, scope, projectIsSingularity);
  const sessRows = filterSessions(sessions, scope);
  let totalCost = 0;
  let input = 0;
  let output = 0;
  let cacheCreation = 0;
  let cacheRead = 0;
  const days = new Set<string>();
  const last7Cutoff = isoDay(daysAgo(7));
  let last7Cost = 0;
  for (const r of dailyRows) {
    totalCost += r.totalCost;
    input += r.inputTokens;
    output += r.outputTokens;
    cacheCreation += r.cacheCreationTokens;
    cacheRead += r.cacheReadTokens;
    days.add(r.date);
    if (r.date >= last7Cutoff) last7Cost += r.totalCost;
  }
  const activeDays = days.size;
  const avgDailyCost = activeDays > 0 ? totalCost / activeDays : 0;
  return Response.json({
    totalCost: roundCents(totalCost),
    totalTokens: input + output + cacheCreation + cacheRead,
    byTokenKind: { input, output, cacheCreation, cacheRead },
    last7Cost: roundCents(last7Cost),
    avgDailyCost: roundCents(avgDailyCost),
    activeDays,
    sessionCount: sessRows.length,
  });
}

interface SessionRow {
  sessionId: string;
  conversationId: string | null;
  title: string | null;
  status: string | null;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  lastActivity: string;
  modelsUsed: string[];
}

export async function handleSessions(req: Request): Promise<Response> {
  const scope = parseScope(req);
  const { sessions, convBySession } = await loadBundle();
  const filtered = filterSessions(sessions, scope);
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 50;
  const sorted = [...filtered].sort((a, b) => b.cost - a.cost);
  const rows: SessionRow[] = sorted.slice(0, limit).map((s) => {
    const meta = convBySession.get(s.sessionId);
    return {
      sessionId: s.sessionId,
      conversationId: meta?.conversationId ?? null,
      title: meta?.title ?? null,
      status: meta?.status ?? null,
      totalCost: roundCents(s.cost),
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheCreationTokens: s.cacheCreationTokens,
      cacheReadTokens: s.cacheReadTokens,
      lastActivity: s.lastActivity,
      modelsUsed: s.modelsUsed.map(canonicalModel),
    };
  });
  return Response.json({ rows });
}

// Session count per day per model family (not cost).
export async function handleDailyByFamily(req: Request): Promise<Response> {
  const scope = parseScope(req);
  const { sessions } = await loadBundle();
  const filtered = filterSessions(sessions, scope);
  const perDay = new Map<string, Map<string, number>>();
  const allFamilies = new Set<string>();
  for (const s of filtered) {
    const date = s.lastActivity.slice(0, 10);
    if (!date) continue;
    let bucket = perDay.get(date);
    if (!bucket) {
      bucket = new Map();
      perDay.set(date, bucket);
    }
    const usedFamilies = new Set(s.modelsUsed.map((m) => modelFamily(canonicalModel(m))));
    for (const family of usedFamilies) {
      allFamilies.add(family);
      bucket.set(family, (bucket.get(family) ?? 0) + 1);
    }
  }
  const days = [...perDay.keys()].sort();
  const families = [...allFamilies].sort();
  const points = days.map((date) => {
    const bucket = perDay.get(date)!;
    const byFamily: Record<string, number> = {};
    for (const f of families) byFamily[f] = bucket.get(f) ?? 0;
    return { date, byFamily };
  });
  return Response.json({ points, families });
}

// Dynamic buckets scaled to the actual cost range.
export async function handleDistribution(req: Request): Promise<Response> {
  const scope = parseScope(req);
  const { sessions } = await loadBundle();
  const filtered = filterSessions(sessions, scope);
  if (filtered.length === 0) return Response.json({ buckets: [] });
  const maxCost = filtered.reduce((m, s) => Math.max(m, s.cost), 0);
  const step = bucketStep(maxCost);
  const ceiling = Math.ceil(maxCost / step) * step;
  const N = Math.ceil(ceiling / step);
  const buckets = Array.from({ length: N }, (_, i) => {
    const min = i * step;
    const max = (i + 1) * step;
    const isLast = i === N - 1;
    return {
      label: isLast ? `> ${fmtCost(min)}` : `${fmtCost(min)}–${fmtCost(max)}`,
      min,
      max: isLast ? Infinity : max,
      count: 0,
    };
  });
  for (const s of filtered) {
    for (const b of buckets) {
      if (s.cost >= b.min && s.cost < b.max) {
        b.count++;
        break;
      }
    }
  }
  return Response.json({ buckets: buckets.map(({ label, count }) => ({ label, count })) });
}

function bucketStep(maxCost: number): number {
  if (maxCost <= 1) return 0.1;
  if (maxCost <= 5) return 0.5;
  if (maxCost <= 10) return 1;
  if (maxCost <= 20) return 2;
  if (maxCost <= 50) return 5;
  if (maxCost <= 100) return 10;
  if (maxCost <= 200) return 20;
  if (maxCost <= 500) return 50;
  return 100;
}

function fmtCost(n: number): string {
  if (n >= 10) return `$${Math.round(n)}`;
  if (n >= 1) return `$${n.toFixed(1).replace(/\.0$/, "")}`;
  return `$${n.toFixed(2)}`;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
