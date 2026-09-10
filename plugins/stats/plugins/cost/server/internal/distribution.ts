// Log-spaced cost histogram. Per-conversation cost spans five orders of
// magnitude ($0.01 → $1k+), so equal-width buckets pile nearly everything into
// the first bar. Edges follow the 1-2-5 ladder ($0.01, $0.02, $0.05, $0.1, …,
// $500, $1k) so every decade gets the same width and the labels stay round.

const MANTISSAS = [1, 2, 5] as const;

// Below one cent there is nothing to tell apart; those (including $0
// conversations) share a single leading bucket.
const FLOOR = 0.01;

export interface CostBucket {
  label: string;
  count: number;
}

export function logCostBuckets(costs: readonly number[]): CostBucket[] {
  const priced = costs.filter((c) => c >= FLOOR);
  const buckets: CostBucket[] = [];
  const belowFloor = costs.length - priced.length;
  if (belowFloor > 0)
    buckets.push({ label: `< $${fmtEdge(FLOOR)}`, count: belowFloor });
  if (priced.length === 0) return buckets;

  const min = priced.reduce((m, c) => Math.min(m, c), Infinity);
  const max = priced.reduce((m, c) => Math.max(m, c), 0);
  const edges = ladder(min, max);
  const counts = new Array<number>(edges.length - 1).fill(0);
  for (const c of priced) {
    let i = edges.length - 2;
    while (edges[i]! > c) i--;
    counts[i]!++;
  }
  // Empty buckets in the middle are kept: a histogram with gaps squeezed out
  // would misstate the shape.
  for (let i = 0; i < counts.length; i++) {
    buckets.push({
      label: `$${fmtEdge(edges[i]!)}–${fmtEdge(edges[i + 1]!)}`,
      count: counts[i]!,
    });
  }
  return buckets;
}

// 1-2-5 edges from the largest one ≤ min to the smallest one > max.
function ladder(min: number, max: number): number[] {
  const edges: number[] = [];
  // One decade of slack: log10 can round up across an integer (log10 of a
  // value just under 1000 → 3), which would start the ladder above `min`.
  for (let exp = Math.floor(Math.log10(min)) - 1; ; exp++) {
    for (const m of MANTISSAS) {
      // Dividing by a whole power of ten keeps 0.02 / 0.05 exact-printing.
      const edge = exp < 0 ? m / 10 ** -exp : m * 10 ** exp;
      if (edge <= min) edges.length = 0;
      edges.push(edge);
      if (edge > max) return edges;
    }
  }
}

function fmtEdge(n: number): string {
  return n >= 1000 ? `${n / 1000}k` : String(n);
}
