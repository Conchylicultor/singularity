import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  MASTERY_WINDOW,
  type MasteryStanding,
} from "@plugins/apps/plugins/chord/plugins/progress/core";

// ── How often each practised chord turns up ──────────────────────────────────
//
// No loop is chosen for one target chord. Each practised chord has a DESIRED
// share of the loops — high while it is new, low once mastered, never zero —
// and each next loop is the one, among a pool the server returned, that brings
// the shares observed over the last loops closest to the desired ones. The
// chords the catalog does not list (answered by the Rare joker) count as one
// chord, "rare", with one pooled standing.

/** A practised chord's share of loops while it has no answers. */
export const NEW_SHARE = 0.5;
/** A practised chord's share once mastered: it keeps turning up, less often. */
export const MASTERED_SHARE = 0.15;
/** How many of the last dealt loops the observed share is read over. */
export const SHARE_HISTORY = 20;
/**
 * Loops of prior, each at the desired share, added to the history: the first
 * loops of a session are not judged on one or two draws.
 */
export const PRIOR_LOOPS = 5;

/** A chord whose share is tracked: a listed practised chord, or the pooled rare ones. */
export type ShareKey = ChordToken | "rare";

/**
 * The share of loops a practised chord should be in: `NEW_SHARE` with no
 * answers, falling linearly to `MASTERED_SHARE` as `answers / 20 × accuracy`
 * grows, and `MASTERED_SHARE` once mastered. A missing standing (not loaded,
 * never answered) is new.
 */
export function desiredShare(
  standing: Pick<MasteryStanding, "answers" | "accuracy" | "mastered"> | null,
): number {
  if (standing === null || standing.answers === 0) return NEW_SHARE;
  if (standing.mastered) return MASTERED_SHARE;
  const progress =
    Math.min(1, standing.answers / MASTERY_WINDOW) * (standing.accuracy ?? 0);
  return NEW_SHARE - (NEW_SHARE - MASTERED_SHARE) * progress;
}

/** What each tracked chord should get: a share per listed practised chord, and one for the rare ones together. */
export type DesiredShares = {
  byChord: ReadonlyMap<ChordToken, number>;
  /** The practised chords no track lists, and their pooled share. Null when none is practised. */
  rare: { tokens: ReadonlySet<ChordToken>; share: number } | null;
};

/** The tracked chords one loop holds: its listed practised chords, and "rare" once for any rare one. */
export function loopShareKeys(
  tokens: readonly ChordToken[],
  desired: DesiredShares,
): ShareKey[] {
  const keys = new Set<ShareKey>();
  for (const token of tokens) {
    if (desired.byChord.has(token)) keys.add(token);
    else if (desired.rare?.tokens.has(token) === true) keys.add("rare");
  }
  return [...keys];
}

function desiredOf(desired: DesiredShares): Map<ShareKey, number> {
  const all = new Map<ShareKey, number>(desired.byChord);
  if (desired.rare !== null) all.set("rare", desired.rare.share);
  return all;
}

/** How many of the recent loops held each key, and how many loops that is. */
function tally(
  history: readonly (readonly ChordToken[])[],
  desired: DesiredShares,
): { counts: Map<ShareKey, number>; loops: number } {
  const recent = history.slice(-SHARE_HISTORY);
  const counts = new Map<ShareKey, number>();
  for (const tokens of recent) {
    for (const key of loopShareKeys(tokens, desired)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return { counts, loops: recent.length };
}

/**
 * Each tracked chord's observed share over the last `SHARE_HISTORY` dealt loops
 * (oldest first, as dealt), with `PRIOR_LOOPS` loops of prior at its desired
 * share.
 */
export function observedShares(
  history: readonly (readonly ChordToken[])[],
  desired: DesiredShares,
): Map<ShareKey, number> {
  const { counts, loops } = tally(history, desired);
  const shares = new Map<ShareKey, number>();
  for (const [key, want] of desiredOf(desired)) {
    shares.set(
      key,
      ((counts.get(key) ?? 0) + PRIOR_LOOPS * want) / (loops + PRIOR_LOOPS),
    );
  }
  return shares;
}

/**
 * The tracked chords furthest below their desired share, largest gap first —
 * what the trainer asks focused batches for, so the pool has loops holding
 * them. Only chords below their share are returned.
 */
export function shareDeficits(
  history: readonly (readonly ChordToken[])[],
  desired: DesiredShares,
): { key: ShareKey; deficit: number }[] {
  const observed = observedShares(history, desired);
  return [...desiredOf(desired)]
    .map(([key, want]) => ({ key, deficit: want - (observed.get(key) ?? 0) }))
    .filter((d) => d.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit);
}

/**
 * The next loop: the one in `pool` that, once dealt, leaves the observed shares
 * closest to the desired ones (the least sum of squared gaps). Ties are broken
 * by `random` (`Math.random` by default), so equal loops do not always come in
 * the server's order. Throws on an empty pool.
 */
export function pickNext<
  T extends { window: { chordTokens: readonly ChordToken[] } },
>(
  pool: readonly T[],
  history: readonly (readonly ChordToken[])[],
  desired: DesiredShares,
  random: () => number = Math.random,
): T {
  if (pool.length === 0) throw new Error("pickNext: the pool is empty");
  const { counts, loops } = tally(history, desired);
  const want = desiredOf(desired);
  const total = loops + PRIOR_LOOPS + 1;
  const gap = (candidate: T): number => {
    const holds = new Set(loopShareKeys(candidate.window.chordTokens, desired));
    let sum = 0;
    for (const [key, share] of want) {
      const after =
        ((counts.get(key) ?? 0) +
          PRIOR_LOOPS * share +
          (holds.has(key) ? 1 : 0)) /
        total;
      sum += (after - share) ** 2;
    }
    return sum;
  };
  const scored = pool.map((candidate) => ({ candidate, gap: gap(candidate) }));
  const best = Math.min(...scored.map((s) => s.gap));
  const tied = scored.filter((s) => s.gap - best < 1e-12);
  const pick = tied[Math.floor(random() * tied.length)] ?? tied[0];
  if (pick === undefined)
    throw new Error("unreachable: a non-empty pool has a best loop");
  return pick.candidate;
}
