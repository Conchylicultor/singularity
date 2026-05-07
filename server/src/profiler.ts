export type PhaseId =
  | "register"
  | "awaitPgReady"
  | "runMigrations"
  | "routePopulation"
  | "socketBind"
  | "onReady";

export interface Span {
  id: string;
  phase: PhaseId;
  plugin?: string;
  label: string;
  startMs: number;
  durationMs: number;
}

const bootStart = performance.now();
const spans: Span[] = [];
const idCounts = new Map<string, number>();

export function profilerStart(
  id: string,
  phase: PhaseId,
  label: string,
  plugin?: string,
): () => void {
  const count = idCounts.get(id) ?? 0;
  idCounts.set(id, count + 1);
  const uniqueId = count === 0 ? id : `${id}:${count}`;
  const t0 = performance.now();
  return () => {
    spans.push({
      id: uniqueId,
      phase,
      plugin,
      label,
      startMs: Math.round(t0 - bootStart),
      durationMs: Math.round(performance.now() - t0),
    });
  };
}

export function getProfilingData(): { spans: Span[]; totalDurationMs: number } {
  const totalDurationMs =
    spans.length === 0
      ? 0
      : Math.max(...spans.map((s) => s.startMs + s.durationMs));
  return { spans, totalDurationMs };
}
