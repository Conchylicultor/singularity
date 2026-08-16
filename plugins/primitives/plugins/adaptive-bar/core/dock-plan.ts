/**
 * Turning one dock order into another with the fewest DOM moves.
 *
 * Every move is destructive in a way React cannot see: re-parenting a node
 * releases pointer capture, drops an open popover out of the top layer, resets
 * inner scroll offsets, restarts CSS transitions and (without `moveBefore`)
 * blows away focus. So the property that matters is not "the result is right" —
 * any plan gets that — but "a node already in the right place is never touched".
 * A resize that reshuffles one widget must leave the other six alone, and an
 * order that did not change at all must plan ZERO moves.
 *
 * That is exactly a longest-increasing-subsequence problem: the items that can
 * stay put are the longest subsequence already in the target's relative order,
 * and everything else must move. LIS is O(n log n).
 */

/**
 * One move: put `id` immediately before `beforeId`, or at the end of the dock
 * when `beforeId` is `null`.
 *
 * The list is in APPLICATION order and must be applied in that order — each
 * move anchors against a node the previous moves already put in place. The
 * caller must first remove every node that is not in `wantIds`; `beforeId:
 * null` means "append", which is only the right place once the strays are gone.
 */
export interface DockMove {
  id: string;
  beforeId: string | null;
}

export function planMoves(
  currentIds: readonly string[],
  wantIds: readonly string[],
): DockMove[] {
  // A duplicate id makes "where is this node" unanswerable, and the resulting
  // plan would silently move the wrong element. Fail loudly instead: an item id
  // collision in a bar is a bug in the host, not a layout condition to survive.
  assertUnique(currentIds, "currentIds");
  assertUnique(wantIds, "wantIds");

  const wantIndex = new Map<string, number>();
  wantIds.forEach((id, i) => wantIndex.set(id, i));

  // The ids present in both, in the order they appear in the dock today. Their
  // target positions are the sequence we look for an increasing run in.
  const commonTargets: number[] = [];
  for (const id of currentIds) {
    const at = wantIndex.get(id);
    if (at !== undefined) commonTargets.push(at);
  }

  const staying = new Set<string>();
  for (const at of longestIncreasingSubsequence(commonTargets)) {
    staying.add(wantIds[at]!);
  }

  // Walk the target order right to left, tracking the nearest node to the right
  // that is already where it belongs. Anything not staying is inserted directly
  // before it — which is why the plan can be applied in exactly this order: the
  // suffix is always correct by the time we anchor against it.
  const moves: DockMove[] = [];
  let anchor: string | null = null;
  for (let i = wantIds.length - 1; i >= 0; i--) {
    const id = wantIds[i]!;
    if (!staying.has(id)) moves.push({ id, beforeId: anchor });
    anchor = id;
  }
  return moves;
}

function assertUnique(ids: readonly string[], label: string): void {
  if (new Set(ids).size === ids.length) return;
  throw new Error(`adaptive-bar: duplicate item id in ${label}`);
}

/**
 * Indices (into `values`' own value space) of one longest increasing
 * subsequence — patience sorting with parent pointers, O(n log n).
 *
 * Returns the VALUES of the subsequence (target positions), not positions in
 * `values`, because the caller cares about which target slots stay put.
 */
function longestIncreasingSubsequence(values: readonly number[]): number[] {
  if (values.length === 0) return [];

  // tails[k] = index into `values` of the smallest tail of an increasing
  // subsequence of length k+1. parent[i] = the index preceding i in the best
  // subsequence ending at i.
  const tails: number[] = [];
  const parent = new Array<number>(values.length).fill(-1);

  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]!]! < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) parent[i] = tails[lo - 1]!;
    tails[lo] = i;
  }

  const out: number[] = [];
  let at = tails[tails.length - 1]!;
  while (at !== -1) {
    out.push(values[at]!);
    at = parent[at]!;
  }
  return out.reverse();
}
