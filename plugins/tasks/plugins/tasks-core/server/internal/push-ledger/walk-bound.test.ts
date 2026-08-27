/**
 * `ledgerWalkStart` — the coverage frontier. Pure, so the policy each bound
 * exists for is pinned directly rather than inferred from a DB-backed walk.
 */
import { describe, expect, test } from "bun:test";
import {
  DEFERRAL_HORIZON_MS,
  WATERMARK_PAD_MS,
  ledgerWalkStart,
} from "./walk-bound";

const NOW = new Date("2026-08-27T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("ledgerWalkStart", () => {
  // A bounded first walk would define everything older than the bound as
  // foreign, permanently, on a ledger that has recorded nothing at all.
  test("an empty ledger walks the whole history", () => {
    expect(ledgerWalkStart(null, NOW)).toBeNull();
  });

  // THE regression: the ledger is up to date, so the watermark bound would start
  // the walk an hour ago and never re-offer a commit deferred last week — which
  // an adoption may have made attributable in the meantime.
  test("re-offers a commit deferred long after the ledger's newest row", () => {
    const since = ledgerWalkStart(ago(60 * 60 * 1000), NOW);
    expect(since).toEqual(new Date(NOW.getTime() - DEFERRAL_HORIZON_MS));
  });

  // The catch-up half: a backend down for a month is behind the horizon, and the
  // horizon alone would leave the gap between its watermark and 30 days ago
  // unwalked.
  test("a ledger a month behind starts from its own high-water mark", () => {
    const newest = ago(45 * 24 * 60 * 60 * 1000);
    expect(ledgerWalkStart(newest, NOW)).toEqual(
      new Date(newest.getTime() - WATERMARK_PAD_MS),
    );
  });

  // Where the two bounds coincide, either answer is the same instant — pinned so
  // a future change to the ramp cannot slide the boundary unnoticed.
  test("the two bounds meet at one instant", () => {
    const newest = new Date(
      NOW.getTime() - DEFERRAL_HORIZON_MS + WATERMARK_PAD_MS,
    );
    expect(ledgerWalkStart(newest, NOW)).toEqual(
      new Date(NOW.getTime() - DEFERRAL_HORIZON_MS),
    );
  });
});
