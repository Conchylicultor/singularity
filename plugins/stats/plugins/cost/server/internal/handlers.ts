import type { DailyUsage } from "ccusage/data-loader";
import { canonicalModel, getBundleTiming, loadBundle, parseScope, type PerSession, type Scope } from "./load-usage";
import { MODEL_REGISTRY } from "@plugins/conversations/plugins/model-provider/core";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";

function modelFamily(canonical: string): string {
  const meta = MODEL_REGISTRY[canonical as ConversationModel];
  return meta ? meta.family : (canonical.split("-")[0] ?? canonical);
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
  const t0 = performance.now();
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
  return withCostTiming(Response.json({ points, models }), Math.round(performance.now() - t0));
}

interface CumulativePoint {
  date: string;
  cost: number;
}

export async function handleCumulative(req: Request): Promise<Response> {
  const t0 = performance.now();
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
  return withCostTiming(Response.json({ points }), Math.round(performance.now() - t0));
}

interface TokenMixPoint {
  date: string;
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export async function handleTokenMix(req: Request): Promise<Response> {
  const t0 = performance.now();
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
  return withCostTiming(Response.json({ points }), Math.round(performance.now() - t0));
}

export async function handleTotals(req: Request): Promise<Response> {
  const t0 = performance.now();
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
  return withCostTiming(Response.json({
    totalCost: roundCents(totalCost),
    totalTokens: input + output + cacheCreation + cacheRead,
    byTokenKind: { input, output, cacheCreation, cacheRead },
    last7Cost: roundCents(last7Cost),
    avgDailyCost: roundCents(avgDailyCost),
    activeDays,
    sessionCount: sessRows.length,
  }), Math.round(performance.now() - t0));
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
  const t0 = performance.now();
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
  return withCostTiming(Response.json({ rows }), Math.round(performance.now() - t0));
}

// Session count per day per model family (not cost).
export async function handleDailyByFamily(req: Request): Promise<Response> {
  const t0 = performance.now();
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
  return withCostTiming(Response.json({ points, families }), Math.round(performance.now() - t0));
}

// Dynamic buckets scaled to the actual cost range.
export async function handleDistribution(req: Request): Promise<Response> {
  const t0 = performance.now();
  const scope = parseScope(req);
  const { sessions } = await loadBundle();
  const filtered = filterSessions(sessions, scope);
  if (filtered.length === 0) return withCostTiming(Response.json({ buckets: [] }), Math.round(performance.now() - t0));
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
  return withCostTiming(Response.json({ buckets: buckets.map(({ label, count }) => ({ label, count })) }), Math.round(performance.now() - t0));
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

interface FamilyData {
  cost: number;
  tokens: number;
}

interface DayData {
  totalCost: number;
  totalTokens: number;
  count: number;
  byFamily: Map<string, FamilyData>;
}

export async function handleAvgPerConversation(
  req: Request,
): Promise<Response> {
  const t0 = performance.now();
  const scope = parseScope(req);
  const { sessions } = await loadBundle();
  const filtered = filterSessions(sessions, scope);

  const allFamilies = new Set<string>();
  const byDate = new Map<string, DayData>();

  for (const s of filtered) {
    const date = s.lastActivity.slice(0, 10);
    if (!date) continue;
    if (!byDate.has(date)) {
      byDate.set(date, {
        totalCost: 0,
        totalTokens: 0,
        count: 0,
        byFamily: new Map(),
      });
    }
    const day = byDate.get(date)!;
    day.totalCost += s.cost;
    day.totalTokens += s.totalTokens;
    day.count += 1;

    // Split cost/tokens evenly across model families used in this session
    const families = [
      ...new Set(s.modelsUsed.map((m) => modelFamily(canonicalModel(m)))),
    ];
    if (families.length === 0) continue;
    const share = 1 / families.length;
    for (const fam of families) {
      allFamilies.add(fam);
      const f = day.byFamily.get(fam) ?? { cost: 0, tokens: 0 };
      f.cost += s.cost * share;
      f.tokens += s.totalTokens * share;
      day.byFamily.set(fam, f);
    }
  }

  const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const families = [...allFamilies].sort();

  const points = sorted.map(([date, day], i) => {
    const avgCost = day.count > 0 ? roundCents(day.totalCost / day.count) : 0;
    const avgTokens =
      day.count > 0 ? Math.round(day.totalTokens / day.count) : 0;

    // 7-day rolling window (weighted by session count, not simple avg of avgs)
    const win = sorted.slice(Math.max(0, i - 6), i + 1);
    const wCost = win.reduce((acc, [, d]) => acc + d.totalCost, 0);
    const wTokens = win.reduce((acc, [, d]) => acc + d.totalTokens, 0);
    const wCount = win.reduce((acc, [, d]) => acc + d.count, 0);
    const rolling7Cost = wCount > 0 ? roundCents(wCost / wCount) : null;
    const rolling7Tokens = wCount > 0 ? Math.round(wTokens / wCount) : null;

    const byFamily: Record<string, { avgCost: number; avgTokens: number }> = {};
    const rolling7ByFamily: Record<
      string,
      { cost: number | null; tokens: number | null }
    > = {};
    for (const fam of families) {
      const f = day.byFamily.get(fam) ?? { cost: 0, tokens: 0 };
      byFamily[fam] = {
        avgCost: day.count > 0 ? roundCents(f.cost / day.count) : 0,
        avgTokens: day.count > 0 ? Math.round(f.tokens / day.count) : 0,
      };
      const wFamCost = win.reduce(
        (acc, [, d]) => acc + (d.byFamily.get(fam)?.cost ?? 0),
        0,
      );
      const wFamTokens = win.reduce(
        (acc, [, d]) => acc + (d.byFamily.get(fam)?.tokens ?? 0),
        0,
      );
      rolling7ByFamily[fam] = {
        cost: wCount > 0 ? roundCents(wFamCost / wCount) : null,
        tokens: wCount > 0 ? Math.round(wFamTokens / wCount) : null,
      };
    }

    return {
      date,
      avgCost,
      avgTokens,
      sessionCount: day.count,
      byFamily,
      rolling7ByFamily,
      rolling7Cost,
      rolling7Tokens,
    };
  });

  return withCostTiming(Response.json({ points, families }), Math.round(performance.now() - t0));
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

function costTimingHeader(handlerMs: number): string {
  const bt = getBundleTiming();
  const parts = [`total;dur=${handlerMs}`];
  if (bt) {
    if (bt.cached) {
      parts.push("bundle;dur=0;desc=\"cached\"");
    } else {
      parts.push(`bundle;dur=${bt.totalMs}`);
      parts.push(`loadDaily;dur=${bt.loadDailyMs}`);
      parts.push(`classify;dur=${bt.classifyMs}`);
      parts.push(`convBySession;dur=${bt.convBySessionMs}`);
      parts.push(`walkSessions;dur=${bt.walkSessionsMs}`);
    }
  }
  return parts.join(", ");
}

function withCostTiming(
  resp: Response,
  handlerMs: number,
): Response {
  resp.headers.set("Server-Timing", costTimingHeader(handlerMs));
  return resp;
}
