import { describe, expect, test } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { maxRank, planSiblingRanks } from "./ranks";

const between = (a: string | null, b: string | null): string =>
  Rank.between(a === null ? null : Rank.from(a), b === null ? null : Rank.from(b)).toJSON();

const nBetween = (a: string | null, b: string | null, n: number): string[] =>
  Rank.nBetween(a === null ? null : Rank.from(a), b === null ? null : Rank.from(b), n).map((r) =>
    r.toJSON(),
  );

const increasing = (ranks: readonly string[]): boolean =>
  ranks.every((r, i) => i === 0 || Rank.compare(Rank.from(ranks[i - 1]!), Rank.from(r)) < 0);

// ---------------------------------------------------------------------------
// Without obstacles: the minimal-writes contract, unchanged
// ---------------------------------------------------------------------------

describe("planSiblingRanks (no reserved ranks)", () => {
  test("an all-new list is one evenly-spaced mint", () => {
    expect(planSiblingRanks([null, null, null])).toEqual(nBetween(null, null, 3));
  });

  test("an already-ordered list is kept byte-for-byte", () => {
    const rows = nBetween(null, null, 4);
    expect(planSiblingRanks(rows)).toEqual(rows);
  });

  test("one out-of-place element is the only one re-ranked", () => {
    const [a, b, c] = nBetween(null, null, 3) as [string, string, string];
    // Desired order c, a, b: the longest increasing subsequence is (a, b), so
    // only `c` moves — into the open end below `a`.
    const out = planSiblingRanks([c, a, b]);
    expect(out.slice(1)).toEqual([a, b]);
    expect(increasing(out)).toBe(true);
  });

  test("an omitted `reserved` and an empty one are the same call", () => {
    const [a, b] = nBetween(null, null, 2) as [string, string];
    expect(planSiblingRanks([a, null, b, null])).toEqual(planSiblingRanks([a, null, b, null], []));
  });
});

// ---------------------------------------------------------------------------
// T1 — the deterministic midpoint IS the hidden row's key
// ---------------------------------------------------------------------------

describe("planSiblingRanks (reserved ranks)", () => {
  test("an insert between A and B does not mint the hidden row's key", () => {
    const [a, b] = nBetween(null, null, 2) as [string, string];
    // How `P` got there in the first place: a `/private-notes` card inserted
    // between A and B by an ordinary gesture holds exactly this key.
    const p = between(a, b);

    // Without the obstacle set this is the collision the whole fix exists for —
    // asserted, so the regression is impossible to reintroduce silently.
    expect(planSiblingRanks([a, null, b])[1]).toBe(p);

    const out = planSiblingRanks([a, null, b], [p]);
    expect(out[1]).not.toBe(p);
    expect(increasing(out)).toBe(true);
    expect(increasing([a, p, out[1]!, b])).toBe(true); // lands AFTER the hidden row
    expect([out[0], out[2]]).toEqual([a, b]); // survivors untouched
  });

  test("several hidden rows in one run are all stepped around", () => {
    const [a, b] = nBetween(null, null, 2) as [string, string];
    const p1 = between(a, b);
    const p2 = between(p1, b);
    const p3 = between(a, p1);

    const out = planSiblingRanks([a, null, b], [p1, p2, p3]);
    expect(increasing(out)).toBe(true);
    for (const p of [p1, p2, p3]) expect(out).not.toContain(p);
    expect(increasing([a, p3, p1, p2, out[1]!, b])).toBe(true);
  });

  test("hidden rows outside the run change nothing", () => {
    const [a, b, c, d] = nBetween(null, null, 4) as [string, string, string, string];
    // Both obstacles sit outside `(b, c)`, the only interval being minted into.
    const far = [between(a, b), between(c, d)];
    expect(planSiblingRanks([b, null, c], far)).toEqual(planSiblingRanks([b, null, c]));
  });

  test("more movers than sub-intervals: the run stays contiguous above them", () => {
    const [a, b] = nBetween(null, null, 2) as [string, string];
    const p1 = between(a, b);
    const p2 = between(a, p1); // two obstacles, three sub-intervals, three movers

    const out = planSiblingRanks([a, null, null, null, b], [p1, p2]);
    expect(increasing(out)).toBe(true);
    // The whole run lands above the LAST obstacle, in document order — nothing
    // of the human's is wedged between two blocks the agent wrote as a unit.
    expect(increasing([a, p2, p1, out[1]!, out[2]!, out[3]!, b])).toBe(true);
    expect([out[0], out[4]]).toEqual([a, b]); // survivors untouched
  });

  test("the open ends are obstacle-aware too", () => {
    const [a, b] = nBetween(null, null, 2) as [string, string];
    const low = between(null, a); // hidden row before everything the document has
    const high = between(b, null); // hidden row after everything

    const out = planSiblingRanks([null, a, b, null], [low, high]);
    expect(increasing(out)).toBe(true);
    expect(out).not.toContain(low);
    expect(out).not.toContain(high);
    expect(increasing([low, out[0]!, a])).toBe(true);
    expect(increasing([b, high, out[3]!])).toBe(true);
  });

  test("a duplicated reserved rank is the same obstacle", () => {
    const [a, b] = nBetween(null, null, 2) as [string, string];
    const p = between(a, b);
    expect(planSiblingRanks([a, null, b], [p, p, p])).toEqual(planSiblingRanks([a, null, b], [p]));
  });
});

// ---------------------------------------------------------------------------
// Fuzz — the two properties that make the fix total
// ---------------------------------------------------------------------------

/** Mulberry32 — deterministic, so a failure is reproducible from its seed. */
const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * A live sibling list built the way a real one accumulates — by repeatedly
 * inserting BETWEEN two neighbours. That history is what makes the deterministic
 * midpoints collide, so a fuzz over `nBetween`-spaced keys alone would never
 * reproduce T1.
 */
function liveSiblings(r: () => number, count: number): string[] {
  const live = nBetween(null, null, 2);
  while (live.length < count) {
    const at = Math.floor(r() * (live.length + 1));
    const prev = at === 0 ? null : live[at - 1]!;
    const next = at === live.length ? null : live[at]!;
    live.splice(at, 0, between(prev, next));
  }
  return live;
}

/**
 * The `[lowest, highest]` rank of each maximal consecutive stretch of MINTED
 * entries — a stretch the caller writes as one contiguous block of document
 * order. An entry that came back byte-identical to its `existing` counterpart is
 * a survivor, so it ends the stretch.
 */
function mintedRuns(
  out: readonly string[],
  existing: readonly (string | null)[],
): [string, string][] {
  const runs: [string, string][] = [];
  let start: number | null = null;
  for (let i = 0; i <= out.length; i++) {
    const minted = i < out.length && out[i] !== existing[i];
    if (minted && start === null) start = i;
    if (!minted && start !== null) {
      if (i - start > 1) runs.push([out[start]!, out[i - 1]!]);
      start = null;
    }
  }
  return runs;
}

describe("fuzz: a minted rank is never a reserved one", () => {
  test("over 500 seeds", () => {
    // A contiguity law nothing exercises is a law about nothing, so the seeds
    // have to actually produce multi-mint runs — asserted at the end.
    let multiMintRuns = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const r = rng(seed);
      const live = liveSiblings(r, 2 + Math.floor(r() * 8));

      // Redaction splits the live list; the document only ever saw `visible`.
      const reserved: string[] = [];
      const visible: string[] = [];
      for (const rank of live) (r() < 0.35 ? reserved : visible).push(rank);

      // What the incoming document asks for: the visible rows, occasionally
      // reordered (movers), with new blocks (null) dropped in between.
      const wanted: (string | null)[] = [...visible];
      for (let swaps = Math.floor(r() * 3); swaps > 0; swaps--) {
        if (wanted.length < 2) break;
        const i = Math.floor(r() * wanted.length);
        const j = Math.floor(r() * wanted.length);
        [wanted[i], wanted[j]] = [wanted[j]!, wanted[i]!];
      }
      for (let inserts = Math.floor(r() * 4); inserts > 0; inserts--) {
        wanted.splice(Math.floor(r() * (wanted.length + 1)), 0, null);
      }

      const out = planSiblingRanks(wanted, reserved);
      const collided = out.filter((rank) => reserved.includes(rank));
      expect({ seed, collided }).toEqual({ seed, collided: [] });
      expect({ seed, increasing: increasing(out) }).toEqual({ seed, increasing: true });
      expect({ seed, length: out.length }).toEqual({ seed, length: wanted.length });
      // Obstacles must not cost writes that the minimality contract wouldn't
      // otherwise charge: a longest increasing subsequence of the survivors is
      // still kept byte-for-byte, so at least one survivor never moves.
      const untouched = out.filter((rank, i) => rank === wanted[i]).length;
      expect({ seed, atLeastOneKept: untouched >= Math.min(1, visible.length) }).toEqual({
        seed,
        atLeastOneKept: true,
      });

      // Contiguity as a law rather than a case: no hidden row ever ends up
      // strictly between two ranks minted for the same run, i.e. a sequence the
      // document authored as a unit is never split around one.
      for (const [lo, hi] of mintedRuns(out, wanted)) {
        multiMintRuns += 1;
        const wedged = reserved.filter(
          (hidden) =>
            Rank.compare(Rank.from(lo), Rank.from(hidden)) < 0 &&
            Rank.compare(Rank.from(hidden), Rank.from(hi)) < 0,
        );
        expect({ seed, lo, hi, wedged }).toEqual({ seed, lo, hi, wedged: [] });
      }
    }
    expect(multiMintRuns).toBeGreaterThan(100);
  });
});

describe("maxRank", () => {
  test("null when empty, the greatest otherwise", () => {
    expect(maxRank([])).toBeNull();
    const rows = nBetween(null, null, 3);
    expect(maxRank([rows[1]!, rows[2]!, rows[0]!])?.toJSON()).toBe(rows[2]!);
  });
});
