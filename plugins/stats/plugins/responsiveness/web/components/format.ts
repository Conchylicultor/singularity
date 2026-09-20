/** A duration the way a person says it: `7 ms`, `840 ms`, `2.4 s`, `1 min 12 s`. */
export function formatMs(ms: number | null): string {
  if (ms === null) return "–";
  if (ms < 1) return "<1 ms";
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const min = Math.floor(ms / 60_000);
  return `${min} min ${Math.round((ms - min * 60_000) / 1_000)} s`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatShare(share: number): string {
  const pct = share * 100;
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
}
